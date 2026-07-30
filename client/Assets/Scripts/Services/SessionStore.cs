using UnityEngine;

namespace Siegebreak.Services
{
    /// <summary>
    /// Holds the player's auth tokens for the session and persists them across
    /// launches via PlayerPrefs, mirroring the web client's localStorage session.
    /// The access token is short-lived (15m); the refresh token (30d) lets the
    /// HTTP layer transparently re-issue a fresh pair on a 401.
    /// </summary>
    public static class SessionStore
    {
        private const string AccessKey = "sb.accessToken";
        private const string RefreshKey = "sb.refreshToken";

        public static string AccessToken { get; private set; }
        public static string RefreshToken { get; private set; }

        static SessionStore()
        {
            AccessToken = PlayerPrefs.GetString(AccessKey, null);
            RefreshToken = PlayerPrefs.GetString(RefreshKey, null);
        }

        public static bool IsAuthenticated =>
            !string.IsNullOrEmpty(AccessToken) && !string.IsNullOrEmpty(RefreshToken);

        public static void SetTokens(string accessToken, string refreshToken)
        {
            AccessToken = accessToken;
            RefreshToken = refreshToken;
            PlayerPrefs.SetString(AccessKey, accessToken ?? string.Empty);
            PlayerPrefs.SetString(RefreshKey, refreshToken ?? string.Empty);
            PlayerPrefs.Save();
        }

        public static void Clear()
        {
            AccessToken = null;
            RefreshToken = null;
            PlayerPrefs.DeleteKey(AccessKey);
            PlayerPrefs.DeleteKey(RefreshKey);
            PlayerPrefs.Save();
        }
    }
}

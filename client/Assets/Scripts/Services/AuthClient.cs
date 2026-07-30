using System.Threading.Tasks;
using UnityEngine;

namespace Siegebreak.Services
{
    /// <summary>
    /// HTTP client for the backend `auth` module. On a successful login the
    /// issued token pair is stored in <see cref="SessionStore"/>, so every
    /// subsequent authenticated call picks them up automatically.
    /// </summary>
    public class AuthClient
    {
        /// <summary>
        /// Device-bound guest login — the F2P entry point. Reuses the platform's
        /// stable device id so relaunching returns the same Player row. Returns
        /// true on success.
        /// </summary>
        public async Task<bool> LoginGuest()
        {
            string deviceId = ResolveDeviceId();
            string body = HttpApi.JsonUtilityBody(new GuestLoginRequest { deviceId = deviceId });
            var res = await HttpApi.PostAsync<AuthTokens>("/auth/guest", body, auth: false);
            return Store(res);
        }

        public async Task<bool> LoginApple(string identityToken)
        {
            string body = HttpApi.JsonUtilityBody(new AppleLoginRequest { identityToken = identityToken });
            var res = await HttpApi.PostAsync<AuthTokens>("/auth/apple", body, auth: false);
            return Store(res);
        }

        public async Task<bool> LoginGoogle(string idToken)
        {
            string body = HttpApi.JsonUtilityBody(new GoogleLoginRequest { idToken = idToken });
            var res = await HttpApi.PostAsync<AuthTokens>("/auth/google", body, auth: false);
            return Store(res);
        }

        public void Logout() => SessionStore.Clear();

        private static bool Store(ApiResponse<AuthTokens> res)
        {
            if (!res.Success || res.Data == null ||
                string.IsNullOrEmpty(res.Data.accessToken) ||
                string.IsNullOrEmpty(res.Data.refreshToken))
            {
                return false;
            }
            SessionStore.SetTokens(res.Data.accessToken, res.Data.refreshToken);
            return true;
        }

        // deviceUniqueIdentifier is stable per device/install and comfortably
        // satisfies the backend guest schema's >= 8 char rule. Falls back to a
        // persisted GUID if the platform reports it unsupported.
        private static string ResolveDeviceId()
        {
            string id = SystemInfo.deviceUniqueIdentifier;
            if (!string.IsNullOrEmpty(id) && id != SystemInfo.unsupportedIdentifier && id.Length >= 8)
            {
                return id;
            }

            const string key = "sb.deviceId";
            string stored = PlayerPrefs.GetString(key, null);
            if (!string.IsNullOrEmpty(stored)) return stored;

            string generated = System.Guid.NewGuid().ToString("N");
            PlayerPrefs.SetString(key, generated);
            PlayerPrefs.Save();
            return generated;
        }
    }
}

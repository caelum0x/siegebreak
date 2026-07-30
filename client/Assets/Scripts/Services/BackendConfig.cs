namespace Siegebreak.Services
{
    /// <summary>
    /// Central configuration for the backend REST/WS API. The base URL defaults
    /// to the local dev server and can be overridden at boot (e.g. from a build
    /// config or environment) via <see cref="SetBaseUrl"/> before any client is
    /// used. Kept trailing-slash-free so paths concatenate cleanly.
    /// </summary>
    public static class BackendConfig
    {
        private static string _baseUrl = "http://localhost:8080";

        public static string BaseUrl => _baseUrl;

        public static void SetBaseUrl(string url)
        {
            if (string.IsNullOrEmpty(url)) return;
            _baseUrl = url.TrimEnd('/');
        }

        /// <summary>Full URL for an API path (which must start with '/').</summary>
        public static string Url(string path) => _baseUrl + path;

        /// <summary>ws(s):// URL for the matchmaking subscribe socket.</summary>
        public static string WebSocketUrl(string path, string accessToken)
        {
            string wsBase = _baseUrl.StartsWith("https")
                ? "wss" + _baseUrl.Substring("https".Length)
                : "ws" + _baseUrl.Substring("http".Length);
            return wsBase + path + "?token=" + System.Uri.EscapeDataString(accessToken);
        }
    }
}

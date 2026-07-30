using System;
using System.Text;
using System.Threading.Tasks;
using UnityEngine.Networking;

namespace Siegebreak.Services
{
    /// <summary>Outcome of an API call: status, parsed data, and any error.</summary>
    public struct ApiResponse<T>
    {
        public bool Success;
        public long ResponseCode;
        public T Data;
        public string RawBody;
        public string Error;

        public static ApiResponse<T> Fail(long code, string body, string error) =>
            new ApiResponse<T> { Success = false, ResponseCode = code, RawBody = body, Error = error };
    }

    /// <summary>
    /// UnityWebRequest-based HTTP layer for the backend API. Mirrors the web
    /// client's request pipeline: JSON in/out, optional bearer auth, and a
    /// single transparent refresh-and-retry on a 401 for authenticated calls.
    /// All calls are awaitable via a TaskCompletionSource bridge over
    /// SendWebRequest(); they run on Unity's main thread.
    /// </summary>
    public static class HttpApi
    {
        public static Task<ApiResponse<string>> GetRawAsync(string path, bool auth) =>
            SendRawAsync("GET", path, null, auth, allowRefresh: true);

        public static async Task<ApiResponse<T>> GetAsync<T>(string path, bool auth) where T : class
        {
            var raw = await GetRawAsync(path, auth);
            return Parse<T>(raw);
        }

        public static async Task<ApiResponse<T[]>> GetArrayAsync<T>(string path, bool auth)
        {
            var raw = await GetRawAsync(path, auth);
            if (!raw.Success) return ApiResponse<T[]>.Fail(raw.ResponseCode, raw.RawBody, raw.Error);
            T[] items = JsonHelper.FromJsonArray<T>(raw.RawBody);
            return new ApiResponse<T[]>
            {
                Success = true,
                ResponseCode = raw.ResponseCode,
                Data = items,
                RawBody = raw.RawBody,
            };
        }

        public static Task<ApiResponse<string>> PostRawAsync(string path, string jsonBody, bool auth) =>
            SendRawAsync("POST", path, jsonBody, auth, allowRefresh: true);

        public static async Task<ApiResponse<T>> PostAsync<T>(string path, string jsonBody, bool auth)
            where T : class
        {
            var raw = await PostRawAsync(path, jsonBody, auth);
            return Parse<T>(raw);
        }

        // ---- core ----------------------------------------------------------

        private static async Task<ApiResponse<string>> SendRawAsync(
            string method, string path, string jsonBody, bool auth, bool allowRefresh)
        {
            var req = BuildRequest(method, path, jsonBody, auth);
            var res = await SendAsync(req);

            // One transparent refresh + retry for an expired access token.
            if (res.ResponseCode == 401 && auth && allowRefresh && SessionStore.IsAuthenticated)
            {
                bool refreshed = await TryRefreshAsync();
                if (refreshed)
                {
                    var retry = BuildRequest(method, path, jsonBody, auth);
                    res = await SendAsync(retry);
                }
                if (res.ResponseCode == 401)
                {
                    SessionStore.Clear();
                }
            }

            return res;
        }

        private static UnityWebRequest BuildRequest(string method, string path, string jsonBody, bool auth)
        {
            var req = new UnityWebRequest(BackendConfig.Url(path), method)
            {
                downloadHandler = new DownloadHandlerBuffer(),
            };

            if (jsonBody != null)
            {
                byte[] payload = Encoding.UTF8.GetBytes(jsonBody);
                req.uploadHandler = new UploadHandlerRaw(payload);
                req.SetRequestHeader("Content-Type", "application/json");
            }

            if (auth && !string.IsNullOrEmpty(SessionStore.AccessToken))
            {
                req.SetRequestHeader("Authorization", "Bearer " + SessionStore.AccessToken);
            }

            return req;
        }

        private static Task<ApiResponse<string>> SendAsync(UnityWebRequest req)
        {
            var tcs = new TaskCompletionSource<ApiResponse<string>>();
            var op = req.SendWebRequest();
            op.completed += _ =>
            {
                string body = req.downloadHandler != null ? req.downloadHandler.text : null;
                long code = req.responseCode;
                bool ok = code >= 200 && code < 300;

                var result = ok
                    ? new ApiResponse<string>
                    {
                        Success = true,
                        ResponseCode = code,
                        Data = body,
                        RawBody = body,
                    }
                    : ApiResponse<string>.Fail(code, body, req.error ?? "request_failed");

                req.Dispose();
                tcs.SetResult(result);
            };
            return tcs.Task;
        }

        // Refreshes tokens using the stored refresh token. Bare call (auth off,
        // no nested refresh) to avoid recursion.
        private static async Task<bool> TryRefreshAsync()
        {
            if (string.IsNullOrEmpty(SessionStore.RefreshToken)) return false;

            string body = JsonUtilityBody(new RefreshRequest { refreshToken = SessionStore.RefreshToken });
            var res = await SendRawAsync("POST", "/auth/refresh", body, auth: false, allowRefresh: false);
            if (!res.Success) return false;

            AuthTokens tokens = SafeParse<AuthTokens>(res.RawBody);
            if (tokens == null || string.IsNullOrEmpty(tokens.accessToken) ||
                string.IsNullOrEmpty(tokens.refreshToken))
            {
                return false;
            }

            SessionStore.SetTokens(tokens.accessToken, tokens.refreshToken);
            return true;
        }

        // ---- helpers -------------------------------------------------------

        public static string JsonUtilityBody(object obj) => UnityEngine.JsonUtility.ToJson(obj);

        private static ApiResponse<T> Parse<T>(ApiResponse<string> raw) where T : class
        {
            if (!raw.Success) return ApiResponse<T>.Fail(raw.ResponseCode, raw.RawBody, raw.Error);
            T data = SafeParse<T>(raw.RawBody);
            return new ApiResponse<T>
            {
                Success = true,
                ResponseCode = raw.ResponseCode,
                Data = data,
                RawBody = raw.RawBody,
            };
        }

        private static T SafeParse<T>(string json) where T : class
        {
            if (string.IsNullOrEmpty(json)) return null;
            try
            {
                return UnityEngine.JsonUtility.FromJson<T>(json);
            }
            catch (Exception)
            {
                return null;
            }
        }
    }
}

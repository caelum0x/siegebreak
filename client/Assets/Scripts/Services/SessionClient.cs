using System.Threading.Tasks;

namespace Siegebreak.Services
{
    /// <summary>
    /// HTTP client for allocated game sessions. Once matchmaking reports a
    /// session id (via status poll or the realtime push), the client fetches
    /// the full session to learn the room + realtime provider to connect to.
    /// The backend scopes this to participants, so a non-participant/expired id
    /// returns null.
    /// </summary>
    public class SessionClient
    {
        public async Task<GameSession> GetSession(string sessionId)
        {
            if (string.IsNullOrEmpty(sessionId)) return null;
            string path = "/matches/session/" + System.Uri.EscapeDataString(sessionId);
            var res = await HttpApi.GetAsync<GameSession>(path, auth: true);
            return res.Success ? res.Data : null;
        }
    }
}

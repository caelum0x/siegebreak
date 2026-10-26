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

        /// <summary>
        /// Report a finished match's outcome (POST /sessions/:id/complete).
        /// Only the host participant's call is accepted server-side — see
        /// services/src/modules/sessions/index.ts — so this must only ever
        /// be invoked from MatchSimulationController's host branch. Returns
        /// false on any non-2xx response (including an idempotent replay,
        /// which the backend reports as 409); callers should treat that as
        /// "already handled or will be retried", never as a reason to crash
        /// the match-result UI.
        /// </summary>
        public async Task<bool> CompleteMatch(string sessionId, SessionCompleteParticipant[] participants)
        {
            if (string.IsNullOrEmpty(sessionId) || participants == null || participants.Length == 0) return false;
            string path = "/sessions/" + System.Uri.EscapeDataString(sessionId) + "/complete";
            string body = HttpApi.JsonUtilityBody(new SessionCompleteRequest { participants = participants });
            var res = await HttpApi.PostRawAsync(path, body, auth: true);
            return res.Success;
        }
    }
}

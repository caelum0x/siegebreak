using System.Threading.Tasks;

namespace Siegebreak.Services
{
    /// <summary>
    /// HTTP client for the backend `matchmaking` module. Queue/cancel plus a
    /// status read used by the polling fallback; the real-time push is handled
    /// separately by <see cref="MatchSubscription"/>.
    /// </summary>
    public class MatchmakingClient
    {
        /// <summary>Enqueue at the player's rating with the chosen deck.</summary>
        public async Task<bool> QueueForMatch(string deckId)
        {
            string body = HttpApi.JsonUtilityBody(new QueueRequest { deckId = deckId });
            var res = await HttpApi.PostAsync<StatusResponse>("/matchmaking/queue", body, auth: true);
            return res.Success;
        }

        public async Task<bool> CancelQueue()
        {
            var res = await HttpApi.PostRawAsync("/matchmaking/cancel", "{}", auth: true);
            return res.Success;
        }

        /// <summary>
        /// Current ticket. Returns null when the request fails; an empty ticket
        /// (no status) means "not queued". Callers check <c>IsMatched</c> to
        /// know when a session has been allocated.
        /// </summary>
        public async Task<MatchTicket> GetStatus()
        {
            var res = await HttpApi.GetAsync<MatchTicket>("/matchmaking/status", auth: true);
            return res.Success ? res.Data : null;
        }
    }
}

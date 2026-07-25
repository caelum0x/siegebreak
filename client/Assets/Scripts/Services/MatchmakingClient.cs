using System.Threading.Tasks;

namespace Siegebreak.Services
{
    /// <summary>Thin HTTP client for the backend `matchmaking` module.</summary>
    public class MatchmakingClient
    {
        public Task QueueForMatch(string deckId) => throw new System.NotImplementedException();
        public Task CancelQueue() => throw new System.NotImplementedException();
    }
}

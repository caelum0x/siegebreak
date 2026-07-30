using System.Threading.Tasks;

namespace Siegebreak.Services
{
    /// <summary>
    /// HTTP client for player-centric reads: the authenticated profile
    /// (progression + wallet + win/loss record) and recent match history.
    /// </summary>
    public class PlayerClient
    {
        public async Task<PlayerProfile> GetMe()
        {
            var res = await HttpApi.GetAsync<PlayerProfile>("/players/me", auth: true);
            return res.Success ? res.Data : null;
        }

        /// <summary>
        /// Recent matches, newest first. <paramref name="limit"/> is clamped
        /// server-side (max 50); pass 0 to use the server default.
        /// </summary>
        public async Task<MatchHistoryEntry[]> GetMatchHistory(int limit = 0)
        {
            string path = limit > 0 ? "/players/me/matches?limit=" + limit : "/players/me/matches";
            var res = await HttpApi.GetArrayAsync<MatchHistoryEntry>(path, auth: true);
            return res.Success ? res.Data : System.Array.Empty<MatchHistoryEntry>();
        }
    }
}

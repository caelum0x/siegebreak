using System.Collections.Generic;
using UnityEngine;

namespace Siegebreak.Core
{
    public enum MatchResult { InProgress, PlayerAWins, PlayerBWins, Draw }

    /// <summary>
    /// Server-authoritative match orchestration: owns the win-condition
    /// check and the match clock. Elixir, decks, and hero state live in
    /// their own managers per player — this class only asks "is the match
    /// over, and who won."
    /// </summary>
    public class MatchStateController : MonoBehaviour
    {
        [SerializeField] private float matchDurationSeconds = 180f; // 3:00, like CR's regulation time
        [SerializeField] private float overtimeDurationSeconds = 60f;

        [SerializeField] private List<TowerController> playerATowers;
        [SerializeField] private List<TowerController> playerBTowers;

        public MatchResult Result { get; private set; } = MatchResult.InProgress;

        private float _elapsed;
        private bool _inOvertime;

        private void Start()
        {
            foreach (var tower in playerATowers) tower.OnDestroyed += OnTowerDestroyed;
            foreach (var tower in playerBTowers) tower.OnDestroyed += OnTowerDestroyed;
        }

        // Drive this from the server's fixed simulation tick, same cadence
        // as ElixirManager.Tick.
        public void ServerTick(float deltaTime)
        {
            if (Result != MatchResult.InProgress) return;

            _elapsed += deltaTime;

            var kingA = FindKing(playerATowers);
            var kingB = FindKing(playerBTowers);

            if (kingA != null && kingA.IsDestroyed) { Finish(MatchResult.PlayerBWins); return; }
            if (kingB != null && kingB.IsDestroyed) { Finish(MatchResult.PlayerAWins); return; }

            var regulationEnd = matchDurationSeconds;
            var overtimeEnd = matchDurationSeconds + overtimeDurationSeconds;

            if (!_inOvertime && _elapsed >= regulationEnd)
            {
                if (TotalHp(playerATowers) != TotalHp(playerBTowers))
                {
                    Finish(TotalHp(playerATowers) > TotalHp(playerBTowers)
                        ? MatchResult.PlayerAWins
                        : MatchResult.PlayerBWins);
                    return;
                }
                // Tied on tower HP at regulation end — go to overtime,
                // sudden-death on next tower destroyed.
                _inOvertime = true;
            }

            if (_inOvertime && _elapsed >= overtimeEnd)
            {
                Finish(MatchResult.Draw);
            }
        }

        private void OnTowerDestroyed(TowerController tower)
        {
            if (_inOvertime && Result == MatchResult.InProgress)
            {
                // Sudden death: any tower falling in overtime ends the match
                // immediately in favor of whoever didn't lose the tower.
                var attackerWonMatch = playerATowers.Contains(tower) ? MatchResult.PlayerBWins : MatchResult.PlayerAWins;
                Finish(attackerWonMatch);
            }
        }

        private void Finish(MatchResult result)
        {
            Result = result;
            // TODO: notify NetworkBootstrap / backend to record match result
            // (services/src/modules/leaderboard -> recordMatchResult) and
            // trigger the client's MatchResultUI.
        }

        private static TowerController FindKing(List<TowerController> towers)
        {
            foreach (var t in towers)
                if (t.Slot == TowerSlot.King) return t;
            return null;
        }

        private static int TotalHp(List<TowerController> towers)
        {
            var total = 0;
            foreach (var t in towers) total += t.CurrentHp;
            return total;
        }
    }
}

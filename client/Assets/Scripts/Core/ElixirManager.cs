using UnityEngine;

namespace Siegebreak.Core
{
    /// <summary>
    /// Server-authoritative elixir economy. The client runs the same math
    /// purely for predictive UI smoothness; the server value always wins
    /// on reconciliation.
    /// </summary>
    public class ElixirManager : MonoBehaviour
    {
        [SerializeField] private float regenIntervalSeconds = 2.8f;
        [SerializeField] private int maxElixir = 10;

        private float _current;
        private float _regenTimer;

        public int Current => Mathf.FloorToInt(_current);
        public bool CanAfford(int cost) => Current >= cost;

        // Driven by the server simulation tick.
        public void Tick(float deltaTime)
        {
            if (_current >= maxElixir) return;

            _regenTimer += deltaTime;
            if (_regenTimer >= regenIntervalSeconds)
            {
                _regenTimer -= regenIntervalSeconds;
                _current = Mathf.Min(maxElixir, _current + 1);
            }
        }

        public bool TrySpend(int cost)
        {
            if (!CanAfford(cost)) return false;
            _current -= cost;
            return true;
        }
    }
}

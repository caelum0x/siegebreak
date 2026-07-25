using UnityEngine;

namespace Siegebreak.Hero
{
    /// <summary>
    /// One cooldown-gated ability per hero. Cooldown state is mirrored
    /// server-side; the client copy here is predictive only, same pattern
    /// as ElixirManager.
    /// </summary>
    public class HeroAbility : MonoBehaviour
    {
        [SerializeField] private float cooldownSeconds = 8f;
        private float _cooldownRemaining;

        public bool IsReady => _cooldownRemaining <= 0f;

        public void Tick(float deltaTime)
        {
            if (_cooldownRemaining > 0f) _cooldownRemaining -= deltaTime;
        }

        public bool TryActivate()
        {
            if (!IsReady) return false;
            _cooldownRemaining = cooldownSeconds;
            // TODO: send ability-use RPC to server; server resolves effect.
            return true;
        }
    }
}

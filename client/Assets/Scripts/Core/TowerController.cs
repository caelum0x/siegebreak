using System;
using UnityEngine;

namespace Siegebreak.Core
{
    public enum TowerSlot { King, LeftPrincess, RightPrincess }

    /// <summary>
    /// Server-authoritative tower HP + destruction. Auto-units target
    /// towers the same way they target each other (see AutoUnitAI) —
    /// a tower is just an immobile, undying-until-it-isn't unit for
    /// targeting purposes.
    /// </summary>
    public class TowerController : MonoBehaviour
    {
        [SerializeField] private TowerSlot slot;
        [SerializeField] private int maxHp = 2400;
        [SerializeField] private float attackRange = 7f;
        [SerializeField] private int dps = 50;

        public TowerSlot Slot => slot;
        public int CurrentHp { get; private set; }
        public bool IsDestroyed => CurrentHp <= 0;

        public event Action<TowerController> OnDestroyed;

        private void Awake() => CurrentHp = maxHp;

        // Called server-side only. Princess towers unlock the king tower's
        // targeting/aggro once both fall on one side — that coupling lives
        // in MatchStateController, not here; this class only knows about
        // its own HP.
        public void ApplyDamage(int amount)
        {
            if (IsDestroyed) return;

            CurrentHp = Mathf.Max(0, CurrentHp - amount);
            if (CurrentHp == 0)
            {
                OnDestroyed?.Invoke(this);
            }
        }

        public bool IsInRange(Vector3 attackerPosition) =>
            Vector3.Distance(transform.position, attackerPosition) <= attackRange;
    }
}

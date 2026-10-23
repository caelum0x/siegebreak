using System;
using UnityEngine;

namespace Siegebreak.Units
{
    /// <summary>
    /// Server-authoritative troop HP, same shape as
    /// Core/TowerController so combat resolution code (host simulator)
    /// can treat a unit and a tower identically once it has a target's
    /// health component. The client (guest) never calls
    /// <see cref="ApplyDamage"/> directly — it only reconciles
    /// <see cref="CurrentHp"/> from the host's state_snapshot via
    /// <see cref="SyncFromSnapshot"/>.
    /// </summary>
    public class UnitHealth : MonoBehaviour
    {
        [SerializeField] private int maxHp = 100;

        public int MaxHp => maxHp;
        public int CurrentHp { get; private set; }
        public bool IsDestroyed => CurrentHp <= 0;

        public event Action<UnitHealth> OnDestroyed;

        public void Initialize(int startingMaxHp)
        {
            maxHp = startingMaxHp;
            CurrentHp = startingMaxHp;
        }

        // Host-side combat resolution only.
        public void ApplyDamage(int amount)
        {
            if (IsDestroyed) return;
            CurrentHp = Mathf.Max(0, CurrentHp - amount);
            if (CurrentHp == 0) OnDestroyed?.Invoke(this);
        }

        // Guest-side reconciliation: the host already decided the HP, this
        // just mirrors it for rendering (health bars, destroy VFX).
        public void SyncFromSnapshot(int hp)
        {
            var wasDestroyed = IsDestroyed;
            CurrentHp = Mathf.Max(0, hp);
            if (!wasDestroyed && IsDestroyed) OnDestroyed?.Invoke(this);
        }
    }
}

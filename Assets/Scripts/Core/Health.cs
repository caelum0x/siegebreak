using System;
using UnityEngine;

namespace FPClash
{
    /// <summary>Hit points + damage/death events. Shared by units and towers.</summary>
    public class Health : MonoBehaviour
    {
        public float Max { get; private set; } = 100f;
        public float Current { get; private set; } = 100f;
        public bool IsAlive => Current > 0f;
        public float Fraction => Max > 0f ? Mathf.Clamp01(Current / Max) : 0f;

        /// <summary>(amount, source) fired whenever damage is applied to a live target.</summary>
        public event Action<float, object> Damaged;
        /// <summary>(source) fired once when hp reaches zero.</summary>
        public event Action<object> Died;
        /// <summary>fired on Reset/respawn.</summary>
        public event Action Revived;

        public void Configure(float max)
        {
            Max = Mathf.Max(1f, max);
            Current = Max;
        }

        public void ApplyDamage(float amount, object source)
        {
            if (!IsAlive || amount <= 0f) return;
            Current = Mathf.Max(0f, Current - amount);
            Damaged?.Invoke(amount, source);
            if (Current <= 0f)
                Died?.Invoke(source);
        }

        /// <summary>
        /// Restores health, clamped to Max. Mirrors ApplyDamage's guards (ignored
        /// when dead or amount is non-positive). Health bars poll Fraction, so no
        /// explicit refresh event is required.
        /// </summary>
        public void Heal(float amount)
        {
            if (!IsAlive || amount <= 0f) return;
            Current = Mathf.Min(Max, Current + amount);
        }

        public void Revive()
        {
            Current = Max;
            Revived?.Invoke();
        }
    }
}

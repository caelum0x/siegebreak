using System.Collections.Generic;
using UnityEngine;

namespace FPClash
{
    /// <summary>Anything that can be targeted and damaged (units and towers).</summary>
    public interface IDamageable
    {
        Team Team { get; }
        bool IsAlive { get; }
        Transform Transform { get; }
        float TargetRadius { get; }      // horizontal radius used for range checks
        float AimHeight { get; }         // world Y offset projectiles/aim should target
        float HealthFraction { get; }    // 0..1 for health bars
        float BarHeight { get; }         // world Y offset to float the health bar
        void TakeDamage(float amount, object source);
    }

    /// <summary>
    /// Global registry of live combatants so AI / towers can find targets
    /// without scanning the whole scene every frame.
    /// </summary>
    public static class Combatants
    {
        public static readonly List<IDamageable> All = new List<IDamageable>(64);

        public static void Register(IDamageable c)
        {
            if (!All.Contains(c)) All.Add(c);
        }

        public static void Unregister(IDamageable c)
        {
            All.Remove(c);
        }

        /// <summary>Nearest living enemy within maxRange (edge-to-centre distance), or null.</summary>
        public static IDamageable FindNearestEnemy(Team myTeam, Vector3 pos, float maxRange, IDamageable ignore = null)
        {
            IDamageable best = null;
            float bestSqr = float.MaxValue;
            float maxSqr = maxRange * maxRange;
            for (int i = 0; i < All.Count; i++)
            {
                var c = All[i];
                if (c == null || !c.IsAlive) continue;
                if (c.Team == myTeam) continue;
                if (ReferenceEquals(c, ignore)) continue;

                Vector3 d = c.Transform.position - pos;
                d.y = 0f;
                float sqr = d.sqrMagnitude;
                if (sqr <= maxSqr && sqr < bestSqr)
                {
                    bestSqr = sqr;
                    best = c;
                }
            }
            return best;
        }

        public static bool AnyAlive(Team team)
        {
            for (int i = 0; i < All.Count; i++)
                if (All[i] != null && All[i].IsAlive && All[i].Team == team) return true;
            return false;
        }
    }
}

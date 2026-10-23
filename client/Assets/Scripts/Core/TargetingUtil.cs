using System.Collections.Generic;
using UnityEngine;
using Siegebreak.Cards;
using Siegebreak.Units;

namespace Siegebreak.Core
{
    /// <summary>
    /// Host-only nearest-target selection for AutoUnitAI.ServerTick. Kept as
    /// a static helper (not a method on SpawnedUnit or AutoUnitAI) because it
    /// needs the whole live roster to answer "nearest", not just its own
    /// state. No flying units exist yet, so Ground and GroundAndAir share
    /// the same rule: engage the nearest live enemy unit, or go straight for
    /// the nearest enemy tower if no enemy unit is alive. BuildingsOnly
    /// (siege units) skip enemy units entirely.
    /// </summary>
    internal static class TargetingUtil
    {
        public static Transform FindNearestTarget(
            SpawnedUnit unit,
            IReadOnlyCollection<SpawnedUnit> allUnits,
            IReadOnlyList<TowerController> enemyTowers)
        {
            var origin = unit.transform.position;
            var mode = unit.Card != null ? unit.Card.targets : TargetMode.Ground;

            if (mode != TargetMode.BuildingsOnly)
            {
                var nearestUnit = FindNearestEnemyUnit(unit, allUnits, origin);
                if (nearestUnit != null) return nearestUnit.transform;
            }

            return FindNearestAliveTower(enemyTowers, origin);
        }

        private static SpawnedUnit FindNearestEnemyUnit(
            SpawnedUnit unit, IReadOnlyCollection<SpawnedUnit> allUnits, Vector3 origin)
        {
            SpawnedUnit nearest = null;
            var nearestDistSqr = float.MaxValue;

            foreach (var other in allUnits)
            {
                if (other == null || other == unit) continue;
                if (other.IsHostOwned == unit.IsHostOwned) continue; // same side
                if (other.Health != null && other.Health.IsDestroyed) continue;

                var distSqr = (other.transform.position - origin).sqrMagnitude;
                if (distSqr < nearestDistSqr)
                {
                    nearestDistSqr = distSqr;
                    nearest = other;
                }
            }

            return nearest;
        }

        private static Transform FindNearestAliveTower(IReadOnlyList<TowerController> towers, Vector3 origin)
        {
            TowerController nearest = null;
            var nearestDistSqr = float.MaxValue;

            foreach (var tower in towers)
            {
                if (tower == null || tower.IsDestroyed) continue;

                var distSqr = (tower.transform.position - origin).sqrMagnitude;
                if (distSqr < nearestDistSqr)
                {
                    nearestDistSqr = distSqr;
                    nearest = tower;
                }
            }

            return nearest != null ? nearest.transform : null;
        }
    }
}

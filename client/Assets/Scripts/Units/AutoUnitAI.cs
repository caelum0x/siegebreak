using System;
using UnityEngine;
using UnityEngine.AI;

namespace Siegebreak.Units
{
    public enum UnitState { Moving, Engaging, Attacking }

    /// <summary>
    /// Server-only simulation for non-hero troops. Clients never run this
    /// logic directly — they receive position/state snapshots and
    /// interpolate. Keeping this deterministic and simple keeps bandwidth
    /// low, since these units don't need per-entity client prediction.
    ///
    /// Only the host (NetworkBootstrap.IsHost) ever calls ServerTick; on the
    /// guest, Core/MatchSimulationController disables this component on
    /// every spawned unit so it's pure data (SpawnedUnit) plus a visual,
    /// never a second, conflicting simulation.
    /// </summary>
    public class AutoUnitAI : MonoBehaviour
    {
        [SerializeField] private NavMeshAgent agent;
        [SerializeField] private float attackRange = 2f;
        [SerializeField] private float attackIntervalSeconds = 1f;

        private float _attackTimer;

        public UnitState State { get; private set; } = UnitState.Moving;

        /// <summary>
        /// Raised once per attackIntervalSeconds while in range of a target.
        /// The caller (host simulator) owns how much damage that's worth —
        /// this class only knows about movement/range, not a card's dps.
        /// </summary>
        public event Action<Transform> OnAttackTick;

        /// <summary>
        /// Lets the host simulator set this unit's range/attack-speed from
        /// its CardData at spawn time instead of relying on whatever the
        /// prefab happened to have serialized in the Inspector.
        /// </summary>
        public void Configure(float range, float intervalSeconds)
        {
            attackRange = range;
            attackIntervalSeconds = Mathf.Max(0.05f, intervalSeconds);
        }

        public void ServerTick(Transform nearestValidTarget, float deltaTime)
        {
            if (nearestValidTarget == null)
            {
                State = UnitState.Moving;
                return;
            }

            var dist = Vector3.Distance(transform.position, nearestValidTarget.position);
            if (dist > attackRange)
            {
                State = UnitState.Moving;
                _attackTimer = 0f;
                if (agent != null) agent.SetDestination(nearestValidTarget.position);
            }
            else
            {
                State = UnitState.Attacking;
                if (agent != null) agent.ResetPath();

                _attackTimer += deltaTime;
                if (_attackTimer >= attackIntervalSeconds)
                {
                    _attackTimer -= attackIntervalSeconds;
                    OnAttackTick?.Invoke(nearestValidTarget);
                }
            }
        }
    }
}

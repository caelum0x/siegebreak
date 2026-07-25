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
    /// </summary>
    public class AutoUnitAI : MonoBehaviour
    {
        [SerializeField] private NavMeshAgent agent;
        [SerializeField] private float attackRange = 2f;
        [SerializeField] private bool targetsBuildingsOnly = false;

        public UnitState State { get; private set; } = UnitState.Moving;

        public void ServerTick(Transform nearestValidTarget)
        {
            if (nearestValidTarget == null) return;

            var dist = Vector3.Distance(transform.position, nearestValidTarget.position);
            if (dist > attackRange)
            {
                State = UnitState.Moving;
                agent.SetDestination(nearestValidTarget.position);
            }
            else
            {
                State = UnitState.Attacking;
                agent.ResetPath();
                // TODO: apply damage on an attack-speed timer.
            }
        }
    }
}

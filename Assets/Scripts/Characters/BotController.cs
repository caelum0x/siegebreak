using UnityEngine;

namespace FPClash
{
    /// <summary>
    /// Lightweight AI for a bot Unit. Picks the nearest enemy (unit or tower),
    /// steers toward it with simple separation so bots don't stack, and swings
    /// when in range. No NavMesh needed — the arena is a flat open field.
    /// </summary>
    [RequireComponent(typeof(Unit))]
    public class BotController : MonoBehaviour
    {
        public float turnSpeed = 360f;
        public float retargetInterval = 0.5f;
        public float separationRadius = 1.6f;
        public float separationStrength = 2.2f;

        Unit _unit;
        IDamageable _target;
        float _nextRetarget;
        float _wanderSeed;

        public void Init()
        {
            _unit = GetComponent<Unit>();
            _wanderSeed = Random.value * 100f;
        }

        void Update()
        {
            if (_unit == null || !_unit.IsAlive) return;
            float dt = Time.deltaTime;

            if (Time.time >= _nextRetarget || _target == null || !_target.IsAlive)
            {
                _target = Combatants.FindNearestEnemy(_unit.Team, transform.position, 500f, _unit);
                _nextRetarget = Time.time + retargetInterval;
            }

            if (_target == null || !_target.IsAlive)
            {
                _unit.Locomote(Vector3.zero, dt);
                return;
            }

            Vector3 toTarget = _target.Transform.position - transform.position;
            toTarget.y = 0f;
            float edgeDist = toTarget.magnitude - _target.TargetRadius - _unit.Config.bodyRadius;

            Vector3 desired = toTarget.normalized;

            if (edgeDist <= _unit.Config.attackRange * 0.9f)
            {
                // In range: hold, face, and swing.
                _unit.FaceTowards(toTarget, turnSpeed * 1.5f, dt);
                _unit.Locomote(Separation() * separationStrength, dt);
                if (_unit.CanAttack) _unit.StartAttack();
            }
            else
            {
                // Chase with a little separation + wander so movement looks alive.
                Vector3 steer = desired + Separation();
                float wobble = (Mathf.PerlinNoise(_wanderSeed, Time.time * 0.5f) - 0.5f) * 0.4f;
                steer += Vector3.Cross(Vector3.up, desired) * wobble;
                steer.y = 0f;
                steer.Normalize();

                _unit.Locomote(steer * _unit.Config.moveSpeed, dt);
                _unit.FaceTowards(steer, turnSpeed, dt);
            }
        }

        Vector3 Separation()
        {
            Vector3 push = Vector3.zero;
            var list = Combatants.All;
            for (int i = 0; i < list.Count; i++)
            {
                var c = list[i];
                if (c == null || ReferenceEquals(c, _unit) || !c.IsAlive) continue;
                if (!(c is Unit)) continue; // only avoid other characters, not towers
                Vector3 d = transform.position - c.Transform.position;
                d.y = 0f;
                float m = d.magnitude;
                if (m > 0.01f && m < separationRadius)
                    push += d.normalized * (1f - m / separationRadius);
            }
            return push;
        }
    }
}

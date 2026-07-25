using System;
using System.Collections;
using UnityEngine;

namespace FPClash
{
    /// <summary>
    /// A fighting character (used by both the human player and the bots).
    /// Owns health, a procedurally-built body, melee attacking, movement via a
    /// CharacterController, and death/respawn. Movement decisions come from a
    /// controller (PlayerController / BotController); this class executes them.
    /// </summary>
    [RequireComponent(typeof(CharacterController))]
    public class Unit : MonoBehaviour, IDamageable
    {
        public CharacterConfig Config { get; private set; }
        public Team Team { get; private set; }
        public Health Health { get; private set; }
        public bool IsPlayer { get; set; }

        CharacterController _cc;
        Transform _body;      // visual root
        Transform _weapon;
        float _verticalVel;
        float _nextAttackTime;
        bool _swinging;

        // IDamageable ----------------------------------------------------------
        public bool IsAlive => Health != null && Health.IsAlive;
        public Transform Transform => transform;
        public float TargetRadius => Config != null ? Config.bodyRadius : 0.5f;
        public float AimHeight => Config != null ? Config.bodyHeight * 0.6f : 1.0f;
        public float HealthFraction => Health != null ? Health.Fraction : 0f;
        public float BarHeight => Config != null ? Config.bodyHeight + 0.6f : 2.6f;

        public void TakeDamage(float amount, object source)
        {
            if (Health != null) Health.ApplyDamage(amount, source);
        }

        // Events ---------------------------------------------------------------
        /// <summary>(victim, killerSource) when this unit dies.</summary>
        public event Action<Unit, object> Killed;
        /// <summary>fired the moment a swing lands its damage (for UI/juice).</summary>
        public event Action DidAttack;

        public bool CanAttack => IsAlive && !_swinging && Time.time >= _nextAttackTime;
        public float AttackCooldownFraction =>
            Config == null ? 1f : Mathf.Clamp01(1f - Mathf.Max(0f, _nextAttackTime - Time.time) / Config.attackCooldown);

        public void Setup(CharacterConfig config, Team team, string label)
        {
            Config = config.Clone();
            Team = team;
            name = label;

            _cc = GetComponent<CharacterController>();
            _cc.height = Config.bodyHeight;
            _cc.radius = Config.bodyRadius;
            _cc.center = new Vector3(0f, Config.bodyHeight * 0.5f, 0f);
            _cc.slopeLimit = 60f;
            _cc.stepOffset = 0.3f;

            Health = gameObject.GetComponent<Health>();
            if (Health == null) Health = gameObject.AddComponent<Health>();
            Health.Configure(Config.maxHealth);
            Health.Died += OnDied;

            BuildBody();
            Combatants.Register(this);
        }

        void BuildBody()
        {
            var bodyGo = new GameObject("Body");
            _body = bodyGo.transform;
            _body.SetParent(transform, false);

            float h = Config.bodyHeight;
            float r = Config.bodyRadius;

            // Torso (capsule-ish using a cylinder + head)
            Prims.Cylinder("Torso", _body, new Vector3(0f, h * 0.5f, 0f),
                new Vector3(r * 2f, h * 0.35f, r * 2f), Config.bodyColor, false);
            Prims.Sphere("Head", _body, new Vector3(0f, h * 0.9f, 0f), r * 1.1f, Config.bodyColor);

            // Facing indicator (visor) so first-person feel + third parties can read facing.
            Prims.Box("Visor", _body, new Vector3(0f, h * 0.9f, r * 0.9f),
                new Vector3(r * 1.2f, r * 0.4f, r * 0.3f), new Color(0.05f, 0.9f, 1f), false);

            // Team ring at the feet.
            var ring = Prims.Cylinder("TeamRing", _body, new Vector3(0f, 0.06f, 0f),
                new Vector3(r * 2.6f, 0.03f, r * 2.6f), Team.Color(), false);
            ring.GetComponent<MeshRenderer>().sharedMaterial = Prims.EmissiveMat(Team.Color());

            // Weapon (held out front, swings on attack).
            var weaponPivot = new GameObject("WeaponPivot");
            _weapon = weaponPivot.transform;
            _weapon.SetParent(_body, false);
            _weapon.localPosition = new Vector3(r * 0.9f, h * 0.55f, r * 0.6f);
            Prims.Box("Weapon", _weapon, new Vector3(0f, 0f, Config.attackRange * 0.4f),
                new Vector3(0.18f, 0.18f, Config.attackRange * 0.8f),
                new Color(0.85f, 0.85f, 0.9f), false);
        }

        // Movement -------------------------------------------------------------
        public void Locomote(Vector3 planarVelocity, float dt)
        {
            if (!IsAlive || _cc == null || !_cc.enabled) return;

            if (_cc.isGrounded && _verticalVel < 0f) _verticalVel = -2f;
            _verticalVel += Physics.gravity.y * dt;

            Vector3 v = planarVelocity;
            v.y = _verticalVel;
            _cc.Move(v * dt);
        }

        public void FaceTowards(Vector3 planarDir, float turnDegPerSec, float dt)
        {
            planarDir.y = 0f;
            if (planarDir.sqrMagnitude < 0.0001f) return;
            Quaternion target = Quaternion.LookRotation(planarDir.normalized, Vector3.up);
            transform.rotation = Quaternion.RotateTowards(transform.rotation, target, turnDegPerSec * dt);
        }

        public void FaceInstant(Vector3 planarDir)
        {
            planarDir.y = 0f;
            if (planarDir.sqrMagnitude < 0.0001f) return;
            transform.rotation = Quaternion.LookRotation(planarDir.normalized, Vector3.up);
        }

        // Combat ---------------------------------------------------------------
        public void StartAttack()
        {
            if (!CanAttack) return;
            _swinging = true;
            _nextAttackTime = Time.time + Config.attackCooldown;
            StartCoroutine(SwingRoutine());
        }

        IEnumerator SwingRoutine()
        {
            // wind up (raise weapon)
            float t = 0f;
            Quaternion rest = Quaternion.identity;
            Quaternion raised = Quaternion.Euler(-70f, 0f, 0f);
            while (t < Config.attackWindup)
            {
                t += Time.deltaTime;
                if (_weapon) _weapon.localRotation = Quaternion.Slerp(rest, raised, t / Config.attackWindup);
                yield return null;
            }

            ExecuteHit();
            DidAttack?.Invoke();

            // swing down / recover
            t = 0f;
            float recover = 0.18f;
            Quaternion swung = Quaternion.Euler(45f, 0f, 0f);
            while (t < recover)
            {
                t += Time.deltaTime;
                if (_weapon) _weapon.localRotation = Quaternion.Slerp(raised, swung, t / recover);
                yield return null;
            }
            if (_weapon) _weapon.localRotation = rest;
            _swinging = false;
        }

        void ExecuteHit()
        {
            if (!IsAlive) return;
            Vector3 origin = transform.position;
            Vector3 forward = transform.forward;
            float halfArc = Config.attackAngle * 0.5f;
            float reachSqr = Config.attackRange;

            // snapshot to a temp list because damage can remove entries
            var list = Combatants.All;
            for (int i = list.Count - 1; i >= 0; i--)
            {
                var c = list[i];
                if (c == null || !c.IsAlive || c.Team == Team || ReferenceEquals(c, this)) continue;

                Vector3 to = c.Transform.position - origin;
                to.y = 0f;
                float dist = to.magnitude - c.TargetRadius;
                if (dist > reachSqr) continue;

                if (Config.attackAngle < 359f)
                {
                    float ang = Vector3.Angle(forward, to);
                    if (ang > halfArc) continue;
                }
                c.TakeDamage(Config.attackDamage, this);
            }
        }

        // Death / respawn ------------------------------------------------------
        void OnDied(object source)
        {
            Killed?.Invoke(this, source);
            SetDeadState(true);
        }

        void SetDeadState(bool dead)
        {
            if (_cc != null) _cc.enabled = !dead;
            if (_body != null) _body.gameObject.SetActive(!dead);
            _swinging = false;
        }

        public void Respawn(Vector3 pos, Quaternion rot)
        {
            StopAllCoroutines();
            _swinging = false;
            _verticalVel = 0f;
            if (_cc != null) _cc.enabled = false;
            transform.SetPositionAndRotation(pos, rot);
            if (_cc != null) _cc.enabled = true;
            SetDeadState(false);
            if (_weapon) _weapon.localRotation = Quaternion.identity;
            Health.Revive();
            _nextAttackTime = 0f;
        }

        void OnDestroy()
        {
            Combatants.Unregister(this);
        }
    }
}

using System;
using UnityEngine;

namespace FPClash
{
    public enum TowerKind { King, Princess }

    /// <summary>
    /// A stationary building that auto-fires at the nearest enemy in range.
    /// Destroying a team's King tower ends the match for that team.
    /// </summary>
    public class Tower : MonoBehaviour, IDamageable
    {
        public TowerKind Kind { get; private set; }
        public Team Team { get; private set; }
        public Health Health { get; private set; }

        float _range;
        float _damage;
        float _fireCooldown;
        float _nextFire;
        float _radius;
        float _height;

        public bool IsAlive => Health != null && Health.IsAlive;
        public Transform Transform => transform;
        public float TargetRadius => _radius;
        public float AimHeight => _height * 0.6f;
        public float HealthFraction => Health != null ? Health.Fraction : 0f;
        public float BarHeight => _height + 3f;

        public void TakeDamage(float amount, object source) => Health?.ApplyDamage(amount, source);

        /// <summary>(tower) fired once when destroyed.</summary>
        public event Action<Tower> Destroyed;

        public void Setup(TowerKind kind, Team team)
        {
            Kind = kind;
            Team = team;
            name = $"{team}_{kind}Tower";

            bool king = kind == TowerKind.King;
            float maxHp = king ? 4000f : 2400f;
            _damage = king ? 120f : 90f;
            _range = king ? 9f : 8f;
            _fireCooldown = king ? 1.0f : 0.8f;
            _radius = king ? 2.2f : 1.6f;
            _height = king ? 6f : 4.5f;

            Health = gameObject.AddComponent<Health>();
            Health.Configure(maxHp);
            Health.Died += OnDied;

            BuildVisual(king);
            Combatants.Register(this);
        }

        void BuildVisual(bool king)
        {
            Color body = Color.Lerp(Team.Color(), Color.white, 0.25f);
            Color trim = Color.Lerp(Team.Color(), Color.black, 0.25f);
            float w = _radius * 2f;

            // Main keep.
            Prims.Box("Keep", transform, new Vector3(0f, _height * 0.5f, 0f),
                new Vector3(w, _height, w), body);
            // Battlements.
            Prims.Box("TopRing", transform, new Vector3(0f, _height + 0.25f, 0f),
                new Vector3(w * 1.15f, 0.5f, w * 1.15f), trim);
            // Team banner cube on top so allegiance is obvious from a distance.
            var banner = Prims.Box("Banner", transform, new Vector3(0f, _height + 1.1f, 0f),
                new Vector3(w * 0.4f, 1.2f, w * 0.4f), Team.Color());
            banner.GetComponent<MeshRenderer>().sharedMaterial = Prims.EmissiveMat(Team.Color());

            if (king)
            {
                Prims.Box("CrownBlock", transform, new Vector3(0f, _height + 2.0f, 0f),
                    new Vector3(w * 0.7f, 0.6f, w * 0.7f), new Color(1f, 0.85f, 0.2f));
            }
        }

        void Update()
        {
            if (!IsAlive) return;
            if (Time.time < _nextFire) return;

            var target = Combatants.FindNearestEnemy(Team, transform.position, _range + 2f, this);
            if (target == null) return;

            // Range measured edge-to-centre so big melee units are engaged fairly.
            Vector3 d = target.Transform.position - transform.position;
            d.y = 0f;
            if (d.magnitude - target.TargetRadius > _range) return;

            _nextFire = Time.time + _fireCooldown;
            Vector3 muzzle = transform.position + Vector3.up * (_height + 0.5f);
            Projectile.Spawn(muzzle, target, _damage, 18f, Team.Color(), this);
        }

        void OnDied(object source)
        {
            Destroyed?.Invoke(this);
            // Leave rubble: darken and shrink so the field reads as "destroyed".
            var rubble = Prims.Box("Rubble", transform, new Vector3(0f, 0.4f, 0f),
                new Vector3(_radius * 2.2f, 0.8f, _radius * 2.2f), new Color(0.2f, 0.2f, 0.2f));
            foreach (var mr in GetComponentsInChildren<MeshRenderer>())
                if (mr.gameObject != rubble) mr.enabled = false;
            Combatants.Unregister(this);
            enabled = false;
        }

        void OnDestroy() => Combatants.Unregister(this);
    }
}

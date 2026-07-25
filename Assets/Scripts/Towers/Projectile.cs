using UnityEngine;

namespace FPClash
{
    /// <summary>A simple homing projectile fired by towers. Deals damage on contact.</summary>
    public class Projectile : MonoBehaviour
    {
        IDamageable _target;
        float _damage;
        float _speed;
        object _source;
        float _life;

        public static Projectile Spawn(Vector3 pos, IDamageable target, float damage, float speed, Color color, object source)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            go.name = "Projectile";
            Object.Destroy(go.GetComponent<Collider>());
            go.transform.position = pos;
            go.transform.localScale = Vector3.one * 0.35f;
            go.GetComponent<MeshRenderer>().sharedMaterial = Prims.EmissiveMat(color);

            var p = go.AddComponent<Projectile>();
            p._target = target;
            p._damage = damage;
            p._speed = speed;
            p._source = source;
            p._life = 5f;
            return p;
        }

        void Update()
        {
            _life -= Time.deltaTime;
            if (_life <= 0f || _target == null || !_target.IsAlive)
            {
                Destroy(gameObject);
                return;
            }

            Vector3 aim = _target.Transform.position + Vector3.up * _target.AimHeight;
            Vector3 to = aim - transform.position;
            float step = _speed * Time.deltaTime;

            if (to.magnitude <= step + 0.25f)
            {
                _target.TakeDamage(_damage, _source);
                Destroy(gameObject);
                return;
            }

            transform.position += to.normalized * step;
        }
    }
}

using UnityEngine;

namespace FPClash
{
    /// <summary>
    /// Drives the human-controlled unit from the virtual joystick / attack button
    /// (and WASD + Space/Click in the editor), and runs a third-person camera rig
    /// that trails behind + above the character and follows its facing.
    /// </summary>
    [RequireComponent(typeof(Unit))]
    public class PlayerController : MonoBehaviour
    {
        public float turnSpeed = 540f;     // deg/sec the body turns toward the stick
        public float camDistance = 6.5f;   // how far behind the character the camera sits
        public float camHeight = 3.2f;     // height above the character's head anchor
        public float camFollowLerp = 12f;

        Unit _unit;
        Transform _cam;
        float _camYaw;
        Vector3 _camVel;
        bool _keyAttackLast;

        public Unit Unit => _unit;

        public void Init(Camera cam)
        {
            _unit = GetComponent<Unit>();
            _cam = cam.transform;
            _camYaw = transform.eulerAngles.y;

            // Snap the camera behind the player immediately so frame 0 isn't jarring.
            _cam.position = HeadPos() - transform.forward * camDistance + Vector3.up * camHeight;
            _cam.rotation = Quaternion.LookRotation((HeadPos() + transform.forward * 3f) - _cam.position);

            InputHub.AttackDown += OnAttackDown;
        }

        void OnDestroy()
        {
            InputHub.AttackDown -= OnAttackDown;
        }

        void OnAttackDown()
        {
            if (_unit != null) _unit.StartAttack();
        }

        Vector3 HeadPos()
        {
            float h = _unit != null && _unit.Config != null ? _unit.Config.bodyHeight : 2f;
            return transform.position + Vector3.up * (h * 0.9f);
        }

        Vector2 ReadMove()
        {
            Vector2 v = InputHub.Move;
            // Editor keyboard fallback (legacy input; Active Input Handling = Both).
            Vector2 kb = new Vector2(GetAxisSafe("Horizontal"), GetAxisSafe("Vertical"));
            if (kb.sqrMagnitude > v.sqrMagnitude) v = kb;
            return Vector2.ClampMagnitude(v, 1f);
        }

        static float GetAxisSafe(string axis)
        {
            try { return Input.GetAxisRaw(axis); }
            catch { return 0f; }
        }

        void Update()
        {
            if (_unit == null || !_unit.IsAlive) return;

            float dt = Time.deltaTime;
            Vector2 move = ReadMove();

            if (move.sqrMagnitude > 0.02f)
            {
                Vector3 world = Quaternion.Euler(0f, _camYaw, 0f) * new Vector3(move.x, 0f, move.y);
                Vector3 dir = world.normalized;
                float speed = _unit.Config.moveSpeed * Mathf.Clamp01(move.magnitude);
                _unit.Locomote(dir * speed, dt);
                _unit.FaceTowards(dir, turnSpeed, dt);
            }
            else
            {
                _unit.Locomote(Vector3.zero, dt); // keep grounded / apply gravity
            }

            // Camera yaw rides the body so "up" on the stick is always "forward".
            _camYaw = transform.eulerAngles.y;

            // Hold-to-swing (button or editor key); StartAttack respects cooldown.
            bool keyAttack = false;
            try { keyAttack = Input.GetKey(KeyCode.Space) || Input.GetMouseButton(0); }
            catch { keyAttack = false; }
            if (InputHub.AttackHeld || keyAttack) _unit.StartAttack();
            _keyAttackLast = keyAttack;
        }

        void LateUpdate()
        {
            if (_cam == null || _unit == null) return;

            Vector3 pivot = HeadPos();
            Vector3 desired = pivot - transform.forward * camDistance + Vector3.up * camHeight;

            // Camera collision: don't let walls/towers get between us and the character.
            Vector3 toCam = desired - pivot;
            float dist = toCam.magnitude;
            if (dist > 0.01f && Physics.Raycast(pivot, toCam / dist, out var hit, dist, ~0, QueryTriggerInteraction.Ignore))
            {
                if (!hit.transform.IsChildOf(transform)) // ignore our own controller
                    desired = hit.point + hit.normal * 0.25f;
            }

            _cam.position = Vector3.SmoothDamp(_cam.position, desired, ref _camVel, 1f / camFollowLerp);

            // Look at the character, slightly ahead, so it sits low-centre in frame.
            Vector3 lookAt = transform.position + Vector3.up * (_unit.Config.bodyHeight * 0.6f) + transform.forward * 1.5f;
            Quaternion targetRot = Quaternion.LookRotation((lookAt - _cam.position).normalized, Vector3.up);
            _cam.rotation = Quaternion.Slerp(_cam.rotation, targetRot, Time.deltaTime * camFollowLerp);
        }
    }
}

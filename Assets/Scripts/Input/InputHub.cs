using System;
using UnityEngine;

namespace FPClash
{
    /// <summary>
    /// Bridge between the on-screen touch controls (UI) and the player logic.
    /// The virtual joystick writes <see cref="Move"/>; the attack button raises
    /// <see cref="AttackDown"/> / holds <see cref="AttackHeld"/>. Also folds in
    /// keyboard/mouse so the game is testable in the editor without a device.
    /// </summary>
    public static class InputHub
    {
        /// <summary>Normalised movement axis from the joystick (-1..1 each axis).</summary>
        public static Vector2 Move;

        /// <summary>True while the attack button (or key) is held.</summary>
        public static bool AttackHeld;

        /// <summary>Raised on the frame the attack input goes down.</summary>
        public static event Action AttackDown;

        public static void SetMove(Vector2 v) => Move = Vector2.ClampMagnitude(v, 1f);

        public static void PressAttack()
        {
            AttackHeld = true;
            AttackDown?.Invoke();
        }

        public static void ReleaseAttack() => AttackHeld = false;

        public static void Clear()
        {
            Move = Vector2.zero;
            AttackHeld = false;
        }
    }
}

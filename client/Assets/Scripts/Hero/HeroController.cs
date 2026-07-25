using UnityEngine;

namespace Siegebreak.Hero
{
    /// <summary>
    /// Client-predicted, server-reconciled hero movement + combat.
    /// This is the only entity in the game that needs full FPS-grade
    /// netcode; auto-units are server-simulated and merely interpolated
    /// on the client (see Units/AutoUnitAI.cs).
    /// </summary>
    public class HeroController : MonoBehaviour
    {
        [SerializeField] private float moveSpeed = 6f;
        [SerializeField] private float mouseSensitivity = 2f;
        [SerializeField] private HeroAbility ability;

        private CharacterController _controller;

        private void Awake() => _controller = GetComponent<CharacterController>();

        // Driven by the network tick with server-authoritative timing.
        // Movement applies locally immediately (prediction) and is
        // corrected if it diverges from the server snapshot.
        public void ApplyInput(Vector2 moveInput, Vector2 lookDelta, bool firePressed, bool abilityPressed)
        {
            var move = transform.right * moveInput.x + transform.forward * moveInput.y;
            _controller.Move(move * moveSpeed * Time.deltaTime);

            transform.Rotate(Vector3.up, lookDelta.x * mouseSensitivity);

            if (firePressed) Fire();
            if (abilityPressed) ability.TryActivate();
        }

        private void Fire()
        {
            // Local call fires visual/audio feedback only. The actual hit
            // is resolved server-side via lag-compensated raycast — never
            // trust a client-reported hit.
        }
    }
}

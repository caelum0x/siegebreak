using UnityEngine;

namespace Siegebreak.Camera
{
    public enum CameraMode { Command, Battle }

    /// <summary>
    /// Owns the transition between top-down Command View (deploy cards,
    /// read the board) and first-person Battle View (possess the hero).
    /// This is the single riskiest UX surface in the game — prototype
    /// and playtest it before building anything else out.
    /// </summary>
    public class CameraModeController : MonoBehaviour
    {
        [SerializeField] private UnityEngine.Camera commandCamera;
        [SerializeField] private UnityEngine.Camera battleCamera;
        [SerializeField] private float blendSeconds = 0.35f;

        public CameraMode CurrentMode { get; private set; } = CameraMode.Command;

        public void SetMode(CameraMode mode)
        {
            if (mode == CurrentMode) return;
            CurrentMode = mode;
            // TODO: blend/crossfade over blendSeconds — a hard cut here
            // will feel disorienting, especially on a small mobile screen.
            commandCamera.gameObject.SetActive(mode == CameraMode.Command);
            battleCamera.gameObject.SetActive(mode == CameraMode.Battle);
        }

        public void OnHeroSpawned() => SetMode(CameraMode.Battle);
        public void OnHeroDiedOrRecalled() => SetMode(CameraMode.Command);
    }
}

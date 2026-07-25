using UnityEngine;

namespace Siegebreak.UI
{
    /// <summary>
    /// Top-level HUD: elixir bar, hand of cards, tower health, camera-mode
    /// toggle button. Should be a thin view layer only — reads state from
    /// Core/Cards/Hero managers, never owns gameplay logic itself.
    /// </summary>
    public class HUDController : MonoBehaviour
    {
        // TODO: bind to ElixirManager, CardDeploymentManager, CameraModeController.
    }
}

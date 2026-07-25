using UnityEngine;

namespace Siegebreak.Cards
{
    /// <summary>
    /// Handles card selection + placement in Command View. Sends a deploy
    /// request to the server; the server is authoritative on whether the
    /// deploy is valid (elixir, placement zone, timing) and spawns the unit.
    /// </summary>
    public class CardDeploymentManager : MonoBehaviour
    {
        public void RequestDeploy(CardData card, Vector3 worldPosition)
        {
            // TODO: send RPC to server (Photon Fusion) with card id + position.
            // Do not spawn locally first — wait for server confirmation to
            // avoid desync and fake-local-spawn cheating.
        }
    }
}

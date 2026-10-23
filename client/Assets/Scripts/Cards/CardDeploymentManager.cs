using System;
using UnityEngine;
using Siegebreak.Networking;

namespace Siegebreak.Cards
{
    [Serializable]
    internal class DeployInputFrame
    {
        public string type = "deploy_input";
        public string cardId;
        public float x;
        public float y;
        public float z;
        // Wall-clock-independent ordering hint for the receiving simulation
        // (host or server) to resolve near-simultaneous deploys deterministically
        // once a real queue exists there; harmless no-op until then.
        public float clientTimeSeconds;
    }

    /// <summary>
    /// Handles card selection + placement in Command View. Sends a deploy
    /// request over the active match transport (<see cref="NetworkBootstrap"/>
    /// -> MatchRelayClient for the "local" provider, Photon Fusion once that's
    /// wired); the server/host is authoritative on whether the deploy is valid
    /// (elixir, placement zone, timing) and spawns the unit. This class never
    /// spawns anything locally first — only sends the request — so a rejected
    /// deploy can never desync the client's hand/elixir from the authority's.
    /// </summary>
    public class CardDeploymentManager : MonoBehaviour
    {
        [SerializeField] private NetworkBootstrap network;

        /// <summary>Raised if a deploy request couldn't be sent at all (no live transport).</summary>
        public event Action<CardData> OnDeploySendFailed;

        public async void RequestDeploy(CardData card, Vector3 worldPosition)
        {
            if (card == null) return;

            if (network == null || !network.IsRelayConnected)
            {
                OnDeploySendFailed?.Invoke(card);
                return;
            }

            var frame = new DeployInputFrame
            {
                cardId = card.cardId,
                x = worldPosition.x,
                y = worldPosition.y,
                z = worldPosition.z,
                clientTimeSeconds = Time.realtimeSinceStartup,
            };

            await network.SendMatchFrame(JsonUtility.ToJson(frame));
        }
    }
}

using System;
using System.Collections.Generic;
using UnityEngine;
using Siegebreak.Cards;
using Siegebreak.Networking;

namespace Siegebreak.Core
{
    /// <summary>
    /// The MVP scene's real combat loop entry point. Everything else this
    /// round (MatchHostSimulator, MatchSnapshotRenderer, the state_snapshot
    /// / deploy_input wire frames) exists to be driven from here — this is
    /// the class that finally replaces "spawns bots" with "plays a real
    /// opponent over NetworkBootstrap's relay transport".
    ///
    /// Role split, decided once by NetworkBootstrap.IsHost for the whole
    /// match (see RelayWelcome.isHost, assigned deterministically by the
    /// backend — services/src/modules/sessions/sessionStore.ts
    /// hostPlayerId()):
    ///  - Host: runs MatchHostSimulator every frame (spawns, combat,
    ///    elixir, win condition) and broadcasts state_snapshot frames.
    ///  - Guest: never simulates. Sends its own deploys as deploy_input
    ///    frames and renders whatever state_snapshot frames arrive via
    ///    MatchSnapshotRenderer.
    /// </summary>
    public class MatchSimulationController : MonoBehaviour
    {
        [SerializeField] private NetworkBootstrap network;
        [SerializeField] private CardDeploymentManager guestDeployment;
        [SerializeField] private MatchStateController matchState;
        [SerializeField] private ElixirManager hostElixir;
        [SerializeField] private ElixirManager guestElixir;
        [SerializeField] private CardCatalog catalog;
        [SerializeField] private List<TowerController> hostTowers;
        [SerializeField] private List<TowerController> guestTowers;
        [SerializeField] private Transform unitsParent;

        /// <summary>Raised when this client's own deploy was rejected by the authority (insufficient elixir, unknown card, etc).</summary>
        public event Action<CardData> OnLocalDeployRejected;

        private MatchHostSimulator _hostSimulator;
        private MatchSnapshotRenderer _guestRenderer;

        private void Awake()
        {
            _hostSimulator = new MatchHostSimulator(
                network, matchState, hostElixir, guestElixir, catalog, hostTowers, guestTowers, unitsParent);
            _guestRenderer = new MatchSnapshotRenderer(
                catalog, hostElixir, guestElixir, matchState, hostTowers, guestTowers, unitsParent);
        }

        private void OnEnable()
        {
            if (network == null) return;
            network.OnMatchFrame += HandleMatchFrame;
        }

        private void OnDisable()
        {
            if (network == null) return;
            network.OnMatchFrame -= HandleMatchFrame;
        }

        private void Update()
        {
            if (network == null || !network.IsHost) return;
            _hostSimulator.Tick(Time.deltaTime);
        }

        /// <summary>
        /// The single entry point the HUD/placement UI should call when the
        /// local player drops a card. Routes to the authoritative path for
        /// this client's role: the host applies it directly (its own plays
        /// are never echoed back by the relay — see
        /// services/src/modules/sessions/relay.ts), the guest sends it over
        /// the wire for the host to validate.
        /// </summary>
        public void RequestLocalDeploy(CardData card, Vector3 worldPosition)
        {
            if (card == null || network == null) return;

            if (network.IsHost)
            {
                if (!_hostSimulator.HandleDeployRequest(isHostOwned: true, card.cardId, worldPosition))
                {
                    OnLocalDeployRejected?.Invoke(card);
                }
                return;
            }

            if (guestDeployment != null)
            {
                guestDeployment.RequestDeploy(card, worldPosition);
            }
        }

        private void HandleMatchFrame(string json)
        {
            var type = MatchWireFrame.TypeOf(json);

            switch (type)
            {
                case "deploy_input":
                    HandleRemoteDeployInput(json);
                    break;
                case "state_snapshot":
                    HandleStateSnapshot(json);
                    break;
                default:
                    // Unknown/legacy frame type — ignore rather than throw,
                    // same tolerant handling as MatchRelayClient's own
                    // SafeParse.
                    break;
            }
        }

        private void HandleRemoteDeployInput(string json)
        {
            // Only ever meaningful on the host: the guest's own plays are
            // the only deploy_input frames in flight, and relay.ts never
            // echoes a frame back to its sender, so a guest client will
            // never see one of these.
            if (network == null || !network.IsHost) return;
            if (!MatchWireFrame.TryParseDeployInput(json, out var deploy)) return;

            _hostSimulator.HandleDeployRequest(
                isHostOwned: false, deploy.cardId, new Vector3(deploy.x, deploy.y, deploy.z));
        }

        private void HandleStateSnapshot(string json)
        {
            // Only ever meaningful on the guest: the host is the one
            // producing these, not consuming them.
            if (network == null || network.IsHost) return;
            if (!MatchWireFrame.TryParseStateSnapshot(json, out var snapshot)) return;

            _guestRenderer.Apply(snapshot);
        }
    }
}

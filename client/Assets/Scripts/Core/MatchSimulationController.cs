using System;
using System.Collections.Generic;
using UnityEngine;
using Siegebreak.Cards;
using Siegebreak.Networking;
using Siegebreak.Services;

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

        private readonly SessionClient _sessionClient = new SessionClient();
        private MatchHostSimulator _hostSimulator;
        private MatchSnapshotRenderer _guestRenderer;
        private List<string> _relayParticipantPlayerIds; // host-first, from RelayWelcome.participants
        private bool _resultReported;

        private void Awake()
        {
            _hostSimulator = new MatchHostSimulator(
                network, matchState, hostElixir, guestElixir, catalog, hostTowers, guestTowers, unitsParent);
            _guestRenderer = new MatchSnapshotRenderer(
                catalog, hostElixir, guestElixir, matchState, hostTowers, guestTowers, unitsParent);
        }

        private void OnEnable()
        {
            if (network != null)
            {
                network.OnMatchFrame += HandleMatchFrame;
                network.OnRoleAssigned += HandleRoleAssigned;
            }
            if (matchState != null)
            {
                matchState.OnMatchFinished += HandleMatchFinished;
            }
        }

        private void OnDisable()
        {
            if (network != null)
            {
                network.OnMatchFrame -= HandleMatchFrame;
                network.OnRoleAssigned -= HandleRoleAssigned;
            }
            if (matchState != null)
            {
                matchState.OnMatchFinished -= HandleMatchFinished;
            }
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

        // RelayWelcome.participants is host-first (see
        // services/src/modules/sessions/sessionStore.ts hostPlayerId()), so
        // index 0/1 map directly onto PlayerA/PlayerB (see the convention
        // documented on MatchResult in MatchStateController.cs) without a
        // second lookup.
        private void HandleRoleAssigned(RelayWelcome welcome)
        {
            _relayParticipantPlayerIds = welcome?.participants;
        }

        // Fires only from the host's own MatchStateController.Finish() (see
        // that class's doc) — reports the real outcome of a real played
        // match to the backend so it actually lands rating/XP/gold/shards
        // instead of vanishing (the gap this method closes was a bare TODO
        // in MatchStateController.Finish until now). Guarded so it only ever
        // runs once per match and only on the host; the guest's own copy of
        // matchState never raises OnMatchFinished in the first place (it
        // only ever calls SyncResultFromServer), so the `!network.IsHost`
        // check below is belt-and-suspenders, not the only guard.
        private void HandleMatchFinished(MatchResult result)
        {
            if (_resultReported || network == null || !network.IsHost) return;
            _resultReported = true;
            ReportMatchResult(result);
        }

        private async void ReportMatchResult(MatchResult result)
        {
            if (_relayParticipantPlayerIds == null || _relayParticipantPlayerIds.Count < 2)
            {
                Debug.LogWarning("[MatchSimulationController] Can't report match result: no participant roster from the relay welcome frame yet.");
                return;
            }
            if (string.IsNullOrEmpty(network.SessionId))
            {
                Debug.LogWarning("[MatchSimulationController] Can't report match result: no session id.");
                return;
            }

            string hostPlayerId = _relayParticipantPlayerIds[0];
            string guestPlayerId = _relayParticipantPlayerIds[1];

            string hostResult;
            string guestResult;
            switch (result)
            {
                case MatchResult.PlayerAWins:
                    hostResult = "win";
                    guestResult = "loss";
                    break;
                case MatchResult.PlayerBWins:
                    hostResult = "loss";
                    guestResult = "win";
                    break;
                case MatchResult.Draw:
                    hostResult = "draw";
                    guestResult = "draw";
                    break;
                default:
                    // InProgress never reaches here — Finish() only invokes
                    // OnMatchFinished with a concrete result.
                    return;
            }

            var participants = new[]
            {
                new SessionCompleteParticipant { playerId = hostPlayerId, result = hostResult },
                new SessionCompleteParticipant { playerId = guestPlayerId, result = guestResult },
            };

            bool ok = await _sessionClient.CompleteMatch(network.SessionId, participants);
            if (!ok)
            {
                Debug.LogWarning("[MatchSimulationController] Backend did not accept the match-result report (already recorded, or a transient failure).");
            }
        }
    }
}

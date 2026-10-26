using System;
using System.Threading.Tasks;
using UnityEngine;
using Siegebreak.Services;

namespace Siegebreak.Networking
{
    /// <summary>
    /// Entry point for realtime session start, in host-authoritative server
    /// simulation mode (not P2P) so combat resolution always happens
    /// server-side. It resolves the backend-allocated session (room + provider)
    /// and hands it to the transport.
    ///
    /// Two transports are wired against the same session contract
    /// (<see cref="GameSession.connection"/>.provider):
    ///  - "local" (default) connects <see cref="MatchRelayClient"/> to the
    ///    backend's own WS relay (services/src/modules/sessions/relay.ts).
    ///    The backend deterministically names one participant the host
    ///    (<c>RelayWelcome.isHost</c>); that client runs the authoritative
    ///    simulation and broadcasts state, the other sends input only.
    ///  - "photon" is the Photon Fusion integration point
    ///    (runner.StartGame(new StartGameArgs { GameMode = GameMode.Server,
    ///    SessionName = room, ... })) — not wired yet; it requires a Photon
    ///    App Id (PHOTON_APP_ID) and the Fusion SDK package, both of which
    ///    need a Photon account signup the agent can't do unattended (see
    ///    BUILD-LOG.md). Swapping to it only touches this class and the
    ///    transport beneath it — matchmaking, allocation, and session lookup
    ///    stay the same either way.
    /// </summary>
    public class NetworkBootstrap : MonoBehaviour
    {
        private readonly SessionClient _sessions = new SessionClient();
        private MatchRelayClient _relay;

        /// <summary>Raised once the allocated session is resolved and ready to join.</summary>
        public event Action<GameSession> OnSessionResolved;

        /// <summary>Raised if the session couldn't be resolved or the transport rejected the join.</summary>
        public event Action<string> OnJoinFailed;

        /// <summary>Raised once the relay reports this client's role for the match.</summary>
        public event Action<RelayWelcome> OnRoleAssigned;

        /// <summary>Raised for every gameplay frame relayed from the other participant.</summary>
        public event Action<string> OnMatchFrame;

        /// <summary>True once the relay has confirmed this client runs the authoritative simulation.</summary>
        public bool IsHost => _relay != null && _relay.IsHost;

        public bool IsRelayConnected => _relay != null && _relay.IsConnected;

        /// <summary>
        /// The session id this client last joined. Exposed so gameplay code
        /// (MatchSimulationController, on match end) can report the result
        /// back to POST /sessions/:id/complete without needing its own copy
        /// of the id plumbed through separately.
        /// </summary>
        public string SessionId { get; private set; }

        /// <summary>
        /// Resolve the allocated session for <paramref name="sessionId"/> and
        /// start the realtime transport against its room. The region is taken
        /// from the session when available, falling back to the caller's hint.
        /// </summary>
        public async Task JoinMatch(string sessionId, string region)
        {
            SessionId = sessionId;
            GameSession session = await _sessions.GetSession(sessionId);
            if (session == null || session.connection == null)
            {
                OnJoinFailed?.Invoke("session_unavailable");
                return;
            }

            OnSessionResolved?.Invoke(session);
            await StartTransport(session, string.IsNullOrEmpty(session.region) ? region : session.region);
        }

        /// <summary>
        /// Send a gameplay frame (card deploy input, authoritative snapshot,
        /// etc.) to the other participant over whichever transport is live.
        /// No-ops if the transport isn't connected yet — callers (e.g.
        /// CardDeploymentManager) should treat that the same as any other
        /// dropped-frame case rather than throwing.
        /// </summary>
        public Task SendMatchFrame(string json)
        {
            if (_relay == null || !_relay.IsConnected) return Task.CompletedTask;
            return _relay.Send(json);
        }

        /// <summary>Drain the live transport's queued events. Call every frame.</summary>
        public void Update()
        {
            _relay?.Update();
        }

        private async Task StartTransport(GameSession session, string region)
        {
            string room = session.connection.roomName;
            string provider = session.connection.provider;

            Debug.Log($"[NetworkBootstrap] Joining {provider} room '{room}' (mode {session.mode}, region {region}).");

            if (provider == "photon")
            {
                // Photon Fusion integration point — see class doc. Not wired:
                // no Fusion SDK package and no PHOTON_APP_ID configured.
                Debug.LogWarning("[NetworkBootstrap] SESSION_PROVIDER=photon is not wired on the client yet.");
                OnJoinFailed?.Invoke("photon_not_wired");
                return;
            }

            _relay?.Dispose();
            _relay = new MatchRelayClient();
            _relay.OnWelcome += welcome => OnRoleAssigned?.Invoke(welcome);
            _relay.OnFrame += frame => OnMatchFrame?.Invoke(frame);
            _relay.OnError += error => OnJoinFailed?.Invoke(error);

            await _relay.Connect(session.id);
        }

        private void OnDestroy()
        {
            _relay?.Dispose();
        }
    }
}

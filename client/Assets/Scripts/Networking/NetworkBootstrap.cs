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
    /// and hands it to the transport. Photon Fusion's NetworkRunner.StartGame is
    /// the one remaining integration point; everything up to it — matchmaking,
    /// allocation, and fetching the concrete room — is wired to the real backend.
    /// If this ever moves to self-hosted dedicated servers (Agones), only this
    /// file and the transport beneath it should change.
    /// </summary>
    public class NetworkBootstrap : MonoBehaviour
    {
        private readonly SessionClient _sessions = new SessionClient();

        /// <summary>Raised once the allocated session is resolved and ready to join.</summary>
        public event Action<GameSession> OnSessionResolved;

        /// <summary>Raised if the session couldn't be resolved.</summary>
        public event Action<string> OnJoinFailed;

        /// <summary>
        /// Resolve the allocated session for <paramref name="sessionId"/> and
        /// start the realtime transport against its room. The region is taken
        /// from the session when available, falling back to the caller's hint.
        /// </summary>
        public async Task JoinMatch(string sessionId, string region)
        {
            GameSession session = await _sessions.GetSession(sessionId);
            if (session == null || session.connection == null)
            {
                OnJoinFailed?.Invoke("session_unavailable");
                return;
            }

            OnSessionResolved?.Invoke(session);
            StartTransport(session, string.IsNullOrEmpty(session.region) ? region : session.region);
        }

        private void StartTransport(GameSession session, string region)
        {
            string room = session.connection.roomName;
            string provider = session.connection.provider;

            Debug.Log($"[NetworkBootstrap] Joining {provider} room '{room}' (mode {session.mode}, region {region}).");

            // Photon Fusion integration point:
            //   runner.StartGame(new StartGameArgs {
            //       GameMode = GameMode.Server,
            //       SessionName = room,
            //       ...
            //   });
            // The `local` provider (default) is served by our own dedicated
            // session model; a real dedicated-server/Fusion transport slots in
            // here without changing anything above.
        }
    }
}

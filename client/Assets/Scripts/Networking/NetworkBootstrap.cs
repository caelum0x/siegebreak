using UnityEngine;

namespace Siegebreak.Networking
{
    /// <summary>
    /// Entry point for Photon Fusion session start, in host-authoritative
    /// server simulation mode (not P2P) so combat resolution always
    /// happens server-side. If this ever moves to self-hosted dedicated
    /// servers (Agones), only this file and the transport layer beneath
    /// it should need to change — gameplay code should not care.
    /// </summary>
    public class NetworkBootstrap : MonoBehaviour
    {
        public void JoinMatch(string sessionId, string region)
        {
            // TODO: Fusion NetworkRunner.StartGame(...) with GameMode.Server
        }
    }
}

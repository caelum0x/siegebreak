using System;
using UnityEngine;

namespace Siegebreak.Services
{
    /// <summary>
    /// Scene-level facade that owns the backend service clients and the realtime
    /// match subscription, exposing them to gameplay/UI through a single
    /// component. Persists across scene loads and drives the subscription's
    /// main-thread pump each frame.
    ///
    /// Wire it once (e.g. on a boot object) and read <see cref="Instance"/>:
    ///   await BackendGateway.Instance.Auth.LoginGuest();
    ///   BackendGateway.Instance.Subscription.OnMatched += OnMatchFound;
    /// Override the API base URL via the inspector field before Awake runs.
    /// </summary>
    public class BackendGateway : MonoBehaviour
    {
        [Tooltip("Backend base URL. Leave blank to use the default (http://localhost:8080).")]
        [SerializeField] private string apiBaseUrl = string.Empty;

        public static BackendGateway Instance { get; private set; }

        public AuthClient Auth { get; private set; }
        public MatchmakingClient Matchmaking { get; private set; }
        public SessionClient Sessions { get; private set; }
        public PlayerClient Players { get; private set; }
        public EconomyClient Economy { get; private set; }
        public MatchSubscription Subscription { get; private set; }

        /// <summary>True once a token pair is present (persisted or freshly issued).</summary>
        public bool IsAuthenticated => SessionStore.IsAuthenticated;

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;
            DontDestroyOnLoad(gameObject);

            if (!string.IsNullOrEmpty(apiBaseUrl))
            {
                BackendConfig.SetBaseUrl(apiBaseUrl);
            }

            Auth = new AuthClient();
            Matchmaking = new MatchmakingClient();
            Sessions = new SessionClient();
            Players = new PlayerClient();
            Economy = new EconomyClient();
            Subscription = new MatchSubscription();
        }

        private void Update()
        {
            // Raise any queued realtime frames on the main thread.
            Subscription?.Update();
        }

        private void OnDestroy()
        {
            if (Instance == this)
            {
                Subscription?.Dispose();
                Instance = null;
            }
        }
    }
}

# Siegebreak Unity client

The fuller **Siegebreak** client scaffold (FPS-hero + tower-push) toward the PRD
vision. This is separate from the shipped MVP under the repo-root `Assets/`
(a runtime-generated Clash-Royale-like); see the root [`README.md`](../README.md)
and [`DEVELOPMENT.md`](../DEVELOPMENT.md).

Requires the Unity editor to build/run (Unity 6 LTS). It is not covered by the
repo's automated CI gates.

## Backend SDK — `Assets/Scripts/Services/`

A working integration layer against the Node backend in [`../services`](../services).
It uses only Unity built-ins (`UnityWebRequest`, `JsonUtility`,
`System.Net.WebSockets`) — no extra packages.

| File | Role |
| --- | --- |
| `BackendConfig` | REST base URL + `ws(s)://` subscribe URL builder. Default `http://localhost:8080`; override via `BackendGateway`'s inspector field or `SetBaseUrl`. |
| `SessionStore` | Access/refresh token holder, persisted in `PlayerPrefs`. |
| `HttpApi` | `UnityWebRequest` GET/POST with JSON, bearer auth, and one transparent refresh+retry on `401`. Awaitable. |
| `Dtos` / `JsonHelper` | `JsonUtility`-serializable API mirrors; array (de)serialization helper. |
| `AuthClient` | `LoginGuest` (device-bound) / `LoginApple` / `LoginGoogle` / `Logout`. |
| `MatchmakingClient` | `QueueForMatch` / `CancelQueue` / `GetStatus`. |
| `SessionClient` | `GetSession(id)` → allocated room + realtime provider. |
| `PlayerClient` | `GetMe` (progression + record) / `GetMatchHistory`. |
| `EconomyClient` | `GetProducts` / `GetWallet` / `ValidatePurchase`. |
| `MatchSubscription` | Real-time `WS /matchmaking/subscribe`; off-thread receive loop drained on the main thread via `Update()`. |
| `BackendGateway` | `MonoBehaviour` facade owning the clients + subscription; drives the subscription pump each frame. |

### Usage

Drop a `BackendGateway` on a boot object (optionally set its API base URL), then:

```csharp
var gw = BackendGateway.Instance;

// 1. Authenticate (tokens persist across launches).
if (!gw.IsAuthenticated)
    await gw.Auth.LoginGuest();

// 2. Subscribe for the real-time match push, then queue.
gw.Subscription.OnMatched += sessionId => OnMatchFound(sessionId);
await gw.Subscription.Connect();
await gw.Matchmaking.QueueForMatch(deckId);

// 3. Poll is the backstop if the socket is unavailable.
var ticket = await gw.Matchmaking.GetStatus();
if (ticket != null && ticket.IsMatched)
    OnMatchFound(ticket.sessionId);

// 4. Resolve the allocated room and hand it to the transport.
async void OnMatchFound(string sessionId)
{
    await GetComponent<Siegebreak.Networking.NetworkBootstrap>()
        .JoinMatch(sessionId, region: "eu");
}
```

The backend is authoritative for currency: `EconomyClient.ValidatePurchase`
returns `null` if the store receipt fails verification — never credit locally.

### Local backend

```bash
cd ../services
docker compose up -d postgres redis
cp .env.example .env        # IAP_MODE=dev is set for local purchase testing
npx prisma migrate deploy && npm run seed
npm run dev                 # http://localhost:8080
```

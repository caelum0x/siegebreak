# Siegebreak — Technical Architecture (v0.1)

## 1. System overview

```
Client (Unity, PC + Mobile)
   │
   ├── Photon Fusion Cloud ──> authoritative realtime match simulation
   │
   └── Backend API (HTTPS/REST) ──> auth, profile, matchmaking, economy, leaderboard
                │
                ├── Postgres (Neon)  — source of truth
                ├── Redis            — matchmaking queue, session cache, leaderboard
                └── S3-compatible    — match telemetry / future replays
```

Two very different problems, two very different tools: match gameplay needs low-latency authoritative simulation (Photon Fusion), everything else is a fairly standard web backend (Node/Postgres/Redis). Don't try to force both through one system.

## 2. Client

- **Engine:** Unity 6 LTS, URP (one render pipeline, PC + mobile both target it).
- **Code structure:** Assembly Definitions per module (Core, Hero, Units, Cards, Networking, UI, Services) — keeps compile times sane and stops gameplay code from casually reaching into networking internals.
- **Input:** New Input System behind an `IInputProvider` abstraction, so PC (mouse/kb) and mobile (touch) implementations swap without touching gameplay code.
- **Camera:** `CameraModeController` owns the Command↔Battle transition. This is the highest-risk UX surface in the game — prototype and playtest it before anything else gets built out.

## 3. Networking / realtime layer

- **Photon Fusion 2**, host-authoritative server simulation mode — not P2P. P2P means trusting a client's peer for hit registration, which is not viable for a competitive ladder game.
- **Split authority, on purpose:**
  - *Hero:* client-predicted input + server reconciliation. This is standard FPS netcode and it's the only entity that needs it — it's the only entity a player directly steers.
  - *Auto-units:* fully server-simulated deterministic FSM. Clients only receive snapshots and interpolate. No prediction needed because no player is driving them directly — this keeps bandwidth and complexity down for the majority of entities on screen.
- **Hit validation:** server-side lag-compensated raycast (rewind hitboxes to the shooter's observed timestamp). Never trust a client-reported hit — this is the single most common cheating vector in naive FPS implementations, and it's cheap to get right from day one vs. retrofitting later.
- **Tick rate:** 30Hz authoritative simulation. Hero input sampled at client frame rate, sent up to 60Hz on PC / 30Hz on mobile (battery and bandwidth tradeoff).

## 4. Backend services

- **Stack:** Node.js + TypeScript, Fastify, Prisma ORM.
- **Shape:** modular monolith at launch, not microservices. A small team ships faster operating one deployable with clean internal module boundaries than it does operating seven services. Split out only when a specific module's load shape actually diverges from the rest — matchmaking (bursty, latency-sensitive) and analytics-ingest (high volume, tolerant of delay) are the two most likely first candidates.
- **Modules:** `auth`, `profile`, `players`, `cards`, `matchmaking`, `sessions`, `economy`, `leaderboard`, `matches`, `analytics`.
- **Database:** Postgres via **Neon** — serverless, branch-per-PR, which fits a workflow of testing migrations against a real branch before merging rather than against a shared dev DB.
- **Cache/queue:** Redis — matchmaking queue, session cache, leaderboard sorted sets.
- **Storage:** S3-compatible bucket for match telemetry now, replay data later.

## 5. Buy vs. build

- **IAP validation:** Apple App Store Server API + Google Play Developer API, server-side only. Never grant currency off a client-reported purchase. *(Implemented — see §10.)*
- **Remote config / live-ops:** use a managed tool (e.g. Firebase Remote Config) at launch instead of building one. This is a solved problem; building it pre-launch is time spent not shipping the game.
- **Analytics:** PostHog or Amplitude at launch. Revisit a custom pipeline (ClickHouse etc.) only once volume actually justifies the ops cost.
- **Auth:** Sign in with Apple / Google + device-bound guest accounts (standard F2P pattern), JWT access + refresh tokens.

## 6. Data model (core tables)

```
players(id, display_name, level, xp, created_at)
cards(id, name, type[troop|spell|hero|building], base_stats_json, elixir_cost)
player_cards(player_id, card_id, level, shards)
decks(id, player_id, name, slots[8])          -- slot 0 must be type=hero
matches(id, started_at, ended_at, region, mode)
match_participants(match_id, player_id, deck_id, result, trophies_delta)
wallets(player_id, gold, gems)
purchases(id, player_id, product_id, receipt, validated_at, granted)
leaderboard_seasons(id, starts_at, ends_at)
```

`shared/card-schema.json` is the contract between the Unity `CardData` ScriptableObjects and the backend `cards` module — validate both against it in CI so they can't silently drift.

## 7. Security / anti-cheat priorities

1. Server-authoritative simulation — no client-trusted gameplay state, ever.
2. Lag-compensated server-side hit validation for all hero combat.
3. Rate limiting + anomaly detection on every economy-mutating endpoint.
4. IAP receipts validated server-side only, never client-asserted.

## 8. CI/CD

- GitHub Actions, two lanes:
  - **Client:** `game-ci/unity-builder` (or Unity Cloud Build) → per-platform build artifacts.
  - **Services:** Docker build → push → deploy.
- Neon DB branch created per PR to test migrations against real schema before merge.

## 9. Deliberate scope decisions (what NOT to build first)

- Photon Fusion **Cloud** (managed relay), not self-hosted dedicated servers — avoids building server-fleet orchestration (Agones/Kubernetes) before there's a player base to justify it.
- Fly.io for backend compute, not Kubernetes — same logic: cluster ops overhead isn't worth it pre-PMF.
- Managed remote-config and analytics tools, not in-house ones.

None of this is permanent — it's the set of things worth deferring until real usage tells you they're actually the bottleneck, not before.

## 10. Implementation status (v0.2)

What's actually built and tested today (see [`DEVELOPMENT.md`](./DEVELOPMENT.md) for how to run each and the test counts):

- **Backend (`services/`) — functional.** All modules above are implemented on Fastify + Prisma + Redis with a mocked unit suite plus an integration suite against real Postgres/Redis. Notable:
  - *Matchmaking → session allocation:* a match writes a persisted Redis session record (`sessions` module) carrying participants + a `connection {provider, roomName}` block; clients read it back via participant-scoped `GET /matches/session/:id`. `SESSION_PROVIDER` swaps the `local` dedicated-session model for `photon` without changing the contract.
  - *Real-time push:* the matcher publishes match-found events on a Redis channel; each instance's subscriber forwards to its connected sockets over `WS /matchmaking/subscribe`. Correct across >1 instance.
  - *Real-time in-match relay:* `WS /sessions/:id/relay` (`modules/sessions/relay.ts`) is the live transport behind `SESSION_PROVIDER=local` — both matched participants connect, the server deterministically names one the host (`sessionStore.hostPlayerId`, first participant in allocation order) and relays gameplay frames between them unparsed, fanned out across instances via the same Redis-pub/sub shape as the matcher notifier. This is real 1v1 PvP transport, not a bot stand-in.
  - *IAP:* Apple (`verifyReceipt`, prod→sandbox) + Google Play (Play Developer API with a service-account OAuth token) verification, plus an `IAP_MODE=dev` provider for local end-to-end runs. Gems come from a server-side catalog keyed by the *verified* productId.
  - *Progression:* Elo rating + XP/gold on match completion (server-secret guarded), aggregated win/loss record and match history on `GET /players/me` + `/players/me/matches`.
- **Web client (`web/`) — functional.** Guest login, deck builder, matchmaking (WS-accelerated with poll fallback), match-found with the real allocated session, leaderboard, and match history.
- **Unity client (`client/`) — SDK wired, real-time relay live.** A `Services/` layer (`BackendGateway` facade over `Auth/Matchmaking/Session/Player/Economy` clients + a `MatchSubscription` WS) talks to the real backend over UnityWebRequest with bearer + refresh. `Networking/NetworkBootstrap` now connects `Services/MatchRelayClient` to the real `/sessions/:id/relay` transport for the default `local` provider — `CardDeploymentManager` sends real deploy-input frames over it, and the host/guest role is read off the server's `welcome` message rather than guessed. `SESSION_PROVIDER=photon` (Photon Fusion `NetworkRunner.StartGame`) is still the one unwired path — it needs a Photon account signup (`PHOTON_APP_ID`) that's an owner step, not a code gap; see `BUILD-LOG.md`.

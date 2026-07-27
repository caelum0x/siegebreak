# Siegebreak / FP Clash — Developer Guide

This repo is a monorepo with three independently-runnable parts. See
[`PRD.md`](./PRD.md) and [`ARCHITECTURE.md`](./ARCHITECTURE.md) for product and
system design.

```
┌─────────────────────────┐        ┌──────────────────────────┐
│  Game client (Unity C#) │        │  Web client (React/Vite) │
│  Assets/ , client/      │        │  web/                    │
└──────────┬──────────────┘        └───────────┬──────────────┘
           │ (realtime: Photon)                │ HTTPS/REST
           ▼                                    ▼
                    ┌───────────────────────────────┐
                    │  Backend services (Node/TS)   │
                    │  services/  — Fastify + Prisma │
                    │  + Postgres, Redis            │
                    └───────────────────────────────┘
```

## 1. Backend — `services/`

Fastify + TypeScript + Prisma (Postgres) + ioredis. Modular monolith: `auth`,
`profile`, `cards`, `matchmaking`, `economy`, `leaderboard`, `matches`,
`analytics`.

```bash
cd services
npm install
cp .env.example .env            # fill in DATABASE_URL, REDIS_URL, JWT_SECRET, ...
npx prisma generate             # schema lives at src/db/schema.prisma
npm run migrate                 # apply migrations to your DB
npm run seed                    # load the starter card roster
npm run dev                     # http://localhost:8080  (GET /health -> {status:"ok"})
```

Quality gates:

```bash
npm run typecheck        # tsc --noEmit
npm test                 # vitest — 108 unit tests (deps mocked)
npm run build            # tsc -> dist/
npm run test:integration # 9 tests against REAL Postgres + Redis
```

**Integration tests** (`test-integration/`) run the app against a live database
and Redis — the paths the unit tests mock (Prisma queries/transactions/FKs,
Redis sorted-sets). Bring the infra up with `docker compose up -d postgres redis`
(or point `DATABASE_URL`/`REDIS_URL` at your own), then:

```bash
npx prisma migrate deploy   # apply the schema
npm run seed                # load the card catalog
npm run test:integration
```

CI (`infra/github-actions/services-ci.yml`) does exactly this with Postgres +
Redis service containers on every PR touching `services/`.

Notable endpoints:

| Area          | Endpoint                                                        | Auth            |
| ------------- | -------------------------------------------------------------- | --------------- |
| Auth          | `POST /auth/guest` · `/auth/apple` · `/auth/google` · `/auth/refresh` · `/auth/link` | mixed / player  |
| Cards & decks | `GET /cards` · `GET,POST /players/me/decks`                    | player (decks)  |
| Player        | `GET /players/me` · `GET /players/me/matches` · `GET /profile/:playerId` | player / public |
| Sessions      | `GET /matches/session/:id`                                    | player (participant) |
| Matchmaking   | `POST /matchmaking/queue,cancel` · `GET /matchmaking/status` · `WS /matchmaking/subscribe` | player          |
| Economy       | `GET /economy/products` · `GET /economy/wallet` · `POST /economy/purchase/validate` | public / player |
| Leaderboard   | `GET /leaderboard/:seasonId`                                   | public          |
| Match results | `POST /matches/:id/complete`                                   | **server** secret |
| Analytics     | `POST /analytics/event`                                        | public          |

Two auth boundaries: **player** JWTs (`Authorization: Bearer <accessToken>`,
via `requireAuth`) and a **server-to-server** shared secret (`MATCH_SERVER_SECRET`,
via `requireMatchServer`) for the trusted game server reporting match results.

**In-app purchases** are fully verified server-side
(`economy/receiptVerification.ts`): Apple (`verifyReceipt` with prod→sandbox
fallback), Google Play (Play Developer API, with a service-account OAuth token
minted via `jose` in `economy/googleAuth.ts`), plus a `IAP_MODE=dev` provider
that accepts `dev:<productId>` receipts so the whole purchase→grant flow runs
locally without store credentials. Gems granted come from the server-side
catalog (`economy/products.ts`), keyed by the *verified* productId — never a
client-supplied amount.

Matchmaking now allocates a **real game session** on a match: `matcher.ts`
reads each queued player's deck and writes a session record to Redis via
`modules/sessions/sessionStore.ts` (id, mode, region, participants, and a
`connection` block naming the realtime provider + room). The two clients read
it back through `GET /matches/session/:id` (participant-scoped). Set
`SESSION_PROVIDER=photon` to route the room through Photon Fusion instead of
the default `local` dedicated-session model — the allocation contract is
identical across providers.

Match results are pushed in **real time**: on a match the matcher publishes to
a Redis channel (`modules/matchmaking/notifier.ts`); each API instance runs a
subscriber that forwards the event to its locally-connected sockets, so the
push is correct across multiple instances. Clients subscribe over
`WS /matchmaking/subscribe?token=<accessToken>` (the token is a query param
because a browser can't set an Authorization header on a WS handshake); the web
client uses the socket as an accelerator and keeps the ~1s poll as a backstop.

The real Apple/Google verification paths need store credentials to exercise
against production; `IAP_MODE=dev` covers everything else end-to-end.

## 2. Web client — `web/`

Vite + React + TypeScript companion client (guest login, deck builder,
matchmaking queue, leaderboard, match history). See [`web/README.md`](./web/README.md).

```bash
cd web
npm install
npm run dev            # http://localhost:5173  (VITE_API_URL defaults to :8080)
npm test               # vitest — 21 tests
npm run build
```

CORS is enabled on the backend (`@fastify/cors`), so `localhost:5173 →
localhost:8080` works in dev. Pin origins with `CORS_ORIGINS` in `services/.env`.

## 3. Game client — Unity C#

- **`Assets/`** — the shipped **FP Clash MVP**: a runtime-generated third-person
  Clash-Royale-like (player + bots, towers, melee combat). Open
  `Assets/Scenes/Game.unity` in Unity 6 LTS and press Play. See [`README.md`](./README.md).
  Champions live in `Assets/Scripts/Core/CharacterConfig.cs`; the select screen
  auto-fits the roster size.
- **`client/`** — a separate **Siegebreak** scaffold (HeroController, AutoUnitAI,
  CameraModeController) toward the fuller FPS-hero + tower-push vision in the PRD.

> The Unity clients require the Unity editor to build/run and are not covered by
> the automated CI gates above.

## Suggested next steps

- Backend: single-leader matcher (Redis lock) before running >1 instance;
  integration coverage for the WS subscribe path and session allocation.
- Web: card art; surface the economy store (`GET /economy/products`).
- Game: reconcile `Assets/` (MVP) and `client/` (Siegebreak) into one client,
  and wire it to `POST /matches/:id/complete` + `GET /matches/session/:id`.

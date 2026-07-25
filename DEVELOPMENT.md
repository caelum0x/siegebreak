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
npm test                 # vitest — 40 unit tests (deps mocked)
npm run build            # tsc -> dist/
npm run test:integration # 8 tests against REAL Postgres + Redis
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
| Matchmaking   | `POST /matchmaking/queue,cancel` · `GET /matchmaking/status`   | player          |
| Economy       | `GET /economy/wallet` · `POST /economy/purchase/validate`      | player          |
| Leaderboard   | `GET /leaderboard/:seasonId`                                   | public          |
| Match results | `POST /matches/:id/complete`                                   | **server** secret |
| Analytics     | `POST /analytics/event`                                        | public          |

Two auth boundaries: **player** JWTs (`Authorization: Bearer <accessToken>`,
via `requireAuth`) and a **server-to-server** shared secret (`MATCH_SERVER_SECRET`,
via `requireMatchServer`) for the trusted game server reporting match results.

Still stubbed by design (need real credentials/services): IAP receipt
verification (`economy/receiptVerification.ts`), and the Photon session
allocation TODO in `matchmaking/matcher.ts`.

## 2. Web client — `web/`

Vite + React + TypeScript companion client (guest login, deck builder,
matchmaking queue, leaderboard). See [`web/README.md`](./web/README.md).

```bash
cd web
npm install
npm run dev            # http://localhost:5173  (VITE_API_URL defaults to :8080)
npm test               # vitest — 11 tests
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

- Backend: implement IAP receipt verification; wire Photon session allocation;
  add integration tests against a Dockerized Postgres/Redis in CI.
- Web: real match view once a session is allocated; card art.
- Game: reconcile `Assets/` (MVP) and `client/` (Siegebreak) into one client.

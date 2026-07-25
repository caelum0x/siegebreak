# Siegebreak

FPS-hero / tower-push hybrid. See `docs/PRD.md` for product scope and
`docs/ARCHITECTURE.md` for the full technical breakdown — this file is
just a map of the repo.

```
siegebreak/
├── docs/
│   ├── PRD.md                 product requirements
│   └── ARCHITECTURE.md        technical architecture
├── client/                    Unity project (PC + Mobile, URP)
│   └── Assets/Scripts/
│       ├── Core/               elixir economy, tower HP, match win-condition
│       ├── Camera/              Command <-> Battle view transition
│       ├── Hero/                 FPS-controlled hero: movement, ability
│       ├── Units/                 server-simulated auto-unit AI
│       ├── Cards/                  card data, deploy request, deck/hand rotation
│       ├── Networking/              Photon Fusion session bootstrap
│       ├── UI/                       HUD
│       └── Services/                  HTTP clients for the backend API
├── services/                  Backend API (Node/TS/Fastify), modular monolith — implemented, typechecks clean
│   └── src/
│       ├── lib/                 Prisma client, Redis client, JWT signing/verification
│       ├── middleware/           requireAuth (Bearer JWT -> req.playerId)
│       ├── modules/
│       │   ├── auth/              guest login, Apple/Google upsert, refresh-token rotation
│       │   ├── matchmaking/        Redis MMR queue + naive matcher loop
│       │   ├── cards/               card catalog, deck CRUD w/ hero-slot validation
│       │   ├── economy/              wallet, receipt-verified purchase flow
│       │   ├── leaderboard/          Redis sorted-set rank query + write
│       │   ├── profile/               public profile lookup
│       │   └── analytics/             event ingest stub
│       └── db/
│           ├── schema.prisma          Player/Card/Deck/Match/Wallet/Purchase models
│           └── seed.ts                 starter 10-card roster
├── shared/
│   └── card-schema.json       contract between client CardData and backend cards module
└── infra/
    ├── terraform/              Fly.io app + Neon/Redis connection vars
    └── github-actions/         client build + services deploy pipelines
```

## Stack at a glance

- **Client:** Unity 6 LTS, URP, Photon Fusion 2 (client prediction for the hero, server-authoritative sim for everything else).
- **Backend:** Node.js + TypeScript + Fastify + Prisma, modular monolith.
- **Data:** Postgres via Neon, Redis for queue/cache/leaderboard.
- **Hosting:** Photon Fusion Cloud (realtime relay) + Fly.io (API) — both managed, no cluster ops at launch.

## Local dev

```bash
cd services
cp .env.example .env   # fill in DATABASE_URL (Neon) and the rest
npm install
npm run migrate
npm run seed
npm run dev
```

Unity client: open `client/` in Unity Hub (Unity 6 LTS), open `Assets/Scenes`.

## Status

**Backend:** routes, auth, matchmaking queue, deck validation, and the purchase flow are real implementations, not stubs — `npm run typecheck` passes clean against the generated Prisma types. Two things are intentionally left unimplemented because they need credentials/config that don't belong in a repo: Apple/Google identity verification (`modules/auth/providers.ts`) and Apple/Google receipt verification (`modules/economy/receiptVerification.ts`). Both throw a clear error until wired up.

**Client:** core systems (elixir, camera transition, tower HP, win condition, deck/hand rotation, auto-unit FSM) are written but unverified — this repo doesn't include a Unity install, so nothing here has compiled against the Editor or Photon Fusion's actual API yet. Treat it as a strong first draft, not tested code.

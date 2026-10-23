# Mobidictum Ventures application — FP Clash

Target: https://mobidictum.com/ventures/#apply (rolling application, no deadline, reaches the Ventures team directly).

## Why FP Clash over the other two portfolio candidates

Picked over Afterbeat (rhythm game) and Lander (Steam-only, wrong platform for a mobile-games
fund): FP Clash is the only one of the three with an actually-running **live-service backend** —
real auth, matchmaking, a session registry, dual-platform IAP receipt verification with
replay protection, Elo rating, and a leaderboard — which is the shape of product a games
company-builder underwrites (a service with a growth/retention/monetization loop), not a
single-player client. Afterbeat has no backend at all yet and its iOS build is blocked on a
missing Simulator runtime in this environment, so there is nothing operational to point to
beyond the game client itself. FP Clash has a second, smaller client (the shipped Unity MVP)
plus a web client, both talking to one real backend, which gives Ventures something to actually
click through and test.

---

## Application field values

**Name:** Arhan Subasi

**Email:** subasiarhan3@gmail.com

**Company:** No separate legal entity yet — founder-led, pre-incorporation. (Fill in your
studio/LLC name here if you've since set one up; otherwise this is accurate as written.)

**Website:** No public site or store listing yet. Use the GitHub repo as the primary link:
`https://github.com/caelum0x/fp_clash` — a public fork of the private `farukeskc/fp_clash`
collaboration repo (the origin itself stays private since only its owner can flip that; the
fork's full history, including both co-authors' commits, is public and clickable).

**Project description:** (paste the text below)

---

## Project description (paste into the application form)

FP Clash is a tower-push PvP game built around a single idea: instead of only deploying
troops Clash-Royale-style, you possess one unit and fight for it directly while the rest of
your side battles on autopilot. It's being built by a two-person founding team (myself and a
collaborator, co-credited in the repo's commit history) as a monorepo with three parts: a
Unity game client, a React web client, and a Node/TypeScript backend — all three runnable
today.

**What's live and working right now:**

- A playable Unity MVP: pick one of four champions, drop into a 5-a-side tower-push match
  (you plus 4 ally bots vs. 5 enemy bots), destroy the enemy King tower to win. Virtual
  joystick + attack button, portrait, one-handed — runs today in the Unity 6 LTS editor.
- A real backend service (Fastify + TypeScript + Prisma + Postgres + Redis, ~1,700 lines
  across 10 modules: auth, profile, cards, matchmaking, economy, leaderboard, players,
  matches, sessions, analytics). 115 unit tests and 9 integration tests against real
  Postgres/Redis pass today; `tsc --noEmit` is clean.
- Working auth (guest login + Apple/Google upsert + refresh-token rotation), a card/deck
  system with hero-slot validation, MMR-based matchmaking that allocates a persisted Redis
  session record, and real-time match-found push over WebSocket (with poll fallback), verified
  correct across multiple backend instances via a Redis pub/sub notifier.
- **Server-side IAP verification for both stores** — Apple `verifyReceipt` (prod-to-sandbox
  fallback) and Google Play Developer API (service-account OAuth) — with gems granted strictly
  from a server-side product catalog keyed by the store-verified product ID, never a
  client-supplied amount. A specific anti-abuse fix already shipped: the same receipt
  resubmitted twice (client retry or deliberate replay) is detected via an idempotency check
  against stored purchases and returns the original grant instead of paying out gems again —
  closing the same replay-grant bug class that free-to-play games get hit with in production.
- A matchmaking reliability fix already shipped: a Redis-backed single-leader lock so the
  matcher's tick loop is safe to run with more than one backend instance, instead of two
  instances double-matching the same queued players.
- A React/Vite web client with guest login, deck builder, matchmaking queue (WS-accelerated),
  leaderboard, and match history — 21 tests passing.
- A Unity-side SDK layer (`Services/`) already wired against the real backend over
  UnityWebRequest with bearer + refresh tokens — auth, matchmaking, session, player, and
  economy clients are implemented and callable from the game client today.

**What's honestly not built yet (no inflation):**

- The MVP's "5v5" is the player plus 9 bots — there is no live player-vs-player netcode
  running yet. The matchmaking/session backend above is real and tested, but the realtime
  match simulation it hands off to (Photon Fusion, server-authoritative hero movement +
  lag-compensated hit validation) is a documented architecture decision, not shipped code —
  the one remaining wiring point is the `NetworkRunner.StartGame` call on a real allocated
  room.
- Nothing is deployed publicly. There is no live backend URL, no App Store/Play listing, and
  therefore zero live users or revenue today. Everything above runs and is tested locally and
  in CI-shaped test suites, not in production.
- No signed Apple/Google developer account work has happened yet (store listings, IAP
  product records) — that's account-side work, not a code gap.

**What funding/operational support would unlock:** capital to finish the Photon Fusion
integration and ship real 1v1 PvP (the actual differentiator versus deploy-and-wait tower-push
games), a publisher/investor introduction given the live-service backend is already most of
the way there, and App Store/Play Store guidance for a category (tower-push PvP) with an
established audience and proven monetization pattern (battle pass + direct card shop +
cosmetics, already scoped in the PRD).

**Links:**
- Repo (public): `https://github.com/caelum0x/fp_clash`
- Product scope: `PRD.md` in the repo
- Technical architecture + implementation status: `ARCHITECTURE.md` in the repo
- Developer guide / how to run both clients and the backend locally: `DEVELOPMENT.md` in the
  repo

---

## Owner-only steps (not done here — need real login/payment/personal info)

1. Decide on and fill in an actual company/entity name on the form, if one exists or gets
   created before applying.
2. Actually submit the form at https://mobidictum.com/ventures/#apply — this needs a real
   name/email/session and is a one-time human action, not something to automate.

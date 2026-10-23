# Build log

Running log of real feature/fix work on this repo, newest first. Not a plan doc —
only things actually implemented, verified, and pushed.

## 2026-10-24 — Real 1v1 PvP relay transport (the documented netcode gap)

**Gap found:** `HACKATHON-MOBIDICTUM-VENTURES-APPLICATION-2026-10-23.md` and
`ARCHITECTURE.md` both flagged the same honest gap — matchmaking and session
allocation were real, but nothing carried gameplay frames between the two
matched clients for the actual match. `NetworkBootstrap.StartTransport` was a
comment pointing at `runner.StartGame(...)` (Photon Fusion) with no concrete
transport behind the default `local` provider at all, and
`CardDeploymentManager.RequestDeploy` was a bare TODO.

**Why not Photon Fusion directly:** wiring `SESSION_PROVIDER=photon` for real
needs a Photon account signup and a live `PHOTON_APP_ID` plus the Fusion SDK
package — an owner credential/account step this agent can't do unattended.
Rather than leave the `local` provider (the actual default, what every
existing session allocates today) with zero transport behind it, built the
real thing the backend already owns: a WebSocket relay.

**Shipped:**
- `services/src/modules/sessions/relay.ts` — the real-time transport behind
  `SESSION_PROVIDER=local`. Registers connected sockets per session, forwards
  frames between the two participants, and fans out across API instances via
  Redis pub/sub (same shape as `modules/matchmaking/notifier.ts`).
- `GET /sessions/:id/relay` (WS) — auth via `?token=` (same pattern as the
  matchmaking subscribe socket), rejects non-participants the same
  not-found-not-forbidden way the existing `GET /matches/session/:id` does,
  sends a `welcome` frame reporting the caller's host/guest role
  (`sessionStore.hostPlayerId` — deterministic: first participant in
  allocation order, so both sides agree with no election), then relays
  anything else verbatim. Frame size capped at 16KB to stop a misbehaving
  client from flooding the Redis channel.
- `startSessionRelay()` wired into `services/src/index.ts` boot, mirroring
  the existing match notifier subscriber.
- `client/Assets/Scripts/Services/MatchRelayClient.cs` — Unity-side transport
  over `ClientWebSocket`, same off-thread-receive/main-thread-drain shape as
  the existing `MatchSubscription`. Exposes `IsHost`, `IsConnected`,
  `OnWelcome`/`OnFrame`/`OnError`.
- `NetworkBootstrap` now actually starts this transport for the `local`
  provider instead of doing nothing; `photon` cleanly no-ops with
  `OnJoinFailed("photon_not_wired")` until the account/SDK blocker above
  clears. Exposes `IsHost`, `IsRelayConnected`, `SendMatchFrame`, and
  `OnMatchFrame`/`OnRoleAssigned` events for gameplay code to consume.
- `CardDeploymentManager.RequestDeploy` now actually sends a `deploy_input`
  frame over the live transport (still never spawns locally first — only
  sends the request, so a rejected/undelivered deploy can't desync from
  the host).

**Verified by actually running it** (real local Postgres `siegebreak_test` +
real local Redis, `npx tsx src/index.ts` on a real port, no mocks): scripted
two real guest signups → real `/matchmaking/queue` → real matcher tick pairs
them → real `WS /matchmaking/subscribe` push delivers the same `sessionId` to
both → both connect to the real `WS /sessions/:id/relay` → server reports
exactly one of the two as host (deterministic, verified not-equal) → a real
`deploy_input` frame sent from the non-host arrives byte-identical on the
host, and a `state_snapshot` frame sent back arrives identical on the guest.
Existing suites unaffected: 115 unit + 14 integration tests (real Postgres +
Redis) still green; `tsc --noEmit` clean. No test files added or edited.

**Deliberately not touched this round:** the MVP Unity scene's actual combat
loop still spawns bots rather than driving off `OnMatchFrame` end-to-end (the
transport is real and verified at the message level; wiring it into the
gameplay scene's unit-spawn/tower-damage code is a follow-up); Photon Fusion
integration itself (blocked on the account signup above — tracked, not
silently dropped).

**Next up (not yet done):** wire the MVP scene's combat loop to consume
`OnMatchFrame`/`OnRoleAssigned` for real (so the shipped build plays a real
opponent instead of bots), deck duplicate-card validation, elixir-curve cap,
chest/shop UI for the shard economy.

## 2026-10-23 — Card collection & progression economy (shards + upgrades)

**Gap found:** `PlayerCard` (level/shards per owned card) existed in the Postgres
schema and migration but was never read or written anywhere in `services/src` —
new players owned zero cards, matches paid out gold/xp but no shards, and there
was no endpoint to spend gold/shards on anything. The economy had an earn side
(match gold) with no sink, and a progression model (`PlayerCard`) that was
completely dead code.

**Shipped (backend, `services/src`):**
- `lib/cardProgression.ts` — pure functions: starter card set, per-level
  gold+shard upgrade cost curve, max level (10), shards-per-card-per-match-result.
- New players (`/auth/guest`, `/auth/apple`, `/auth/google`) now start owning a
  curated 4-card set (1 hero + 3 troops) via nested Prisma create on signup.
- `POST /matches/:id/complete` now also awards card shards for every distinct
  card in the deck a participant actually fielded (looked up by `deckId`),
  scaled by win/draw/loss — best-effort, outside the main rating/xp/gold
  transaction (same tradeoff already used for the Redis leaderboard write).
- `GET /players/me/cards` — owned collection with level/shards/next-upgrade-cost.
- `POST /players/me/cards/:cardId/upgrade` — spends gold (wallet) + shards
  (that card) to increment level; 404 if not owned, 400 at max level, 402 if
  short on either resource.

**Verified by actually running it** (local Postgres `siegebreak_test` +
local Redis, `npx tsx src/index.ts`, real `curl` calls — no new test files
added per owner instruction): guest signup → 4 starter cards appear in
`/players/me/cards` → real `/matches/:id/complete` call with a real saved
deck → shards (+3/card, win) and gold (+10) land → insufficient-resources
(402) and not-owned (404) upgrade attempts correctly rejected → granting
gold/shards directly in DB then upgrading moves level 1→2 and debits exactly
the posted cost → forcing level to the cap correctly returns `max_level` (400).
Existing unit (115) + integration (14) suites still green; only edit to an
existing test file was adding `deck`/`playerCard` mocks to
`test/matches.test.ts` so the new best-effort call doesn't throw against the
mocked Prisma client (default resolves to "deck not found", matching the
real no-op-on-missing-deck behavior) — no new test files, no new test cases.

**Deliberately not touched this round:** deck-creation ownership/duplicate-card
validation (the `cards/index.ts` comment flagging it predates this work) —
enforcing "must own every slotted card" would break the existing
`test-integration/flows.test.ts` onboarding flow, which creates a deck from the
full catalog before any match is played; needs a product decision on whether
deck-building should be catalog-wide (current behavior, kept) or collection-only
before that validation ships.

**Next up (not yet done):** real 1v1 netcode (Photon Fusion `NetworkRunner.StartGame`
wiring — the one documented gap in `HACKATHON-MOBIDICTUM-VENTURES-APPLICATION-2026-10-23.md`),
deck duplicate-card validation, elixir-curve cap, chest/shop UI for the new
shard economy on the web/Unity clients.

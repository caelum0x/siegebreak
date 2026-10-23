# Build log

Running log of real feature/fix work on this repo, newest first. Not a plan doc —
only things actually implemented, verified, and pushed.

## 2026-10-24 — Combat loop wired to the real relay (bots → real opponent)

**Gap found:** the previous round shipped a verified, real 1v1 relay transport
(`WS /sessions/:id/relay` + `MatchRelayClient`), but nothing on the client
consumed it for gameplay. `NetworkBootstrap.OnMatchFrame`/`OnRoleAssigned`
had no subscriber, `CardDeploymentManager` only ever sent a frame into the
void, and there was no code anywhere that spawned a unit from a deploy,
ran `AutoUnitAI` against a real target, applied combat damage, or turned a
destroyed king tower into a broadcast match result. The MVP scene's "5v5"
build was still bots-only by construction, not just by content.

**Shipped (Unity client, `client/Assets/Scripts`):**
- `Cards/CardCatalog.cs` — a `CardData[]`-backed ScriptableObject lookup by
  `cardId`, so the host simulator can resolve *either* player's deploy
  (not just the local hand `DeckManager` already knows).
- `Cards/CardData.cs` — extended with combat stats (`hp`, `dps`,
  `attackRange`, `spawnCount`, `targets: TargetMode`) mirroring the
  backend seed's `baseStats` shape (`services/src/db/seed.ts`).
- `Units/UnitHealth.cs` (new) + `Core/TowerController.SyncFromSnapshot`
  (added) — HP with host-side `ApplyDamage` and guest-side
  `SyncFromSnapshot` reconciliation, same shape on both a troop and a
  tower.
- `Units/SpawnedUnit.cs` (new) — identity tag (`unitId`, owning `CardData`,
  host/guest ownership) attached to every spawned unit on both sides.
- `Units/AutoUnitAI.cs` — `ServerTick` now takes `deltaTime` and actually
  fires `OnAttackTick` on a real attack-speed timer instead of a TODO
  comment; added `Configure(range, intervalSeconds)` so the host can set
  per-card attack stats instead of relying on prefab defaults. Removed the
  now-redundant `targetsBuildingsOnly` field — targeting mode moved up to
  `CardData.targets`/`TargetingUtil`, one source of truth instead of two.
- `Core/TargetingUtil.cs` (new) — real nearest-enemy-unit-or-tower
  selection respecting `TargetMode` (buildings-only siege units skip
  troops entirely).
- `Core/MatchWireFrames.cs` (new) — `deploy_input`/`state_snapshot` DTOs +
  tolerant JsonUtility parse helpers for the host/guest frame exchange.
- `Core/MatchHostSimulator.cs` (new) — the actual authoritative
  simulation: validates + spends elixir on a deploy, spawns the unit(s),
  ticks every unit's `AutoUnitAI` against `TargetingUtil`, resolves
  unit-vs-unit/unit-vs-tower/tower-vs-unit damage, feeds
  `MatchStateController.ServerTick`, and broadcasts a full
  `state_snapshot` at 10Hz.
- `Core/MatchSnapshotRenderer.cs` (new) — the guest-side counterpart:
  spawns/moves/HP-syncs/despawns units by `unitId` from each snapshot,
  disabling `AutoUnitAI`/`NavMeshAgent` on every spawned visual so the
  guest never runs a second simulation against the host's.
- `Core/MatchSimulationController.cs` (new) — the scene-level entry point
  that ties it together: owns the host/guest branch off
  `NetworkBootstrap.IsHost`, exposes `RequestLocalDeploy(card, position)`
  as the one call the HUD/placement UI needs (host applies directly since
  the relay never echoes a client's own frame back to it; guest sends over
  the wire via the existing `CardDeploymentManager`), and routes incoming
  `OnMatchFrame` frames to the host simulator (`deploy_input`) or the
  guest renderer (`state_snapshot`) by type.
- `Core/ElixirManager.SyncFromServer` / `Core/MatchStateController.SyncResultFromServer`
  — small reconciliation setters so the guest's elixir bar and match-result
  UI can mirror the host's authoritative values instead of drifting.

**Not run through the Unity Editor** (none is installed in this sandbox —
no `unity`/`mono`/`csc`/`dotnet` binary available, same constraint the
previous round hit for its own client-side changes): verified by brace/paren
balance across every new/edited file, cross-checking every changed method
signature against every call site by hand, and matching every new type's
field names/visibility exactly against the existing codebase's own
conventions (JsonUtility DTOs, SerializeField wiring, event patterns). The
backend relay this plugs into remains the real, server-verified transport
from the previous round — nothing there changed. First real compile/play
pass needs an actual Unity Editor, which is an owner-side environment step,
not a code gap.

**Deliberately not touched this round:** spell/hero cards aren't deployable
through this path yet (`MatchHostSimulator.HandleDeployRequest` explicitly
rejects non-troop/building types — spells are an instant effect, heroes are
already on the field via `HeroController`, neither fits "spawn a prefab at a
point"); no prefabs/scene exist in the repo to actually place `CardCatalog`
entries into yet (this is still a scripts-only client — there's no
`Assets/ScriptableObjects` or `.unity` scene checked in), so `hostTowers`/
`guestTowers`/`catalog` on `MatchSimulationController` are Inspector wiring
for whoever builds the first real scene, same as every other
`[SerializeField]` reference in this codebase today; king-tower aggro
unlock-after-princess-falls (a real CR rule) isn't modeled — any tower
defends independently; no client-side elixir prediction/smoothing on the
guest (it mirrors the host's value directly every snapshot instead of
ticking its own copy between snapshots) — deferred as a polish pass, not a
correctness gap. Deck duplicate-card validation and the elixir-curve cap
flagged in the last two rounds are still outstanding — no new information
on either this round.

**Next up:** build the actual MVP `.unity` scene + `CardData`/prefab assets
so this combat loop can be played and Editor-verified for real instead of
reviewed by hand; elixir-curve cap + deck duplicate-card validation; chest/
shop UI for the shard economy; Photon Fusion wiring once `PHOTON_APP_ID`
exists.

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

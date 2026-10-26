# Build log

Running log of real feature/fix work on this repo, newest first. Not a plan doc —
only things actually implemented, verified, and pushed.

## 2026-10-26 — Real match results were unreachable + a matchmaking ghost-opponent bug

**Gap found (the big one):** every piece of the progression backend built
across the last several rounds — Elo rating, XP, gold, card shards, match
history, the Redis leaderboard — was completely unreachable for any match
actually played over the only working transport. `POST
/matches/:id/complete` is gated by `requireMatchServer`
(`MATCH_SERVER_SECRET`), explicitly "never by a client" — but under
`SESSION_PROVIDER=local` there is no separate trusted game server; the host
*client* runs the authoritative simulation (`MatchHostSimulator`) and is the
only thing that ever learns the real outcome. Confirmed this by reading
`MatchStateController.Finish()`: it was a bare `// TODO: notify
NetworkBootstrap / backend to record match result` with no code behind it,
and grepping the whole client + services tree found zero callers of
`/matches/:id/complete` anywhere outside tests. A fully played real 1v1
(real matchmaking, real WS relay, real king-tower-destroyed win) would just
vanish — zero effect on rating/XP/gold/shards/history/leaderboard.

**Second gap found while probing the first one (real, reproduced):** nothing
in `/matchmaking/queue` checked a caller's existing ticket state before
re-enqueueing them. Scripted a real repro against the real backend: A and B
queue and get matched into session S1; A calls `/matchmaking/queue` again
(simulating a client retry-on-timeout, an app background/foreground
re-firing "find match", or a player just abandoning a losing match on
purpose); A gets paired into a brand new session S2 with a third player C.
B's ticket still points at S1 — nobody else ever connects to that session's
relay, there's no timeout, and B is permanently stuck with no way to detect
or recover. Confirmed via `/tmp/sb_probe2.mjs` against a real running
instance before the fix (A ends up in S2, B still shows `sessionId: S1`, C
is in S2 with A — three real players, two real stuck/duplicated sessions).

**Shipped (backend, `services/src`):**
- `modules/matches/index.ts` — extracted the actual match-recording logic
  (idempotency check, Elo, XP/gold/level updates, the DB transaction,
  leaderboard write, card-shard award) out of the route handler into an
  exported `completeMatch(id, body)`, reusable by any caller that's allowed
  to report a result. The trusted-server route is now a thin wrapper around it.
- `modules/sessions/index.ts` — new `POST /sessions/:id/complete` (JWT
  `requireAuth`, not the server secret). Only the session's deterministic
  host (`sessionStore.hostPlayerId` — same "first participant" rule the
  relay already uses) may call it; a non-host gets the same
  not-found-not-forbidden 404 the relay route already uses. Validates the
  reported participant set is *exactly* this session's participants (no
  substitutions), rejects an invalid result pairing for the 1v1 mode (e.g.
  both players "win"), and derives `deckId`/`trophiesDelta` itself from the
  session record and a new pure `trophyDelta()` helper rather than trusting
  either from the request — the host can tell us who won, nothing else.
  This doesn't make the host a trusted server the way `MATCH_SERVER_SECRET`
  is trusted (a motivated host could still misreport the win/loss itself) —
  that's an inherent limit of not having a dedicated server for the "local"
  provider, same posture as every other doc in this repo about that
  provider. It closes the "every real match vanishes" gap, which is
  strictly worse.
- `lib/rating.ts` — added `trophyDelta(result)`: flat ±30 win/loss, 0 draw.
  Deliberately simple (same tradeoff as the deferred elixir-curve cap) — a
  real trophy curve is a product decision, not a code gap.
- `modules/matchmaking/index.ts` — `/matchmaking/queue` now checks the
  caller's existing ticket before re-enqueueing: if it's `"matched"` and the
  session behind it is still live (`getSession` returns non-null), reject
  with `409 already_in_match` instead of silently creating a second session
  and stranding whoever they were already matched with. If the session is
  gone (past its 1h TTL, or already completed — see below), the stale ticket
  is treated as harmless and the queue proceeds normally.
- `modules/sessions/index.ts` — on a successful `/sessions/:id/complete`,
  both participants' matchmaking tickets are cleared (`dequeue`) immediately
  so they're free to queue for a real next match right away instead of
  waiting out the session's 1h TTL (which would otherwise make the new
  `already_in_match` guard above block **every** legitimate second match).

**Shipped (Unity client, `client/Assets/Scripts`):**
- `Core/MatchStateController.cs` — `Finish()` now raises a new
  `event Action<MatchResult> OnMatchFinished` instead of doing nothing. Only
  the host's own copy of this controller ever reaches `Finish()` (the guest
  only ever calls `SyncResultFromServer`, which doesn't raise the event), so
  whoever subscribes gets exactly one real, host-authoritative result.
  Documented the `PlayerAWins == host won` / `PlayerBWins == guest won`
  convention on the enum itself (host-first, matching
  `sessionStore.hostPlayerId` / `RelayWelcome.participants[0]` everywhere
  else in this codebase — there was no scene/prefab wiring yet to have
  established or contradicted this, since it's still a scripts-only client).
- `Networking/NetworkBootstrap.cs` — exposes the joined `SessionId` so
  gameplay code doesn't need its own copy plumbed through separately.
- `Services/SessionClient.cs` / `Services/Dtos.cs` — new
  `CompleteMatch(sessionId, participants)` HTTP call and its DTOs.
- `Core/MatchSimulationController.cs` — subscribes to
  `matchState.OnMatchFinished` and `network.OnRoleAssigned` (to capture
  `RelayWelcome.participants`, host-first); on finish, only if this client
  is host and only once per match, maps `PlayerAWins/PlayerBWins/Draw` onto
  win/loss/draw for the two real player ids and calls
  `SessionClient.CompleteMatch`.

**Verified by actually running it** (real local Postgres + real local Redis
in fresh Docker containers on non-default ports, real `npx tsx
src/index.ts`, real HTTP + WS clients driving the real server — no mocks):
- Two real guest signups → real deck creation → real `/matchmaking/queue` →
  real matcher tick pairs them → both connect to the real `WS
  /sessions/:id/relay` → server reports exactly one as host.
- Guest tries `POST /sessions/:id/complete` → real `404 session_not_found`
  (rejected, can't tell "not your call" from "doesn't exist").
- Host reports a real win/loss → real `201 recorded`; confirmed via `GET
  /players/me` that rating moved by real Elo math (1000→1016 / 1000→984 for
  an even matchup), XP/gold landed per `matchRewards`, confirmed via `GET
  /players/me/cards` that all 8 deck cards gained shards, confirmed `GET
  /leaderboard/s1` shows both real trophy deltas, confirmed `GET
  /players/me/matches` shows the real match history entry.
- Host replays the same completion → real `409 already_recorded`.
- A separate "both players win" pairing → real `400
  invalid_result_combination`.
- Pre-fix repro of the ghost-opponent bug (`/tmp/sb_probe2.mjs`): confirmed
  the stray second match actually formed (A ends up in a new session with C
  while B's ticket is still pointed at the original, dead one).
- Post-fix: the identical re-queue-while-matched attempt now gets real `409
  already_in_match`, A's ticket stays on the original session, C never gets
  paired with A (stays `"queued"`) — the stranding scenario no longer forms.
- Post-fix, complementary check: after a real `/sessions/:id/complete`
  success, both players immediately get `200 queued` on a fresh
  `/matchmaking/queue` call — confirms the new guard didn't accidentally
  make legitimate second matches impossible.
- `tsc --noEmit` clean. 115 unit + 14 integration tests (real Postgres +
  Redis) still green, unmodified.
- Unity-side changes were **not** run through the Unity Editor — none is
  installed in this sandbox (no `unity`/`mono`/`csc`/`dotnet` binary
  available), same constraint every prior client-side round hit. Verified by
  brace/paren balance across every edited file and cross-checking every new
  event/method signature against every call site by hand. This is a real,
  still-open owner-side environment gap (Unity Hub + Editor needs to be
  installed on a machine that has one) — not something this round could
  close, and already tracked in `PORTFOLIO-PRIORITIES-2026-10-23.md` item 7.

**Deliberately not touched this round:** the season-rotation concept this
leans on (`MATCH_SEASON_ID`, defaulted to the single evergreen `"s1"`) is a
new minimal default, not a real season system — rotating seasons is a
product decision; the elixir-curve cap and deck-ownership validation flagged
in prior rounds are still outstanding, no new information on either.

## 2026-10-24 — Deck validation: duplicate cards + unknown card IDs now rejected

**Gap found:** `POST /players/me/decks` only ever validated slot 0 (must be a
hero). Slots 1-7 were never checked against the card catalog at all — any
string would be accepted and saved, including the same card repeated 8 times.
The route's own comment already flagged this ("Duplicate-card ... validation
should land here too before this ships").

**Shipped (backend, `services/src/modules/cards/index.ts`):**
- Reject a deck where any card ID repeats (`duplicate_card_in_deck`, 400) —
  checked after the slot-0 hero check so the existing "slot 0 must be hero"
  error still wins when both are true (matches the existing integration test's
  expectation).
- Reject a deck where any of slots 1-7 don't name a real card
  (`unknown_card_in_deck`, 400) via a real `prisma.card.findMany` lookup
  against the catalog, instead of trusting the client.
- Deliberately left the elixir-curve cap out of this round: the PRD gives a
  per-card cost range (1-9, hero fixed at 5) but no numeric average/sum cap to
  enforce — inventing a threshold isn't a code fix, it's a product decision
  still open.

**Verified by actually running it** (real local Postgres `siegebreak_test` +
real local Redis, `npx tsx src/index.ts` on a real port, no mocks): guest
signup → real `curl` deck-create with a repeated card → `400
duplicate_card_in_deck`; deck-create with a fabricated card ID in a non-hero
slot → `400 unknown_card_in_deck`; deck-create with 8 real, unique cards →
`200` with the deck persisted. Existing suites unaffected: 115 unit + 14
integration tests (real Postgres + Redis) still green, `tsc --noEmit` clean.
Only edit to an existing test file was adding a `card.findMany` mock to
`test/cards.test.ts` so the new lookup doesn't throw against the mocked
Prisma client — no new test files, no new test cases.

**Next up (not yet done):** elixir-curve cap (needs a product decision on the
actual number), deck ownership validation (must-own-every-slotted-card — still
blocked on the catalog-wide vs. collection-only decision noted in the prior
round), chest/shop UI for the shard economy, the actual MVP `.unity` scene so
the combat loop shipped last round can be Editor-verified for real.

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

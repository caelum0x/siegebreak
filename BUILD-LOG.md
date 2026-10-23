# Build log

Running log of real feature/fix work on this repo, newest first. Not a plan doc —
only things actually implemented, verified, and pushed.

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

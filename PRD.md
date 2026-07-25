# Siegebreak — Product Requirements Document (v0.1)

Working title. Rename freely — "Siegebreak" is a placeholder so the doc has something to call the game.

## 1. One-liner

Real-time tower-push strategy where you don't just deploy troops — you possess one and fight in first-person while the rest of your deck battles on autopilot.

## 2. Genre & positioning

- Genre: FPS-hero / tower-push hybrid, competitive PvP, 2–4 minute sessions.
- Closest reference point for the economy/win-condition layer: Clash Royale.
- Closest reference point for the hybrid commander+FPS control split: Savage 2 and Battlezone (1998) — worth a design pass through both, they solved versions of this problem 15–25 years ago.
- Differentiator: no other tower-push game gives you direct FPS control of a unit while the rest of the board plays out CR-style.

## 3. Core gameplay loop

- **Match structure:** 1v1, win by tower destruction; if both king towers stand at 3:00, most tower damage wins (Clash Royale's 2:00 + 1:00 OT structure, tune later).
- **Arena:** king tower + 2 side towers per player, 3 lanes at full scope.
- **Elixir:** regenerates 1 per 2.8s up to a 10 cap; cards cost 1–9 elixir; hero costs 5.
- **Deck:** 8 slots — 1 Hero (mandatory) + 7 support cards (troops / spells / buildings).
- **Camera modes:**
  - *Command View* — top-down, deploy cards, read the board.
  - *Battle View* — first-person, hero control.
  - Toggle is manual; defaults to Command whenever no hero is on the field.
- **Hero lifecycle:** deploy (5 elixir) → spawn → player possesses in FPS → primary attack + one cooldown ability → death sends the hero to a respawn queue (elixir cost again to redeploy) OR the player can manually recall it back to base early, trading board presence for safety.
- **Auto-units:** NavMesh pathing to the nearest valid enemy structure in-lane, simple state machine (move → engage → attack), CR-style targeting priority (ground vs. air, building-only aggro for siege units).

## 4. Progression & meta

- Player level via card XP.
- Card upgrades via shards + soft currency (open question — see §9).
- Ranked ladder: seasonal, Glicko-2 MMR, trophy reset each season.
- Collection model: chest RNG vs. direct shop is an open question — flag EU loot-box disclosure rules if going the chest route.

## 5. Monetization

- Seasonal battle pass.
- Direct card-unlock shop.
- Cosmetics: hero skins, and — unique to this genre mashup — **first-person viewmodel skins** (weapon/hand skins). No top-down CR-like can sell this; it's a real differentiated margin lever and should get real production budget, not be an afterthought.
- IAP currency packs, server-validated (see Architecture §5).

## 6. Platforms

- Cross-play PC (Steam) + Mobile (iOS/Android).
- Mobile input is the single highest UX risk in the whole product: touch-move + aim-assist with manual override, or virtual joystick + tap-to-fire, needs a dedicated prototyping pass before committing.

## 7. Out of scope for v1

- 3v3 or larger modes
- Spectator mode
- Clans/guilds
- Replay UI (backend should still log the data needed to build this later — see match telemetry in Architecture §6)

## 8. Success metrics

- D1 / D7 / D30 retention vs. tower-push genre benchmarks.
- Average session length, matches per session.
- Battle View engagement rate (% of match time spent possessing the hero) — a genre-specific metric worth instrumenting from day one, since it's the whole pitch.

## 9. Open design questions

- Chest RNG vs. direct shop for card acquisition.
- Card upgrade currency model (shards only vs. shards + gold).
- Launch hero roster size (recommend 6–8 heroes, 30–40 support cards — enough for deck diversity without diluting balance testing).
- Ship 1 lane or 3 lanes at launch.

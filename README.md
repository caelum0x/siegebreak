# FP Clash — MVP

A third-person take on Clash Royale: pick a champion, drop into a **5v5 deathmatch**
(you + 4 ally bots vs 5 enemy bots), and destroy the enemy **King tower** to win.
Vertical/portrait, one-handed: **virtual joystick** to move, **ATK button** to swing.

## How to run
1. The whole game is generated at runtime from one bootstrap object.
2. Open **`Assets/Scenes/Game.unity`** and press **Play**.
   - ⚠️ First open only: I set *Active Input Handling* to **Both** (Project Settings ▸ Player).
     Unity will ask to **restart the editor** — do that so the touch UI + editor keyboard both work.
3. Editor testing without a device: **WASD / arrows** move, **Space or Left-Click** attacks.

## Controls
- **Left joystick** — move. A third-person camera trails behind + above the character
  and rides your facing, so pushing up always goes "forward" and pushing sideways curves your look.
- **ATK button (bottom-right)** — melee swing; hold to keep swinging. The ring shows cooldown.

## Flow
Character Select → Match → (die → 4s respawn as a full team of 9 bots keeps fighting) →
King tower falls → Victory/Defeat → Play Again.

## Champions (roster in `CharacterConfig.cs`)
P.E.K.K.A (tanky, huge hits), Knight (balanced), Valkyrie (360° spin), Goblin (fast, fragile).

## Architecture (all under `Assets/Scripts/`, everything built in code — no prefabs)
- **Core/** — `GameBootstrap` (entry point in the scene), `GameManager` (match/respawn/win),
  `Health`, `Combatant` (IDamageable + target registry), `CharacterConfig`, `Prims` (runtime meshes/materials).
- **Characters/** — `Unit` (health, body, melee, death/respawn), `PlayerController` (joystick + FP camera),
  `BotController` (steer / target / attack).
- **Towers/** — `Tower` (King + 2 Princess, auto-fire), `Projectile`.
- **Arena/** — `ArenaBuilder` (field, walls, river, tower & spawn layout).
- **UI/** — `UIManager` (select/HUD/game-over), `VirtualJoystick`, `AttackButton`,
  `ScreenHealthBars` (floating bars), `UIFactory`.
- **Input/** — `InputHub` (touch ↔ gameplay bridge).

## Tuning knobs
- Champion stats: `CharacterConfig.Roster`.
- Tower HP/damage/range: `Tower.Setup`.
- Arena size / tower positions: `ArenaBuilder` constants.
- Respawn time, team size: `GameManager`.

## Known MVP simplifications
- Bots use straight-line steering (no NavMesh) — fine on the open flat field.
- Shaders are found at runtime (`Universal Render Pipeline/Lit`); for a **built player**
  add that shader to *Always Included Shaders* (Project Settings ▸ Graphics) or it may strip.
- No networking — the "5v5" is the player + 9 bots, exactly as scoped.

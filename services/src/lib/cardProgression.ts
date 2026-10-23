// Pure card-collection progression math — no DB, no side effects. Mirrors the
// separation already used by lib/rating.ts: the rules are easy to reason
// about (and change) in isolation from the routes/transactions that apply
// them.
//
// This is the piece that was missing end-to-end: the schema already had
// PlayerCard.level/shards and the cards route comment already flagged
// ownership/duplicate validation as unshipped, but nothing ever wrote to
// PlayerCard — new players owned zero cards, matches never paid out shards,
// and there was no upgrade endpoint to spend them. This file plus the routes
// that call it wire the whole loop: play a match with a card in your deck ->
// earn shards for it -> spend shards + gold to level it up.

import type { MatchResult } from "./rating";

// A small, curated starter set (not the full 10-card seed catalog) granted to
// every new Player row on signup so a fresh account already has something to
// view/upgrade in the collection screen on first login, before any match has
// been played. Includes exactly one hero, matching the "slot 0 must be hero"
// deck rule.
export const STARTER_CARD_IDS: readonly string[] = [
  "hero_vanguard",
  "troop_shieldbearer",
  "troop_swarm",
  "troop_archer",
];

// Cards stop earning further shard sinks past this level — a hard ceiling so
// the cost curve below never has to extrapolate past a tested range.
export const MAX_CARD_LEVEL = 10;

export interface UpgradeCost {
  gold: number;
  shards: number;
}

// Cost to go from `currentLevel` to `currentLevel + 1`. Both resources grow
// with level so early upgrades are cheap (hook a new player fast) and late
// ones are a real sink (the whole point of a soft-currency economy — without
// this, gold earned from matches had nowhere to go).
export function upgradeCost(currentLevel: number): UpgradeCost {
  return {
    gold: 100 * currentLevel,
    shards: 5 * currentLevel,
  };
}

export function isMaxLevel(level: number): boolean {
  return level >= MAX_CARD_LEVEL;
}

// Shards awarded per *distinct* card in the deck a player actually fielded,
// per match, keyed by outcome. Deliberately smaller than matchRewards' xp/gold
// numbers (lib/rating.ts) since this pays out per-card, not once per match —
// a losing player with a full 8-card deck still nets more total shards than
// upgrading a single card requires in a few matches, which is the intended
// pace (progression from playing, not from grinding one card forever).
export function shardsPerCardForResult(result: MatchResult): number {
  switch (result) {
    case "win":
      return 3;
    case "draw":
      return 2;
    case "loss":
      return 1;
  }
}

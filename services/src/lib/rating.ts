// Pure rating + progression math — no DB, no side effects, so the rules can be
// unit-tested in isolation from the match-completion transaction that applies
// them.

export type MatchResult = "win" | "loss" | "draw";

const K_FACTOR = 32; // classic Elo development coefficient
const XP_PER_LEVEL = 1000;

// Score in Elo terms: a win is 1, a draw 0.5, a loss 0.
export function resultToScore(result: MatchResult): number {
  if (result === "win") return 1;
  if (result === "draw") return 0.5;
  return 0;
}

// Standard Elo update for a two-player match. `scoreA` is A's outcome
// (win=1/draw=0.5/loss=0); B's is the complement. Returns the new integer
// ratings for both. Ratings are symmetric — the points A gains B loses.
export function computeElo(
  ratingA: number,
  ratingB: number,
  scoreA: number
): { a: number; b: number } {
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const expectedB = 1 - expectedA;
  const scoreB = 1 - scoreA;
  return {
    a: Math.round(ratingA + K_FACTOR * (scoreA - expectedA)),
    b: Math.round(ratingB + K_FACTOR * (scoreB - expectedB)),
  };
}

// Soft-currency + XP granted for finishing a match, by outcome. Winners earn
// more, but losing/drawing still pays out so a session always feels productive.
export function matchRewards(result: MatchResult): { xp: number; gold: number } {
  switch (result) {
    case "win":
      return { xp: 30, gold: 10 };
    case "draw":
      return { xp: 15, gold: 5 };
    case "loss":
      return { xp: 10, gold: 2 };
  }
}

// Level is derived from total XP (1-based): every XP_PER_LEVEL of XP is a level.
export function levelForXp(totalXp: number): number {
  return 1 + Math.floor(Math.max(0, totalXp) / XP_PER_LEVEL);
}

// Symmetric trophy swing for a result, used by the host-reported completion
// path (modules/sessions/index.ts POST /sessions/:id/complete) where there's
// no dedicated server to hand us an authoritative trophiesDelta the way
// POST /matches/:id/complete expects. A flat, deliberately simple number —
// a real trophy curve (diminishing at high ranks, etc.) is a product
// decision, not a code gap, same posture as the deferred elixir-curve cap.
const TROPHY_DELTA = 30;
export function trophyDelta(result: MatchResult): number {
  if (result === "win") return TROPHY_DELTA;
  if (result === "loss") return -TROPHY_DELTA;
  return 0;
}

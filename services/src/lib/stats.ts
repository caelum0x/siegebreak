// Pure match-record aggregation — no DB, no side effects, so the counting and
// win-rate rules can be unit-tested in isolation from the Prisma groupBy that
// feeds them.

export interface PlayerRecord {
  wins: number;
  losses: number;
  draws: number;
  played: number;
  /** Wins / played as a fraction in [0, 1], rounded to 3 dp; 0 when unplayed. */
  winRate: number;
}

// Collapse a per-result count list (as returned by a `GROUP BY result`) into a
// single record. Unknown result strings are ignored rather than trusted, so a
// bad row can't inflate a total. Order-independent.
export function summarizeRecord(
  counts: readonly { result: string; count: number }[]
): PlayerRecord {
  let wins = 0;
  let losses = 0;
  let draws = 0;

  for (const { result, count } of counts) {
    if (result === "win") wins += count;
    else if (result === "loss") losses += count;
    else if (result === "draw") draws += count;
  }

  const played = wins + losses + draws;
  const winRate = played === 0 ? 0 : Math.round((wins / played) * 1000) / 1000;

  return { wins, losses, draws, played, winRate };
}

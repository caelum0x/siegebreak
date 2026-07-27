import { useEffect, useState } from "react";
import { getMe, getMyMatches } from "../api/client";
import type { MatchHistoryEntry, MatchResult, Me } from "../types";

// Fixed page size for the history list — the backend clamps anything larger,
// and 20 is plenty for a companion-client "recent matches" view.
const HISTORY_LIMIT = 20;

const RESULT_LABEL: Record<MatchResult, string> = {
  win: "Win",
  loss: "Loss",
  draw: "Draw",
};

function formatEndedAt(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : `${delta}`;
}

function opponentNames(entry: MatchHistoryEntry): string {
  if (entry.opponents.length === 0) return "—";
  return entry.opponents.map((o) => o.displayName).join(", ");
}

export function History() {
  const [me, setMe] = useState<Me | null>(null);
  const [matches, setMatches] = useState<MatchHistoryEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    // Load progression and history together; a failure in either surfaces one
    // error message rather than a partial, half-rendered page.
    Promise.all([getMe(), getMyMatches(HISTORY_LIMIT)])
      .then(([profile, history]) => {
        if (!active) return;
        setMe(profile);
        setMatches(history);
      })
      .catch(() => {
        if (active) setError("Failed to load your match history.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="page">
      <h2>Match History</h2>

      {loading && <p>Loading…</p>}
      {error && (
        <p className="alert alert--error" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && me && (
        <section className="history__profile" aria-label="Your progression">
          <span className="history__name">{me.displayName}</span>
          <span className="muted">Level {me.level}</span>
          <span className="muted">{me.xp} XP</span>
          <span className="muted">Rating {me.rating}</span>
          <span className="muted">
            {me.wallet.gold} gold · {me.wallet.gems} gems
          </span>
        </section>
      )}

      {!loading && !error && matches.length === 0 && (
        <p className="muted">No matches played yet. Jump in the queue!</p>
      )}

      {!loading && !error && matches.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Result</th>
              <th>Opponent</th>
              <th>Trophies</th>
              <th>Mode</th>
              <th>Played</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((entry) => (
              <tr key={entry.matchId}>
                <td className={`result result--${entry.result}`}>
                  {RESULT_LABEL[entry.result]}
                </td>
                <td>{opponentNames(entry)}</td>
                <td>{formatDelta(entry.trophiesDelta)}</td>
                <td>{entry.mode}</td>
                <td className="muted">{formatEndedAt(entry.endedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

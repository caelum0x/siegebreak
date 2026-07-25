import { useCallback, useEffect, useState } from "react";
import { getLeaderboard } from "../api/client";
import type { LeaderboardEntry } from "../types";

const DEFAULT_SEASON = "2026-s3";

export function Leaderboard() {
  const [seasonInput, setSeasonInput] = useState<string>(DEFAULT_SEASON);
  const [season, setSeason] = useState<string>(DEFAULT_SEASON);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((seasonId: string): (() => void) => {
    let active = true;
    setLoading(true);
    setError(null);
    getLeaderboard(seasonId)
      .then((rows) => {
        if (active) setEntries(rows);
      })
      .catch(() => {
        if (active) setError("Failed to load leaderboard.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => load(season), [season, load]);

  const onSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    const trimmed = seasonInput.trim();
    if (trimmed) setSeason(trimmed);
  };

  return (
    <main className="page">
      <h2>Leaderboard</h2>

      <form className="leaderboard__form" onSubmit={onSubmit}>
        <label className="field">
          <span className="field__label">Season</span>
          <input
            className="field__input"
            value={seasonInput}
            onChange={(e) => setSeasonInput(e.target.value)}
            placeholder={DEFAULT_SEASON}
          />
        </label>
        <button type="submit" className="btn btn--primary">
          View
        </button>
      </form>

      {loading && <p>Loading…</p>}
      {error && (
        <p className="alert alert--error" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && entries.length === 0 && (
        <p className="muted">No entries for season “{season}”.</p>
      )}

      {entries.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Player</th>
              <th>Trophies</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.playerId}>
                <td>{entry.rank}</td>
                <td className="mono">{entry.playerId}</td>
                <td>{entry.trophies}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

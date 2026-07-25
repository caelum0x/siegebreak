import { useEffect, useRef, useState } from "react";
import { cancelMatch, getDecks, getMatchStatus, queueMatch } from "../api/client";
import type { Deck, MatchTicket } from "../types";
import { MatchFound } from "./MatchFound";

type QueueState = "idle" | "queued" | "matched";

const POLL_INTERVAL_MS = 1000;

export function Queue() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string>("");
  const [state, setState] = useState<QueueState>("idle");
  const [ticket, setTicket] = useState<MatchTicket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let active = true;
    getDecks()
      .then((list) => {
        if (!active) return;
        setDecks(list);
        if (list.length > 0) setSelectedDeckId(list[0].id);
      })
      .catch(() => {
        if (active) setError("Failed to load decks.");
      });
    return () => {
      active = false;
    };
  }, []);

  const stopPolling = (): void => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // Poll match status once queued; stop on match.
  useEffect(() => {
    if (state !== "queued") return;
    const poll = async (): Promise<void> => {
      try {
        const status = await getMatchStatus();
        setTicket(status);
        if (status.status === "matched") {
          setState("matched");
          stopPolling();
        }
      } catch {
        setError("Lost connection while searching.");
      }
    };
    void poll();
    timerRef.current = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return stopPolling;
  }, [state]);

  useEffect(() => stopPolling, []);

  const onFindMatch = async (): Promise<void> => {
    if (!selectedDeckId) {
      setError("Pick a deck first.");
      return;
    }
    setError(null);
    setTicket(null);
    try {
      await queueMatch(selectedDeckId);
      setState("queued");
    } catch {
      setError("Could not join the queue.");
    }
  };

  const onCancel = async (): Promise<void> => {
    stopPolling();
    try {
      await cancelMatch();
    } catch {
      // Cancelling is best-effort from the UI's perspective.
    }
    setState("idle");
    setTicket(null);
  };

  if (state === "matched") {
    return (
      <main className="page">
        <MatchFound
          sessionId={ticket?.sessionId ?? "unknown"}
          deckId={ticket?.deckId ?? selectedDeckId}
          onBackToMenu={onCancel}
        />
      </main>
    );
  }

  return (
    <main className="page">
      <h2>Matchmaking</h2>

      {decks.length === 0 ? (
        <p className="muted">You need a deck first — head to Collection.</p>
      ) : (
        <label className="field">
          <span className="field__label">Deck</span>
          <select
            className="field__input"
            value={selectedDeckId}
            onChange={(e) => setSelectedDeckId(e.target.value)}
            disabled={state !== "idle"}
          >
            {decks.map((deck) => (
              <option key={deck.id} value={deck.id}>
                {deck.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="queue__controls">
        {state === "idle" && (
          <button
            type="button"
            className="btn btn--primary"
            onClick={onFindMatch}
            disabled={decks.length === 0}
          >
            Find Match
          </button>
        )}
        {state !== "idle" && (
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>

      <div className="queue__status" role="status">
        {state === "queued" && <p className="pulse">Searching…</p>}
      </div>

      {error && (
        <p className="alert alert--error" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}

import { useEffect, useState } from "react";
import { getMatchSession } from "../api/client";
import type { GameSession } from "../types";

interface MatchFoundProps {
  /** Allocated realtime session id the client connects to. */
  sessionId: string;
  /** Deck the player is taking into the battle. */
  deckId: string;
  /** Returns to the queue/collection and resets local queue state. */
  onBackToMenu: () => void;
}

type ConnectState = "ready" | "connecting";

/**
 * "Match Found" view shown once matchmaking resolves. It loads the concrete
 * allocated session (GET /matches/session/:id) so it can show the real room to
 * connect to, the opponents, and which realtime provider the room lives on.
 *
 * "Enter Battle" surfaces a connecting state against that real room name. The
 * realtime battle client itself (Photon / dedicated server) is a separate
 * integration, so this stops at "connecting" rather than pretending a socket is
 * open — but everything it shows is now real allocated data, not a placeholder.
 */
export function MatchFound({ sessionId, deckId, onBackToMenu }: MatchFoundProps) {
  const [connect, setConnect] = useState<ConnectState>("ready");
  const [session, setSession] = useState<GameSession | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId || sessionId === "unknown") return;
    let active = true;
    getMatchSession(sessionId)
      .then((s) => {
        if (active) setSession(s);
      })
      .catch(() => {
        if (active) setLoadError("Could not load session details.");
      });
    return () => {
      active = false;
    };
  }, [sessionId]);

  const roomName = session?.connection.roomName ?? sessionId;
  const opponents = session?.participants.filter((p) => p.deckId !== deckId) ?? [];

  const onEnterBattle = (): void => {
    setConnect("connecting");
  };

  return (
    <section className="match-found" aria-labelledby="match-found-title">
      <p className="match-found__eyebrow">Matchmaking complete</p>
      <h2 id="match-found-title" className="match-found__title">
        MATCH FOUND
      </h2>

      <dl className="match-found__details">
        <div className="match-found__row">
          <dt className="match-found__key">Session</dt>
          <dd className="match-found__value">
            <code>{sessionId}</code>
          </dd>
        </div>
        <div className="match-found__row">
          <dt className="match-found__key">Deck</dt>
          <dd className="match-found__value">
            <code>{deckId || "unknown"}</code>
          </dd>
        </div>
        {session && (
          <>
            <div className="match-found__row">
              <dt className="match-found__key">Mode</dt>
              <dd className="match-found__value">
                {session.mode} · {session.region}
              </dd>
            </div>
            <div className="match-found__row">
              <dt className="match-found__key">Realtime</dt>
              <dd className="match-found__value">
                <code>{session.connection.provider}</code>
              </dd>
            </div>
            <div className="match-found__row">
              <dt className="match-found__key">Opponent</dt>
              <dd className="match-found__value">
                {opponents.length > 0 ? (
                  <code>{opponents.map((o) => o.playerId).join(", ")}</code>
                ) : (
                  <span className="muted">—</span>
                )}
              </dd>
            </div>
          </>
        )}
      </dl>

      {loadError && (
        <p className="match-found__hint muted" role="status">
          {loadError}
        </p>
      )}

      {connect === "connecting" ? (
        <p className="match-found__connecting pulse" role="status">
          Connecting to {roomName}…
        </p>
      ) : (
        <p className="match-found__hint muted">
          Session allocated. Enter Battle connects to room <code>{roomName}</code>.
        </p>
      )}

      <div className="match-found__actions">
        <button
          type="button"
          className="btn btn--primary btn--lg"
          onClick={onEnterBattle}
          disabled={connect === "connecting"}
        >
          {connect === "connecting" ? "Connecting…" : "Enter Battle"}
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={onBackToMenu}
          disabled={connect === "connecting"}
        >
          Back to Menu
        </button>
      </div>
    </section>
  );
}

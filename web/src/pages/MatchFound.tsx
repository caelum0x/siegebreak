import { useState } from "react";

interface MatchFoundProps {
  /** Photon realtime session the client would connect to. */
  sessionId: string;
  /** Deck the player is taking into the battle. */
  deckId: string;
  /** Returns to the queue/collection and resets local queue state. */
  onBackToMenu: () => void;
}

type ConnectState = "ready" | "connecting";

/**
 * Presentational "Match Found" view shown once matchmaking resolves.
 *
 * "Enter Battle" is a deliberate stub: there is no realtime (Photon) client
 * wired up yet, so it only surfaces a "connecting" state to make the intended
 * next step obvious without pretending a connection exists.
 */
export function MatchFound({ sessionId, deckId, onBackToMenu }: MatchFoundProps) {
  const [connect, setConnect] = useState<ConnectState>("ready");

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
      </dl>

      {connect === "connecting" ? (
        <p className="match-found__connecting pulse" role="status">
          Connecting to {sessionId}…
        </p>
      ) : (
        <p className="match-found__hint muted">
          Realtime battle client is not wired up yet — Enter Battle is a stub.
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

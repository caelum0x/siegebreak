import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Deck, GameSession, MatchTicket } from "../types";

const getDecks = vi.fn();
const queueMatch = vi.fn();
const getMatchStatus = vi.fn();
const cancelMatch = vi.fn();
const getMatchSession = vi.fn();

vi.mock("../api/client", () => ({
  getDecks: () => getDecks(),
  queueMatch: (deckId: string) => queueMatch(deckId),
  getMatchStatus: () => getMatchStatus(),
  cancelMatch: () => cancelMatch(),
  getMatchSession: (id: string) => getMatchSession(id),
}));

import { Queue } from "./Queue";

const DECK: Deck = {
  id: "deck_alpha",
  playerId: "p1",
  name: "Alpha",
  slots: [],
};

const MATCHED: MatchTicket = {
  status: "matched",
  sessionId: "photon-session-42",
  deckId: "deck_alpha",
};

const SESSION: GameSession = {
  id: "photon-session-42",
  mode: "1v1",
  region: "eu",
  status: "allocated",
  createdAt: 1_700_000_000_000,
  participants: [
    { playerId: "p1", deckId: "deck_alpha" },
    { playerId: "p2", deckId: "deck_bravo" },
  ],
  connection: { provider: "local", roomName: "photon-session-42" },
};

describe("Queue -> MatchFound flow", () => {
  beforeEach(() => {
    getDecks.mockResolvedValue([DECK]);
    queueMatch.mockResolvedValue({ status: "queued" });
    getMatchStatus.mockResolvedValue(MATCHED);
    cancelMatch.mockResolvedValue({ status: "ok" });
    getMatchSession.mockResolvedValue(SESSION);
  });

  it("shows MatchFound with the sessionId once matched", async () => {
    const user = userEvent.setup();
    render(<Queue />);

    await user.click(await screen.findByRole("button", { name: /find match/i }));

    // Polling resolves to "matched": headline + session id are rendered (the
    // id shows both in the detail row and in the "connects to room …" hint).
    expect(await screen.findByText(/match found/i)).toBeInTheDocument();
    expect(screen.getAllByText("photon-session-42").length).toBeGreaterThan(0);
  });

  it("loads and shows the allocated session's provider and opponent", async () => {
    const user = userEvent.setup();
    render(<Queue />);

    await user.click(await screen.findByRole("button", { name: /find match/i }));
    await screen.findByText(/match found/i);

    // Fetched from GET /matches/session/:id and rendered.
    expect(await screen.findByText("local")).toBeInTheDocument();
    expect(screen.getByText("p2")).toBeInTheDocument();
    expect(getMatchSession).toHaveBeenCalledWith("photon-session-42");
  });

  it("Enter Battle is a stub that surfaces a connecting state", async () => {
    const user = userEvent.setup();
    render(<Queue />);

    await user.click(await screen.findByRole("button", { name: /find match/i }));
    await screen.findByText(/match found/i);

    await user.click(screen.getByRole("button", { name: /enter battle/i }));

    expect(
      await screen.findByText(/connecting to photon-session-42/i)
    ).toBeInTheDocument();
  });

  it("Back to Menu resets queue state and returns to matchmaking", async () => {
    const user = userEvent.setup();
    render(<Queue />);

    await user.click(await screen.findByRole("button", { name: /find match/i }));
    await screen.findByText(/match found/i);

    await user.click(screen.getByRole("button", { name: /back to menu/i }));

    // Returns to the idle matchmaking view: Find Match is available again and
    // the match-found headline is gone.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /find match/i })).toBeInTheDocument()
    );
    expect(screen.queryByText(/match found/i)).not.toBeInTheDocument();
    expect(cancelMatch).toHaveBeenCalled();
  });
});

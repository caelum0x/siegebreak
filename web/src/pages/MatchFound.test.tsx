import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Deck, MatchTicket } from "../types";

const getDecks = vi.fn();
const queueMatch = vi.fn();
const getMatchStatus = vi.fn();
const cancelMatch = vi.fn();

vi.mock("../api/client", () => ({
  getDecks: () => getDecks(),
  queueMatch: (deckId: string) => queueMatch(deckId),
  getMatchStatus: () => getMatchStatus(),
  cancelMatch: () => cancelMatch(),
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

describe("Queue -> MatchFound flow", () => {
  beforeEach(() => {
    getDecks.mockResolvedValue([DECK]);
    queueMatch.mockResolvedValue({ status: "queued" });
    getMatchStatus.mockResolvedValue(MATCHED);
    cancelMatch.mockResolvedValue({ status: "ok" });
  });

  it("shows MatchFound with the sessionId once matched", async () => {
    const user = userEvent.setup();
    render(<Queue />);

    await user.click(await screen.findByRole("button", { name: /find match/i }));

    // Polling resolves to "matched": headline + session id are rendered.
    expect(await screen.findByText(/match found/i)).toBeInTheDocument();
    expect(screen.getByText("photon-session-42")).toBeInTheDocument();
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

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { MatchHistoryEntry, Me } from "../types";

const getMe = vi.fn();
const getMyMatches = vi.fn();

vi.mock("../api/client", () => ({
  getMe: () => getMe(),
  getMyMatches: (limit?: number) => getMyMatches(limit),
}));

import { History } from "./History";

const ME: Me = {
  id: "me",
  displayName: "Ada",
  level: 3,
  xp: 2400,
  rating: 1120,
  wallet: { gold: 42, gems: 7 },
};

const WIN: MatchHistoryEntry = {
  matchId: "m1",
  mode: "1v1",
  region: "eu",
  endedAt: "2026-07-27T10:00:00.000Z",
  result: "win",
  trophiesDelta: 30,
  deckId: "d1",
  opponents: [{ playerId: "opp", displayName: "Bob", result: "loss" }],
};

describe("History page", () => {
  beforeEach(() => {
    getMe.mockReset();
    getMyMatches.mockReset();
  });

  it("renders progression and a match row once loaded", async () => {
    getMe.mockResolvedValue(ME);
    getMyMatches.mockResolvedValue([WIN]);

    render(<History />);

    // Progression header.
    expect(await screen.findByText("Ada")).toBeInTheDocument();
    expect(screen.getByText(/Rating 1120/)).toBeInTheDocument();

    // Match row: result, opponent, and a signed trophy delta.
    expect(screen.getByText("Win")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("+30")).toBeInTheDocument();

    // Requests a bounded page.
    expect(getMyMatches).toHaveBeenCalledWith(20);
  });

  it("shows an empty-state message when there are no matches", async () => {
    getMe.mockResolvedValue(ME);
    getMyMatches.mockResolvedValue([]);

    render(<History />);

    expect(await screen.findByText(/no matches played yet/i)).toBeInTheDocument();
  });

  it("shows an error message when loading fails", async () => {
    getMe.mockRejectedValue(new Error("boom"));
    getMyMatches.mockResolvedValue([]);

    render(<History />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/failed to load/i);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Card, Deck } from "../types";

const getCards = vi.fn();
const getDecks = vi.fn();
const createDeck = vi.fn();

vi.mock("../api/client", () => ({
  getCards: () => getCards(),
  getDecks: () => getDecks(),
  createDeck: (input: unknown) => createDeck(input),
  apiErrorCode: () => undefined,
}));

import { Collection } from "./Collection";

const HERO: Card = {
  id: "hero_vanguard",
  name: "Vanguard",
  type: "hero",
  elixirCost: 5,
  baseStats: {},
};

const TROOP: Card = {
  id: "troop_swarm",
  name: "Swarm",
  type: "troop",
  elixirCost: 2,
  baseStats: {},
};

describe("Collection deck builder", () => {
  beforeEach(() => {
    getCards.mockResolvedValue([HERO, TROOP]);
    getDecks.mockResolvedValue([] as Deck[]);
    createDeck.mockReset();
  });

  it("blocks a non-hero card in slot 0 and does not attempt to save", async () => {
    const user = userEvent.setup();
    render(<Collection />);

    // Wait for cards to load.
    await screen.findByRole("button", { name: /add swarm/i });

    // Slot 0 (Hero) is selected by default. Adding a troop must be rejected.
    await user.click(screen.getByRole("button", { name: /add swarm/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/hero/i);

    // Slot 0 should remain empty (still shows "empty").
    const heroSlot = screen.getByRole("button", { name: /select hero slot/i });
    expect(heroSlot).toHaveTextContent(/empty/i);

    // Save must stay disabled and createDeck never called.
    expect(screen.getByRole("button", { name: /save deck/i })).toBeDisabled();
    expect(createDeck).not.toHaveBeenCalled();
  });

  it("accepts a hero in slot 0", async () => {
    const user = userEvent.setup();
    render(<Collection />);

    await user.click(await screen.findByRole("button", { name: /add vanguard/i }));

    const heroSlot = screen.getByRole("button", { name: /select hero slot/i });
    await waitFor(() => expect(heroSlot).toHaveTextContent(/vanguard/i));
  });
});

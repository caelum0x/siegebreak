import { describe, expect, it } from "vitest";
import type { Card } from "../types";
import {
  clearSlot,
  emptyDeck,
  isComplete,
  nextEmptyIndex,
  placeInSlot,
  SLOT_COUNT,
  validatePlacement,
} from "./deckSlots";

const hero: Card = { id: "h", name: "Hero", type: "hero", elixirCost: 5, baseStats: {} };
const troop: Card = { id: "t", name: "Troop", type: "troop", elixirCost: 3, baseStats: {} };

describe("deckSlots", () => {
  it("creates an empty deck of the right size", () => {
    expect(emptyDeck()).toHaveLength(SLOT_COUNT);
    expect(nextEmptyIndex(emptyDeck())).toBe(0);
  });

  it("places and clears immutably", () => {
    const base = emptyDeck();
    const placed = placeInSlot(base, 2, "card-x");
    expect(base[2]).toBeNull(); // original untouched
    expect(placed[2]).toBe("card-x");
    expect(clearSlot(placed, 2)[2]).toBeNull();
  });

  it("reports completion only when every slot is filled", () => {
    let slots = emptyDeck();
    for (let i = 0; i < SLOT_COUNT; i++) slots = placeInSlot(slots, i, `c${i}`);
    expect(isComplete(slots)).toBe(true);
    expect(isComplete(clearSlot(slots, 4))).toBe(false);
  });

  it("only allows heroes in slot 0", () => {
    expect(validatePlacement(0, hero).ok).toBe(true);
    expect(validatePlacement(0, troop).ok).toBe(false);
    expect(validatePlacement(3, troop).ok).toBe(true);
  });
});

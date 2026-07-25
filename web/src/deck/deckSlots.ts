import type { Card } from "../types";

export const SLOT_COUNT = 8;
export const HERO_SLOT = 0;

export type DeckSlots = ReadonlyArray<string | null>;

export function emptyDeck(): DeckSlots {
  return Array.from({ length: SLOT_COUNT }, () => null);
}

/** Immutable placement of a card id into a slot. */
export function placeInSlot(slots: DeckSlots, index: number, cardId: string): DeckSlots {
  return slots.map((slot, i) => (i === index ? cardId : slot));
}

/** Immutable removal from a slot. */
export function clearSlot(slots: DeckSlots, index: number): DeckSlots {
  return slots.map((slot, i) => (i === index ? null : slot));
}

export function nextEmptyIndex(slots: DeckSlots): number {
  return slots.findIndex((slot) => slot === null);
}

export function isComplete(slots: DeckSlots): slots is ReadonlyArray<string> {
  return slots.every((slot) => slot !== null);
}

export interface Validation {
  ok: boolean;
  message?: string;
}

/**
 * Client-side mirror of the backend's `slot_0_must_be_hero` rule.
 * Slot 0 only accepts hero cards; every other slot accepts any card.
 */
export function validatePlacement(index: number, card: Card): Validation {
  if (index === HERO_SLOT && card.type !== "hero") {
    return { ok: false, message: "Slot 0 is the Hero slot — only hero cards are allowed there." };
  }
  return { ok: true };
}

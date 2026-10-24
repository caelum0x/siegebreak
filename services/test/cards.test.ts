import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";

// Mock the Prisma singleton so deck validation can be exercised without a live
// database. Only the methods the cards routes touch are stubbed. vi.hoisted
// lets these fns exist before vi.mock's hoisted factory references them.
const { card, deck } = vi.hoisted(() => ({
  card: { findUnique: vi.fn(), findMany: vi.fn() },
  deck: { findMany: vi.fn(), create: vi.fn() },
}));
vi.mock("../src/lib/prisma", () => ({ prisma: { card, deck } }));

import { buildApp } from "../src/app";
import { signAccessToken } from "../src/lib/jwt";

let app: FastifyInstance;
const auth = { authorization: `Bearer ${signAccessToken("player-1")}` };
const validSlots = ["hero_vanguard", "c2", "c3", "c4", "c5", "c6", "c7", "c8"];

beforeAll(async () => {
  app = buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  card.findUnique.mockReset();
  card.findMany.mockReset();
  deck.create.mockReset();
});

describe("POST /players/me/decks", () => {
  it("rejects a deck whose slot 0 is not a hero card", async () => {
    card.findUnique.mockResolvedValue({ id: "hero_vanguard", type: "troop" });

    const res = await app.inject({
      method: "POST",
      url: "/players/me/decks",
      headers: auth,
      payload: { name: "My Deck", slots: validSlots },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("slot_0_must_be_hero");
    expect(deck.create).not.toHaveBeenCalled();
  });

  it("rejects a deck whose slot 0 card does not exist", async () => {
    card.findUnique.mockResolvedValue(null);

    const res = await app.inject({
      method: "POST",
      url: "/players/me/decks",
      headers: auth,
      payload: { name: "My Deck", slots: validSlots },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("slot_0_must_be_hero");
  });

  it("creates a deck when slot 0 is a hero, scoped to the authed player", async () => {
    card.findUnique.mockResolvedValue({ id: "hero_vanguard", type: "hero" });
    card.findMany.mockResolvedValue(validSlots.slice(1).map((id) => ({ id })));
    deck.create.mockResolvedValue({ id: "deck-1", playerId: "player-1", name: "My Deck", slots: validSlots });

    const res = await app.inject({
      method: "POST",
      url: "/players/me/decks",
      headers: auth,
      payload: { name: "My Deck", slots: validSlots },
    });

    expect(res.statusCode).toBe(200);
    expect(deck.create).toHaveBeenCalledWith({
      data: { playerId: "player-1", name: "My Deck", slots: validSlots },
    });
  });

  it("rejects a deck without exactly 8 slots (Zod length check → 400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/players/me/decks",
      headers: auth,
      payload: { name: "Short", slots: ["hero_vanguard", "c2"] },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("validation_failed");
    expect(card.findUnique).not.toHaveBeenCalled();
  });
});

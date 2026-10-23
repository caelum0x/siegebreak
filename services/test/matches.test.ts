import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";

const SECRET = "test-server-secret";
process.env.MATCH_SERVER_SECRET = SECRET;

// Mock Prisma (idempotency, player rating load, transactional writes) and Redis
// (leaderboard zincrby) so completion is exercised without live infrastructure.
const { match, player, wallet, deck, playerCard, $transaction, zincrby } = vi.hoisted(() => ({
  match: { findUnique: vi.fn(), create: vi.fn() },
  player: { findMany: vi.fn(), update: vi.fn() },
  wallet: { upsert: vi.fn() },
  // Card-shard progression (awardCardShards): deckId in the test body doesn't
  // resolve to a real Deck row, so the default null keeps that path a no-op,
  // matching production behavior for an unknown/ad-hoc deck id.
  deck: { findUnique: vi.fn() },
  playerCard: { upsert: vi.fn() },
  $transaction: vi.fn(),
  zincrby: vi.fn(),
}));
vi.mock("../src/lib/prisma", () => ({ prisma: { match, player, wallet, deck, playerCard, $transaction } }));
vi.mock("../src/lib/redis", () => ({ redis: { zincrby } }));

import { buildApp } from "../src/app";

let app: FastifyInstance;
const serverAuth = { authorization: `Bearer ${SECRET}` };

const body = {
  seasonId: "2026-s3",
  region: "eu",
  mode: "1v1",
  participants: [
    { playerId: "p1", deckId: "d1", result: "win", trophiesDelta: 30 },
    { playerId: "p2", deckId: "d2", result: "loss", trophiesDelta: -28 },
  ],
};

beforeAll(async () => {
  app = buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  match.findUnique.mockReset().mockResolvedValue(null);
  match.create.mockReset();
  player.findMany
    .mockReset()
    .mockResolvedValue([
      { id: "p1", rating: 1000, xp: 0 },
      { id: "p2", rating: 1000, xp: 0 },
    ]);
  player.update.mockReset();
  wallet.upsert.mockReset();
  deck.findUnique.mockReset().mockResolvedValue(null);
  playerCard.upsert.mockReset();
  $transaction.mockReset().mockResolvedValue([]);
  zincrby.mockReset().mockResolvedValue(1);
});

describe("POST /matches/:id/complete", () => {
  it("rejects a call with no server secret", async () => {
    const res = await app.inject({ method: "POST", url: "/matches/m1/complete", payload: body });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("invalid_server_secret");
    expect($transaction).not.toHaveBeenCalled();
  });

  it("rejects a call with the wrong server secret", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/matches/m1/complete",
      headers: { authorization: "Bearer nope" },
      payload: body,
    });
    expect(res.statusCode).toBe(401);
  });

  it("records the match, applies Elo + rewards, and updates the leaderboard", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/matches/m1/complete",
      headers: serverAuth,
      payload: body,
    });

    expect(res.statusCode).toBe(201);
    const json = res.json();
    expect(json.status).toBe("recorded");
    expect(json.matchId).toBe("m1");
    // Equal 1000s: winner -> 1016, loser -> 984.
    expect(json.ratings).toEqual([
      { playerId: "p1", rating: 1016 },
      { playerId: "p2", rating: 984 },
    ]);

    // Match persisted with its server-assigned id and nested participants.
    const createArg = match.create.mock.calls[0][0];
    expect(createArg.data.id).toBe("m1");
    expect(createArg.data.participants.create).toHaveLength(2);
    // Everything went through a single transaction.
    expect($transaction).toHaveBeenCalledTimes(1);

    // Winner progression: rating up, +30 xp (level 1), +10 gold.
    expect(player.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { rating: 1016, xp: 30, level: 1 },
    });
    expect(wallet.upsert).toHaveBeenCalledWith({
      where: { playerId: "p1" },
      create: { playerId: "p1", gold: 10 },
      update: { gold: { increment: 10 } },
    });

    // Leaderboard updated with each player's trophy delta on the season key.
    expect(zincrby).toHaveBeenCalledWith("leaderboard:2026-s3", 30, "p1");
    expect(zincrby).toHaveBeenCalledWith("leaderboard:2026-s3", -28, "p2");
  });

  it("is idempotent: a duplicate completion returns 409 and does not re-award", async () => {
    match.findUnique.mockResolvedValue({ id: "m1", endedAt: new Date() });

    const res = await app.inject({
      method: "POST",
      url: "/matches/m1/complete",
      headers: serverAuth,
      payload: body,
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("already_recorded");
    expect($transaction).not.toHaveBeenCalled();
    expect(zincrby).not.toHaveBeenCalled();
  });

  it("returns 422 when a participant is not a known player", async () => {
    player.findMany.mockResolvedValue([{ id: "p1", rating: 1000, xp: 0 }]); // p2 missing

    const res = await app.inject({
      method: "POST",
      url: "/matches/m1/complete",
      headers: serverAuth,
      payload: body,
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe("unknown_player");
    expect($transaction).not.toHaveBeenCalled();
  });

  it("rejects a match with fewer than two participants (Zod → 400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/matches/m1/complete",
      headers: serverAuth,
      payload: { ...body, participants: [body.participants[0]] },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("validation_failed");
    expect(match.findUnique).not.toHaveBeenCalled();
  });
});

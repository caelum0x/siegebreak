import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";

const SECRET = "test-server-secret";
process.env.MATCH_SERVER_SECRET = SECRET;

// Mock Prisma (match idempotency + create) and Redis (leaderboard zincrby) so
// completion is exercised end-to-end without live infrastructure.
const { match, zincrby } = vi.hoisted(() => ({
  match: { findUnique: vi.fn(), create: vi.fn() },
  zincrby: vi.fn(),
}));
vi.mock("../src/lib/prisma", () => ({ prisma: { match } }));
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
  match.findUnique.mockReset();
  match.create.mockReset();
  zincrby.mockReset();
  zincrby.mockResolvedValue(1);
});

describe("POST /matches/:id/complete", () => {
  it("rejects a call with no server secret", async () => {
    const res = await app.inject({ method: "POST", url: "/matches/m1/complete", payload: body });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("invalid_server_secret");
    expect(match.create).not.toHaveBeenCalled();
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

  it("records the match and updates the leaderboard per participant", async () => {
    match.findUnique.mockResolvedValue(null);
    match.create.mockResolvedValue({ id: "m1" });

    const res = await app.inject({
      method: "POST",
      url: "/matches/m1/complete",
      headers: serverAuth,
      payload: body,
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ status: "recorded", matchId: "m1" });

    // Match persisted with its server-assigned id and nested participants.
    expect(match.create).toHaveBeenCalledTimes(1);
    const createArg = match.create.mock.calls[0][0];
    expect(createArg.data.id).toBe("m1");
    expect(createArg.data.participants.create).toHaveLength(2);

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
    expect(match.create).not.toHaveBeenCalled();
    expect(zincrby).not.toHaveBeenCalled();
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

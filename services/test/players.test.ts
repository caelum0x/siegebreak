import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";

// Mock the Prisma singleton so the player-centric read routes can be exercised
// without a live database. Only the methods the players routes touch are
// stubbed; vi.hoisted makes them exist before vi.mock's factory references them.
const { player, wallet, matchParticipant } = vi.hoisted(() => ({
  player: { findUnique: vi.fn() },
  wallet: { findUnique: vi.fn() },
  matchParticipant: { findMany: vi.fn() },
}));
vi.mock("../src/lib/prisma", () => ({
  prisma: { player, wallet, matchParticipant },
}));

import { buildApp } from "../src/app";
import { signAccessToken } from "../src/lib/jwt";

let app: FastifyInstance;
const auth = { authorization: `Bearer ${signAccessToken("me")}` };

beforeAll(async () => {
  app = buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  player.findUnique.mockReset();
  wallet.findUnique.mockReset();
  matchParticipant.findMany.mockReset();
});

describe("GET /players/me", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await app.inject({ method: "GET", url: "/players/me" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("missing_token");
  });

  it("returns 404 when the player row is gone", async () => {
    player.findUnique.mockResolvedValue(null);
    const res = await app.inject({ method: "GET", url: "/players/me", headers: auth });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("not_found");
  });

  it("returns progression joined with the wallet", async () => {
    player.findUnique.mockResolvedValue({
      id: "me",
      displayName: "Ada",
      level: 3,
      xp: 2400,
      rating: 1120,
    });
    wallet.findUnique.mockResolvedValue({ playerId: "me", gold: 42, gems: 7 });

    const res = await app.inject({ method: "GET", url: "/players/me", headers: auth });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      id: "me",
      displayName: "Ada",
      level: 3,
      xp: 2400,
      rating: 1120,
      wallet: { gold: 42, gems: 7 },
    });
    // Scoped to the authed player, never a client-supplied id.
    expect(player.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "me" } })
    );
  });

  it("defaults the wallet to zeros when the player has none yet", async () => {
    player.findUnique.mockResolvedValue({
      id: "me",
      displayName: "Ada",
      level: 1,
      xp: 0,
      rating: 1000,
    });
    wallet.findUnique.mockResolvedValue(null);

    const res = await app.inject({ method: "GET", url: "/players/me", headers: auth });

    expect(res.statusCode).toBe(200);
    expect(res.json().wallet).toEqual({ gold: 0, gems: 0 });
  });
});

describe("GET /players/me/matches", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await app.inject({ method: "GET", url: "/players/me/matches" });
    expect(res.statusCode).toBe(401);
  });

  it("maps each participant row to a flat history entry with opponents", async () => {
    matchParticipant.findMany.mockResolvedValue([
      {
        deckId: "d1",
        result: "win",
        trophiesDelta: 30,
        match: {
          id: "m1",
          mode: "1v1",
          region: "eu",
          endedAt: new Date("2026-07-27T10:00:00.000Z"),
          participants: [
            { playerId: "opp", result: "loss", player: { displayName: "Bob" } },
          ],
        },
      },
    ]);

    const res = await app.inject({
      method: "GET",
      url: "/players/me/matches",
      headers: auth,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      {
        matchId: "m1",
        mode: "1v1",
        region: "eu",
        endedAt: "2026-07-27T10:00:00.000Z",
        result: "win",
        trophiesDelta: 30,
        deckId: "d1",
        opponents: [{ playerId: "opp", displayName: "Bob", result: "loss" }],
      },
    ]);

    // Only the authed player's rows, opponents exclude self, newest first.
    const arg = matchParticipant.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ playerId: "me" });
    expect(arg.orderBy).toEqual({ match: { endedAt: "desc" } });
    expect(arg.select.match.select.participants.where).toEqual({
      playerId: { not: "me" },
    });
  });

  it("defaults to a bounded page size and clamps an oversized limit", async () => {
    matchParticipant.findMany.mockResolvedValue([]);

    await app.inject({ method: "GET", url: "/players/me/matches", headers: auth });
    expect(matchParticipant.findMany.mock.calls[0][0].take).toBe(20);

    matchParticipant.findMany.mockClear();
    await app.inject({
      method: "GET",
      url: "/players/me/matches?limit=999",
      headers: auth,
    });
    expect(matchParticipant.findMany.mock.calls[0][0].take).toBe(50);
  });

  it("rejects a non-numeric limit with 400", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/players/me/matches?limit=abc",
      headers: auth,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("validation_failed");
    expect(matchParticipant.findMany).not.toHaveBeenCalled();
  });
});

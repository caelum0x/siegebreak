import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { redis } from "../src/lib/redis";
import { runMatchTick } from "../src/modules/matchmaking/matcher";

// Full-stack flows against a REAL database and Redis — the paths the unit tests
// necessarily mock (Prisma queries, transactions, Redis sorted sets/hashes).

let app: FastifyInstance;

const validSlots = [
  "hero_vanguard",
  "troop_swarm",
  "troop_archer",
  "troop_skirmisher",
  "building_turret",
  "spell_firebomb",
  "spell_rally_heal",
  "troop_shieldbearer",
];

async function guestLogin(deviceId: string): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await app.inject({ method: "POST", url: "/auth/guest", payload: { deviceId } });
  expect(res.statusCode).toBe(200);
  return res.json();
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

beforeAll(async () => {
  app = buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
  await redis.quit();
});

beforeEach(async () => {
  // Reset mutable state between tests; Card stays seeded (10 rows).
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Player","Deck","Match","MatchParticipant","Wallet","Purchase","PlayerCard" RESTART IDENTITY CASCADE'
  );
  await redis.flushdb();
});

describe("player onboarding", () => {
  it("creates a guest, exposes the seeded catalog, wallet, and a saved deck", async () => {
    const { accessToken } = await guestLogin("device-onboard-1");

    const cards = await app.inject({ method: "GET", url: "/cards" });
    expect(cards.json()).toHaveLength(10);

    const wallet = await app.inject({ method: "GET", url: "/economy/wallet", headers: bearer(accessToken) });
    expect(wallet.json()).toMatchObject({ gold: 0, gems: 0 });

    const created = await app.inject({
      method: "POST",
      url: "/players/me/decks",
      headers: bearer(accessToken),
      payload: { name: "Starter", slots: validSlots },
    });
    expect(created.statusCode).toBe(200);
    expect(created.json().slots[0]).toBe("hero_vanguard");

    const decks = await app.inject({ method: "GET", url: "/players/me/decks", headers: bearer(accessToken) });
    expect(decks.json()).toHaveLength(1);
  });

  it("rejects a deck whose slot 0 is not a hero (real catalog lookup)", async () => {
    const { accessToken } = await guestLogin("device-onboard-2");
    const res = await app.inject({
      method: "POST",
      url: "/players/me/decks",
      headers: bearer(accessToken),
      payload: { name: "Bad", slots: ["troop_swarm", ...validSlots.slice(1)] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("slot_0_must_be_hero");
  });

  it("returns the same guest row for a repeated deviceId (device-bound)", async () => {
    await guestLogin("device-repeat-1");
    await guestLogin("device-repeat-1");
    const count = await prisma.player.count({ where: { authProviderId: "device-repeat-1" } });
    expect(count).toBe(1);
  });
});

describe("refresh rotation", () => {
  it("invalidates an old refresh token after it is used once", async () => {
    const { refreshToken } = await guestLogin("device-refresh-1");

    const first = await app.inject({ method: "POST", url: "/auth/refresh", payload: { refreshToken } });
    expect(first.statusCode).toBe(200);

    // Reusing the now-rotated token must fail (tokenVersion bumped server-side).
    const replay = await app.inject({ method: "POST", url: "/auth/refresh", payload: { refreshToken } });
    expect(replay.statusCode).toBe(401);
    expect(replay.json().error).toBe("invalid_refresh_token");
  });
});

describe("matchmaking end-to-end (real Redis + matcher tick)", () => {
  it("pairs two equal-MMR players and preserves each ticket's deckId", async () => {
    const a = await guestLogin("device-mm-a1");
    const b = await guestLogin("device-mm-b1");

    await app.inject({ method: "POST", url: "/matchmaking/queue", headers: bearer(a.accessToken), payload: { deckId: "deck-a" } });
    await app.inject({ method: "POST", url: "/matchmaking/queue", headers: bearer(b.accessToken), payload: { deckId: "deck-b" } });

    await runMatchTick();

    const statusA = (await app.inject({ method: "GET", url: "/matchmaking/status", headers: bearer(a.accessToken) })).json();
    const statusB = (await app.inject({ method: "GET", url: "/matchmaking/status", headers: bearer(b.accessToken) })).json();

    expect(statusA.status).toBe("matched");
    expect(statusB.status).toBe("matched");
    expect(statusA.sessionId).toBe(statusB.sessionId);
    // The deckId must survive the match transition (regression: it was dropped).
    expect(statusA.deckId).toBe("deck-a");
    expect(statusB.deckId).toBe("deck-b");
  });

  it("queues a player at their persisted rating, not a flat default", async () => {
    const a = await guestLogin("device-rating-1");
    const player = await prisma.player.findFirstOrThrow({ where: { authProviderId: "device-rating-1" } });
    await prisma.player.update({ where: { id: player.id }, data: { rating: 1337 } });

    await app.inject({ method: "POST", url: "/matchmaking/queue", headers: bearer(a.accessToken), payload: { deckId: "d" } });

    // The queue is an MMR-scored sorted set; the score must be the real rating.
    const score = await redis.zscore("mm:queue", player.id);
    expect(Number(score)).toBe(1337);
  });

  it("two concurrent ticks (simulating two API instances) pair a queued pair exactly once", async () => {
    // Regression guard for the race the single-leader lock (lib/lock.ts)
    // exists to close: without it, two instances racing the same 1s tick
    // could both read the queue before either removed the matched players,
    // allocating two separate sessions for the same pair and leaving their
    // tickets pointing at different sessionIds.
    const a = await guestLogin("device-mm-race-a");
    const b = await guestLogin("device-mm-race-b");

    await app.inject({ method: "POST", url: "/matchmaking/queue", headers: bearer(a.accessToken), payload: { deckId: "deck-a" } });
    await app.inject({ method: "POST", url: "/matchmaking/queue", headers: bearer(b.accessToken), payload: { deckId: "deck-b" } });

    await Promise.all([runMatchTick(), runMatchTick(), runMatchTick()]);

    const statusA = (await app.inject({ method: "GET", url: "/matchmaking/status", headers: bearer(a.accessToken) })).json();
    const statusB = (await app.inject({ method: "GET", url: "/matchmaking/status", headers: bearer(b.accessToken) })).json();

    expect(statusA.status).toBe("matched");
    expect(statusB.status).toBe("matched");
    // Both landed in the exact same session — not two separately-allocated ones.
    expect(statusA.sessionId).toBe(statusB.sessionId);

    // Exactly one session key exists in Redis for this pair (no duplicate
    // allocation from a second instance racing the same players).
    const sessionKeys = await redis.keys("session:*");
    expect(sessionKeys).toHaveLength(1);
  });

  it("cancel removes the ticket so a later tick does not match", async () => {
    const a = await guestLogin("device-mm-a2");
    await app.inject({ method: "POST", url: "/matchmaking/queue", headers: bearer(a.accessToken), payload: { deckId: "deck-a" } });
    await app.inject({ method: "POST", url: "/matchmaking/cancel", headers: bearer(a.accessToken) });

    await runMatchTick();
    const status = (await app.inject({ method: "GET", url: "/matchmaking/status", headers: bearer(a.accessToken) })).json();
    expect(status).toEqual({}); // ticket gone
  });
});

describe("match completion -> leaderboard (real DB + Redis)", () => {
  it("records participants and reflects trophy deltas on the ladder", async () => {
    // Real players are required — MatchParticipant FKs Player.id.
    const p1 = await prisma.player.create({
      data: { displayName: "P1", authProvider: "guest", authProviderId: "device-mc-1", wallet: { create: {} } },
    });
    const p2 = await prisma.player.create({
      data: { displayName: "P2", authProvider: "guest", authProviderId: "device-mc-2", wallet: { create: {} } },
    });

    const payload = {
      seasonId: "2026-int",
      region: "eu",
      mode: "1v1",
      participants: [
        { playerId: p1.id, deckId: "d1", result: "win", trophiesDelta: 30 },
        { playerId: p2.id, deckId: "d2", result: "loss", trophiesDelta: -28 },
      ],
    };
    const serverAuth = { authorization: "Bearer integration-server-secret" };

    const res = await app.inject({ method: "POST", url: "/matches/match-int-1/complete", headers: serverAuth, payload });
    expect(res.statusCode).toBe(201);

    // Participants persisted.
    const participants = await prisma.matchParticipant.findMany({ where: { matchId: "match-int-1" } });
    expect(participants).toHaveLength(2);

    // Progression applied: winner's rating rose above the 1000 default and the
    // loser's fell (Elo is symmetric), and both earned XP + gold per outcome.
    const winner = await prisma.player.findUnique({ where: { id: p1.id }, include: { wallet: true } });
    const loser = await prisma.player.findUnique({ where: { id: p2.id }, include: { wallet: true } });
    expect(winner!.rating).toBeGreaterThan(1000);
    expect(loser!.rating).toBeLessThan(1000);
    expect(winner!.rating - 1000).toBe(1000 - loser!.rating); // zero-sum
    expect(winner!.xp).toBe(30);
    expect(loser!.xp).toBe(10);
    expect(winner!.wallet!.gold).toBe(10);
    expect(loser!.wallet!.gold).toBe(2);

    // Leaderboard reflects deltas, highest first.
    const board = (await app.inject({ method: "GET", url: "/leaderboard/2026-int" })).json();
    expect(board[0]).toMatchObject({ playerId: p1.id, trophies: 30, rank: 1 });
    expect(board.find((e: { playerId: string }) => e.playerId === p2.id).trophies).toBe(-28);

    // Idempotent: a duplicate completion is refused and does not double-award.
    const dup = await app.inject({ method: "POST", url: "/matches/match-int-1/complete", headers: serverAuth, payload });
    expect(dup.statusCode).toBe(409);
    const board2 = (await app.inject({ method: "GET", url: "/leaderboard/2026-int" })).json();
    expect(board2[0].trophies).toBe(30); // unchanged
  });

  it("rejects completion without the server secret", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/matches/match-int-2/complete",
      payload: { seasonId: "s", region: "eu", mode: "1v1", participants: [] },
    });
    expect(res.statusCode).toBe(401);
  });
});

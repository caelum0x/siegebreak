import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";

// Force a small per-route auth limit BEFORE buildApp() reads it, so we can
// prove the limiter trips without needing thousands of requests. The global
// limit stays at the high vitest-env default, so /ready is unaffected.
process.env.AUTH_RATE_LIMIT_MAX = "3";

// Mock the backing stores the same way the other unit tests do: no live
// Postgres/Redis. $queryRaw / ping are what the /ready probe drives; player is
// what /auth/guest touches.
const { player, $queryRaw, ping } = vi.hoisted(() => ({
  player: { findUnique: vi.fn(), create: vi.fn() },
  $queryRaw: vi.fn(),
  ping: vi.fn(),
}));
vi.mock("../src/lib/prisma", () => ({ prisma: { player, $queryRaw } }));
vi.mock("../src/lib/redis", () => ({ redis: { ping } }));

import { buildApp } from "../src/app";

let app: FastifyInstance;

beforeAll(async () => {
  app = buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  player.findUnique.mockReset();
  player.create.mockReset();
  $queryRaw.mockReset();
  ping.mockReset();
});

describe("rate limiting on POST /auth/guest", () => {
  it("returns 429 { error: 'rate_limited' } once the strict per-route limit is exceeded", async () => {
    // Any request (even a fast 400) consumes the limiter, but return a valid
    // 200 for the allowed ones so we assert the boundary precisely.
    player.findUnique.mockResolvedValue({ id: "p1", tokenVersion: 0 });

    const send = () =>
      app.inject({
        method: "POST",
        url: "/auth/guest",
        payload: { deviceId: "device-12345" },
      });

    // AUTH_RATE_LIMIT_MAX = 3 → first three succeed, fourth is throttled.
    const first = await send();
    const second = await send();
    const third = await send();
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(third.statusCode).toBe(200);

    const fourth = await send();
    expect(fourth.statusCode).toBe(429);
    expect(fourth.json()).toEqual({ error: "rate_limited" });
  });
});

describe("GET /ready", () => {
  it("returns 200 { status: 'ready' } when both Postgres and Redis answer", async () => {
    $queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    ping.mockResolvedValue("PONG");

    const res = await app.inject({ method: "GET", url: "/ready" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ready" });
    expect($queryRaw).toHaveBeenCalled();
    expect(ping).toHaveBeenCalled();
  });

  it("returns 503 { status: 'not_ready', checks } when a dependency fails", async () => {
    $queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    ping.mockRejectedValue(new Error("redis down"));

    const res = await app.inject({ method: "GET", url: "/ready" });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      status: "not_ready",
      checks: { postgres: true, redis: false },
    });
  });
});

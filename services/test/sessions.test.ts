import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";

// Mock Redis so the session store's set/get can be exercised without live
// infrastructure. Only the two commands the store touches are stubbed.
const { set, get } = vi.hoisted(() => ({ set: vi.fn(), get: vi.fn() }));
vi.mock("../src/lib/redis", () => ({ redis: { set, get } }));

import { buildApp } from "../src/app";
import { signAccessToken } from "../src/lib/jwt";
import { createSession, getSession, isParticipant } from "../src/modules/sessions/sessionStore";

let app: FastifyInstance;
const auth = { authorization: `Bearer ${signAccessToken("p1")}` };

const sampleSession = {
  id: "sess-1",
  mode: "1v1",
  region: "eu",
  status: "allocated" as const,
  createdAt: 1_700_000_000_000,
  participants: [
    { playerId: "p1", deckId: "d1" },
    { playerId: "p2", deckId: "d2" },
  ],
  connection: { provider: "local", roomName: "sess-1" },
};

beforeAll(async () => {
  app = buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  set.mockReset().mockResolvedValue("OK");
  get.mockReset();
});

describe("sessionStore.createSession", () => {
  it("persists a session with a TTL and returns the full record", async () => {
    const session = await createSession({
      mode: "1v1",
      region: "eu",
      participants: [
        { playerId: "p1", deckId: "d1" },
        { playerId: "p2", deckId: "d2" },
      ],
    });

    expect(session.id).toBeTruthy();
    expect(session.status).toBe("allocated");
    expect(session.mode).toBe("1v1");
    expect(session.connection).toEqual({ provider: "local", roomName: session.id });
    expect(session.participants).toHaveLength(2);

    // Written under session:<id> as JSON with an EX expiry.
    const [redisKey, payload, exFlag, ttl] = set.mock.calls[0];
    expect(redisKey).toBe(`session:${session.id}`);
    expect(JSON.parse(payload as string).id).toBe(session.id);
    expect(exFlag).toBe("EX");
    expect(ttl).toBeGreaterThan(0);
  });
});

describe("sessionStore.getSession", () => {
  it("parses a stored session", async () => {
    get.mockResolvedValue(JSON.stringify(sampleSession));
    expect(await getSession("sess-1")).toEqual(sampleSession);
  });

  it("returns null for a missing session", async () => {
    get.mockResolvedValue(null);
    expect(await getSession("nope")).toBeNull();
  });

  it("returns null (not a throw) for a corrupt value", async () => {
    get.mockResolvedValue("{not json");
    expect(await getSession("sess-1")).toBeNull();
  });
});

describe("isParticipant", () => {
  it("is true only for players in the session", () => {
    expect(isParticipant(sampleSession, "p1")).toBe(true);
    expect(isParticipant(sampleSession, "stranger")).toBe(false);
  });
});

describe("GET /matches/session/:id", () => {
  it("requires authentication", async () => {
    const res = await app.inject({ method: "GET", url: "/matches/session/sess-1" });
    expect(res.statusCode).toBe(401);
  });

  it("returns the session to a participant", async () => {
    get.mockResolvedValue(JSON.stringify(sampleSession));
    const res = await app.inject({
      method: "GET",
      url: "/matches/session/sess-1",
      headers: auth,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(sampleSession);
  });

  it("hides the session from a non-participant with a 404", async () => {
    const notMine = { ...sampleSession, participants: [{ playerId: "p2", deckId: "d2" }] };
    get.mockResolvedValue(JSON.stringify(notMine));

    const res = await app.inject({
      method: "GET",
      url: "/matches/session/sess-1",
      headers: auth,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("session_not_found");
  });

  it("returns 404 for an unknown/expired session", async () => {
    get.mockResolvedValue(null);
    const res = await app.inject({
      method: "GET",
      url: "/matches/session/gone",
      headers: auth,
    });
    expect(res.statusCode).toBe(404);
  });
});

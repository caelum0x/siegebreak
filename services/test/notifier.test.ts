import { describe, it, expect, beforeEach, vi } from "vitest";

// Redis is mocked so publish() can be asserted without a live server; the
// registry/dispatch logic under test is pure in-memory.
const { publish, duplicate } = vi.hoisted(() => ({
  publish: vi.fn(),
  duplicate: vi.fn(),
}));
vi.mock("../src/lib/redis", () => ({ redis: { publish, duplicate } }));

import {
  registerSocket,
  dispatchLocal,
  matchFoundMessage,
  publishMatchFound,
  _clearSocketsForTest,
} from "../src/modules/matchmaking/notifier";

beforeEach(() => {
  publish.mockReset().mockResolvedValue(1);
  _clearSocketsForTest();
});

describe("matchFoundMessage", () => {
  it("serialises the matched wire message", () => {
    expect(JSON.parse(matchFoundMessage("sess-1"))).toEqual({
      type: "matched",
      sessionId: "sess-1",
    });
  });
});

describe("registerSocket / dispatchLocal", () => {
  it("delivers a match event to a registered socket", () => {
    const received: string[] = [];
    registerSocket("p1", (d) => received.push(d));

    const count = dispatchLocal({ playerId: "p1", sessionId: "sess-1" });

    expect(count).toBe(1);
    expect(received).toEqual([matchFoundMessage("sess-1")]);
  });

  it("delivers to every socket a player holds (multiple tabs)", () => {
    const a: string[] = [];
    const b: string[] = [];
    registerSocket("p1", (d) => a.push(d));
    registerSocket("p1", (d) => b.push(d));

    expect(dispatchLocal({ playerId: "p1", sessionId: "s" })).toBe(2);
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it("returns 0 and delivers nothing for a player with no local socket", () => {
    const received: string[] = [];
    registerSocket("p1", (d) => received.push(d));

    expect(dispatchLocal({ playerId: "other", sessionId: "s" })).toBe(0);
    expect(received).toEqual([]);
  });

  it("stops delivering after unregister and cleans up the entry", () => {
    const received: string[] = [];
    const unregister = registerSocket("p1", (d) => received.push(d));

    unregister();

    expect(dispatchLocal({ playerId: "p1", sessionId: "s" })).toBe(0);
    expect(received).toEqual([]);
  });

  it("keeps other sockets when one of a player's sockets unregisters", () => {
    const a: string[] = [];
    const b: string[] = [];
    const off = registerSocket("p1", (d) => a.push(d));
    registerSocket("p1", (d) => b.push(d));

    off();

    expect(dispatchLocal({ playerId: "p1", sessionId: "s" })).toBe(1);
    expect(a).toEqual([]);
    expect(b).toHaveLength(1);
  });
});

describe("publishMatchFound", () => {
  it("publishes the event JSON on the notify channel", async () => {
    await publishMatchFound({ playerId: "p1", sessionId: "sess-1" });
    expect(publish).toHaveBeenCalledWith(
      "mm:notify",
      JSON.stringify({ playerId: "p1", sessionId: "sess-1" })
    );
  });
});

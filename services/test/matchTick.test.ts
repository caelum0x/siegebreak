import { describe, it, expect, beforeEach, vi } from "vitest";

// The matcher tick touches Redis (queue read, ticket read/write) and the
// session store (allocation). Mock both so the pairing → allocate → mark flow
// is exercised without live infrastructure.
const { zrange, hget, zrem, hset } = vi.hoisted(() => ({
  zrange: vi.fn(),
  hget: vi.fn(),
  zrem: vi.fn(),
  hset: vi.fn(),
}));
vi.mock("../src/lib/redis", () => ({ redis: { zrange, hget, zrem, hset } }));

const { createSession } = vi.hoisted(() => ({ createSession: vi.fn() }));
vi.mock("../src/modules/sessions/sessionStore", () => ({ createSession }));

const { publishMatchFound } = vi.hoisted(() => ({ publishMatchFound: vi.fn() }));
vi.mock("../src/modules/matchmaking/notifier", () => ({ publishMatchFound }));

import { runMatchTick } from "../src/modules/matchmaking/matcher";

beforeEach(() => {
  zrange.mockReset();
  hget.mockReset();
  zrem.mockReset().mockResolvedValue(1);
  hset.mockReset().mockResolvedValue("OK");
  createSession.mockReset();
  publishMatchFound.mockReset().mockResolvedValue(undefined);
});

describe("runMatchTick", () => {
  it("pairs in-window players, allocates a session with their decks, and marks them matched", async () => {
    // Queue (WITHSCORES): p1@1000, p2@1100 — gap 100 ≤ 150 window.
    zrange.mockResolvedValue(["p1", "1000", "p2", "1100"]);
    // Each ticket carries the deck the player queued with.
    hget.mockImplementation((key: string) =>
      Promise.resolve(key === "mm:ticket:p1" ? "deck-1" : "deck-2")
    );
    createSession.mockResolvedValue({ id: "sess-9" });

    await runMatchTick();

    // One session allocated for the pair, carrying mode + both decks.
    expect(createSession).toHaveBeenCalledTimes(1);
    const arg = createSession.mock.calls[0][0];
    expect(arg.mode).toBe("1v1");
    expect(arg.participants).toEqual([
      { playerId: "p1", deckId: "deck-1" },
      { playerId: "p2", deckId: "deck-2" },
    ]);

    // Both players removed from the pool and their tickets stamped with the id.
    expect(zrem).toHaveBeenCalledWith("mm:queue", "p1");
    expect(zrem).toHaveBeenCalledWith("mm:queue", "p2");
    expect(hset).toHaveBeenCalledWith("mm:ticket:p1", {
      status: "matched",
      sessionId: "sess-9",
    });
    expect(hset).toHaveBeenCalledWith("mm:ticket:p2", {
      status: "matched",
      sessionId: "sess-9",
    });

    // Both players notified in real time with the allocated session id.
    expect(publishMatchFound).toHaveBeenCalledWith({ playerId: "p1", sessionId: "sess-9" });
    expect(publishMatchFound).toHaveBeenCalledWith({ playerId: "p2", sessionId: "sess-9" });
  });

  it("allocates nothing when no pair falls within the MMR window", async () => {
    zrange.mockResolvedValue(["p1", "1000", "p2", "1300"]); // gap 300 > 150
    await runMatchTick();
    expect(createSession).not.toHaveBeenCalled();
    expect(hset).not.toHaveBeenCalled();
  });

  it("does nothing on an empty queue", async () => {
    zrange.mockResolvedValue([]);
    await runMatchTick();
    expect(createSession).not.toHaveBeenCalled();
  });
});

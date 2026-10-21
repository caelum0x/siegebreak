import { describe, it, expect, beforeEach, vi } from "vitest";

// The matcher tick touches Redis (queue read, ticket read/write) and the
// session store (allocation). Mock both so the pairing → allocate → mark flow
// is exercised without live infrastructure.
const { zrange, hget, zrem, hset, set, eval: redisEval } = vi.hoisted(() => ({
  zrange: vi.fn(),
  hget: vi.fn(),
  zrem: vi.fn(),
  hset: vi.fn(),
  // Lock acquire/release (lib/lock.ts) go through the same redis client.
  set: vi.fn(),
  eval: vi.fn(),
}));
vi.mock("../src/lib/redis", () => ({
  redis: { zrange, hget, zrem, hset, set, eval: redisEval },
}));

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
  // Default: this "instance" always wins the tick lock and its release always
  // succeeds, so the lock is transparent to the existing pairing assertions.
  set.mockReset().mockResolvedValue("OK");
  redisEval.mockReset().mockResolvedValue(1);
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

describe("runMatchTick single-leader lock", () => {
  it("skips the tick entirely when another instance already holds the lock", async () => {
    // SET ... NX returning null (not "OK") means another instance's lock is
    // still live — this is the race two concurrent instances would otherwise
    // hit: both reading/pairing/mutating the same queue for the same tick.
    set.mockResolvedValueOnce(null);
    zrange.mockResolvedValue(["p1", "1000", "p2", "1100"]);

    await runMatchTick();

    expect(zrange).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
    expect(redisEval).not.toHaveBeenCalled(); // nothing to release
  });

  it("acquires the lock before pairing and releases it afterward", async () => {
    zrange.mockResolvedValue(["p1", "1000", "p2", "1100"]);
    hget.mockImplementation((k: string) => Promise.resolve(k === "mm:ticket:p1" ? "d1" : "d2"));
    createSession.mockResolvedValue({ id: "sess-lock" });

    await runMatchTick();

    expect(set).toHaveBeenCalledWith("mm:lock:tick", expect.any(String), "PX", expect.any(Number), "NX");
    expect(createSession).toHaveBeenCalledTimes(1);
    // Release runs after pairing completes, compare-and-delete via the Lua script.
    expect(redisEval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call(\"get\", KEYS[1])"),
      1,
      "mm:lock:tick",
      expect.any(String)
    );
  });

  it("still releases the lock when pairing throws", async () => {
    zrange.mockRejectedValue(new Error("redis down"));

    await expect(runMatchTick()).rejects.toThrow("redis down");

    expect(redisEval).toHaveBeenCalledTimes(1); // release still ran via finally
  });
});

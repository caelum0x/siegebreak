import { describe, it, expect, beforeEach, vi } from "vitest";

const { set, eval: redisEval } = vi.hoisted(() => ({
  set: vi.fn(),
  eval: vi.fn(),
}));
vi.mock("../src/lib/redis", () => ({ redis: { set, eval: redisEval } }));

import { acquireLock } from "../src/lib/lock";

beforeEach(() => {
  set.mockReset();
  redisEval.mockReset();
});

describe("acquireLock", () => {
  it("acquires the lock via SET NX and returns a releasable handle", async () => {
    set.mockResolvedValue("OK");
    redisEval.mockResolvedValue(1);

    const lock = await acquireLock("my:lock", 5000);

    expect(lock).not.toBeNull();
    expect(set).toHaveBeenCalledWith("my:lock", expect.any(String), "PX", 5000, "NX");

    await lock!.release();
    expect(redisEval).toHaveBeenCalledTimes(1);
    const [script, numKeys, key, token] = redisEval.mock.calls[0];
    expect(script).toContain("redis.call(\"get\", KEYS[1]) == ARGV[1]");
    expect(numKeys).toBe(1);
    expect(key).toBe("my:lock");
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
  });

  it("returns null when another holder already owns the key", async () => {
    set.mockResolvedValue(null); // NX failed: key already exists

    const lock = await acquireLock("my:lock", 5000);

    expect(lock).toBeNull();
  });

  it("uses a fresh random token per acquisition so two holders can't release each other's lock", async () => {
    set.mockResolvedValue("OK");

    const lockA = await acquireLock("my:lock", 5000);
    const lockB = await acquireLock("my:lock", 5000);

    const tokenA = set.mock.calls[0][1];
    const tokenB = set.mock.calls[1][1];
    expect(tokenA).not.toBe(tokenB);

    await lockA!.release();
    await lockB!.release();
    expect(redisEval.mock.calls[0][3]).toBe(tokenA);
    expect(redisEval.mock.calls[1][3]).toBe(tokenB);
  });
});

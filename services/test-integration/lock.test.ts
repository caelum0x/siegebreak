import { describe, it, expect, afterAll, beforeEach } from "vitest";
import { redis } from "../src/lib/redis";
import { acquireLock } from "../src/lib/lock";

// Exercises the single-leader lock (lib/lock.ts) against REAL Redis — the
// atomicity of SET NX and the compare-and-delete release script are exactly
// the properties a mock can't meaningfully verify.

afterAll(async () => {
  await redis.quit();
});

beforeEach(async () => {
  await redis.flushdb();
});

describe("acquireLock against real Redis", () => {
  it("only one concurrent acquisition wins the same key", async () => {
    const [a, b] = await Promise.all([
      acquireLock("lock:int-1", 5000),
      acquireLock("lock:int-1", 5000),
    ]);

    const winners = [a, b].filter((l) => l !== null);
    expect(winners).toHaveLength(1);
  });

  it("allows re-acquisition only after the holder releases", async () => {
    const lock = await acquireLock("lock:int-2", 5000);
    expect(lock).not.toBeNull();

    expect(await acquireLock("lock:int-2", 5000)).toBeNull();

    await lock!.release();

    const after = await acquireLock("lock:int-2", 5000);
    expect(after).not.toBeNull();
  });

  it("allows re-acquisition after the TTL naturally expires", async () => {
    const lock = await acquireLock("lock:int-3", 50);
    expect(lock).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 120));

    const after = await acquireLock("lock:int-3", 5000);
    expect(after).not.toBeNull();
  });

  it("a stale holder's release does not delete a newer holder's lock", async () => {
    // Simulates a holder whose TTL expired *after* it read the key but
    // *before* it called release — by which point another instance has
    // already acquired a fresh lock on the same key. The compare-and-delete
    // script must refuse to delete because the value no longer matches.
    const stale = await acquireLock("lock:int-4", 50);
    expect(stale).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 120)); // let it expire
    const fresh = await acquireLock("lock:int-4", 5000);
    expect(fresh).not.toBeNull();

    await stale!.release(); // must be a no-op against the fresh lock

    expect(await redis.get("lock:int-4")).not.toBeNull(); // fresh lock survives
    await fresh!.release();
    expect(await redis.get("lock:int-4")).toBeNull();
  });
});

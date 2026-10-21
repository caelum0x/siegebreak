import { randomUUID } from "crypto";
import { redis } from "./redis";

// A Redis-based mutual-exclusion lock for coordinating work across multiple
// API instances (e.g. the matchmaking tick — see matchmaking/matcher.ts).
// `SET key value PX ttl NX` is atomic, so "acquire" is a single round trip
// with no check-then-set race. Release uses a Lua script that only deletes
// the key if its value still matches the token this holder set: without that
// check, a slow holder whose lock already expired (e.g. a GC pause past the
// TTL) could delete a *different* instance's now-active lock on release,
// defeating the whole point of the lock.

const RELEASE_IF_OWNER_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

export interface Lock {
  /** Release this lock, but only if it's still the one we acquired. */
  release(): Promise<void>;
}

// Attempt to acquire an exclusive, time-bounded lock on `key`. Returns null if
// another holder currently has it — callers should treat that as "someone
// else is doing this work right now" and skip their own attempt rather than
// blocking, since this is built for a periodic tick, not a request queue.
export async function acquireLock(key: string, ttlMs: number): Promise<Lock | null> {
  const token = randomUUID();
  const result = await redis.set(key, token, "PX", ttlMs, "NX");
  if (result !== "OK") return null;

  return {
    release: async () => {
      await redis.eval(RELEASE_IF_OWNER_SCRIPT, 1, key, token);
    },
  };
}

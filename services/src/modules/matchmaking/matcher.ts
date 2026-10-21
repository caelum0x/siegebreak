import { redis } from "../../lib/redis";
import { acquireLock } from "../../lib/lock";
import { createSession } from "../sessions/sessionStore";
import { publishMatchFound } from "./notifier";

const QUEUE_KEY = "mm:queue"; // sorted set: score = MMR, member = playerId
const TICKET_PREFIX = "mm:ticket:"; // hash per player: deckId, status, sessionId

const MMR_MATCH_WINDOW = 150; // widen this over wait time once real MMR exists
const MATCH_MODE = "1v1"; // only mode for now; carried onto the allocated session
const MATCH_REGION = process.env.MATCH_REGION || "eu";

// Single-leader guard for the tick (see runMatchTick below). TTL is well
// above the 1s tick interval so a slow-but-alive tick keeps its lock across
// a couple of scheduler ticks, but still short enough that a crashed holder
// doesn't wedge matchmaking for long before another instance picks it back up.
const MATCH_TICK_LOCK_KEY = "mm:lock:tick";
const MATCH_TICK_LOCK_TTL_MS = 5000;

export interface QueuedPlayer {
  id: string;
  mmr: number;
}

export async function enqueue(playerId: string, mmr: number, deckId: string) {
  await redis.zadd(QUEUE_KEY, mmr, playerId);
  await redis.hset(`${TICKET_PREFIX}${playerId}`, {
    deckId,
    status: "queued",
    queuedAt: Date.now(),
  });
}

export async function dequeue(playerId: string) {
  await redis.zrem(QUEUE_KEY, playerId);
  await redis.del(`${TICKET_PREFIX}${playerId}`);
}

export async function getStatus(playerId: string) {
  return redis.hgetall(`${TICKET_PREFIX}${playerId}`);
}

// Pure pairing pass over an MMR-sorted pool: greedily pairs each player with
// the next-closest one whose rating is within `window`. Kept free of Redis so
// the matching rule can be unit-tested in isolation from the transport. A
// player consumed as the second half of a pair is skipped as a future anchor.
// Callers pass players pre-sorted ascending by MMR.
export function computePairings(
  players: readonly QueuedPlayer[],
  window: number
): [QueuedPlayer, QueuedPlayer][] {
  const pairs: [QueuedPlayer, QueuedPlayer][] = [];
  for (let i = 0; i < players.length - 1; i++) {
    const a = players[i];
    const b = players[i + 1];
    if (Math.abs(a.mmr - b.mmr) > window) continue;
    pairs.push([a, b]);
    i++; // b is consumed, skip it as a future anchor
  }
  return pairs;
}

// O(n log n) pass over the whole queue on a 1s interval — fine for
// launch-scale concurrent queue sizes. Guarded by a single-leader Redis lock
// (lib/lock.ts) so running more than one API instance is safe: only the
// instance that wins the lock reads/pairs/mutates the queue for a given tick,
// every other instance's concurrent call sees the lock held and returns
// immediately instead of racing the same players into two sessions.
export async function runMatchTick() {
  const lock = await acquireLock(MATCH_TICK_LOCK_KEY, MATCH_TICK_LOCK_TTL_MS);
  if (!lock) return; // another instance already owns this tick; sit this cycle out
  try {
    await runMatchTickExclusive();
  } finally {
    await lock.release();
  }
}

async function runMatchTickExclusive() {
  const pool = await redis.zrange(QUEUE_KEY, 0, -1, "WITHSCORES");
  const players: QueuedPlayer[] = [];
  for (let i = 0; i < pool.length; i += 2) {
    players.push({ id: pool[i], mmr: Number(pool[i + 1]) });
  }
  players.sort((a, b) => a.mmr - b.mmr);

  for (const [a, b] of computePairings(players, MMR_MATCH_WINDOW)) {
    const session = await allocateSession([a.id, b.id]);
    await Promise.all([markMatched(a.id, session.id), markMatched(b.id, session.id)]);
    // Push the result to any subscribed sockets so a queued client learns it's
    // matched instantly instead of waiting for its next status poll.
    await Promise.all([
      publishMatchFound({ playerId: a.id, sessionId: session.id }),
      publishMatchFound({ playerId: b.id, sessionId: session.id }),
    ]);
  }
}

// Remove the player from the matchable pool but keep their ticket, updating it
// in place. Preserves deckId (which the Fusion handoff still needs) rather than
// deleting-and-recreating the hash — the previous dequeue()+hset() sequence
// dropped deckId, leaving the matched ticket with only status + sessionId.
async function markMatched(playerId: string, sessionId: string) {
  await redis.zrem(QUEUE_KEY, playerId);
  await redis.hset(`${TICKET_PREFIX}${playerId}`, { status: "matched", sessionId });
}

// Allocate a real game session for a matched pair. Each participant's queued
// deck is read back from their ticket so the session carries what they'll play,
// and the persisted session is what GET /matches/session/:id serves to the
// clients (and what the trusted game server consumes to spin up the room).
async function allocateSession(playerIds: readonly string[]) {
  const participants = await Promise.all(
    playerIds.map(async (playerId) => ({
      playerId,
      deckId: (await redis.hget(`${TICKET_PREFIX}${playerId}`, "deckId")) ?? "",
    }))
  );
  return createSession({ mode: MATCH_MODE, region: MATCH_REGION, participants });
}

import { redis } from "../../lib/redis";

const QUEUE_KEY = "mm:queue"; // sorted set: score = MMR, member = playerId
const TICKET_PREFIX = "mm:ticket:"; // hash per player: deckId, status, sessionId

const MMR_MATCH_WINDOW = 150; // widen this over wait time once real MMR exists

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

// Naive O(n log n) pass over the whole queue on a 1s interval — fine for
// launch-scale concurrent queue sizes. If this process ever runs as more
// than one instance, this needs to move to a single-leader worker (e.g. a
// Redis lock or a dedicated matchmaking process) so two instances don't
// both try to match the same players.
export async function runMatchTick() {
  const pool = await redis.zrange(QUEUE_KEY, 0, -1, "WITHSCORES");
  const players: QueuedPlayer[] = [];
  for (let i = 0; i < pool.length; i += 2) {
    players.push({ id: pool[i], mmr: Number(pool[i + 1]) });
  }
  players.sort((a, b) => a.mmr - b.mmr);

  for (const [a, b] of computePairings(players, MMR_MATCH_WINDOW)) {
    const sessionId = await allocateFusionSession([a.id, b.id]);
    await Promise.all([markMatched(a.id, sessionId), markMatched(b.id, sessionId)]);
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

async function allocateFusionSession(playerIds: string[]): Promise<string> {
  // TODO: call Photon Fusion's session/room allocation (or your own
  // dedicated-server allocator if you move off Fusion Cloud later) and
  // return the session id the two clients should connect to.
  return `session_${playerIds.join("_")}_${Date.now()}`;
}

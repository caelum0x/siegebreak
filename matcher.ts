import { redis } from "../../lib/redis";

const QUEUE_KEY = "mm:queue"; // sorted set: score = MMR, member = playerId
const TICKET_PREFIX = "mm:ticket:"; // hash per player: deckId, status, sessionId

const MMR_MATCH_WINDOW = 150; // widen this over wait time once real MMR exists

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

// Naive O(n log n) pass over the whole queue on a 1s interval — fine for
// launch-scale concurrent queue sizes. If this process ever runs as more
// than one instance, this needs to move to a single-leader worker (e.g. a
// Redis lock or a dedicated matchmaking process) so two instances don't
// both try to match the same players.
export async function runMatchTick() {
  const pool = await redis.zrange(QUEUE_KEY, 0, -1, "WITHSCORES");
  const players: { id: string; mmr: number }[] = [];
  for (let i = 0; i < pool.length; i += 2) {
    players.push({ id: pool[i], mmr: Number(pool[i + 1]) });
  }
  players.sort((a, b) => a.mmr - b.mmr);

  for (let i = 0; i < players.length - 1; i++) {
    const a = players[i];
    const b = players[i + 1];
    if (Math.abs(a.mmr - b.mmr) > MMR_MATCH_WINDOW) continue;

    await dequeue(a.id);
    await dequeue(b.id);

    const sessionId = await allocateFusionSession([a.id, b.id]);
    await redis.hset(`${TICKET_PREFIX}${a.id}`, { status: "matched", sessionId });
    await redis.hset(`${TICKET_PREFIX}${b.id}`, { status: "matched", sessionId });

    i++; // b is consumed, skip it as a future "a"
  }
}

async function allocateFusionSession(playerIds: string[]): Promise<string> {
  // TODO: call Photon Fusion's session/room allocation (or your own
  // dedicated-server allocator if you move off Fusion Cloud later) and
  // return the session id the two clients should connect to.
  return `session_${playerIds.join("_")}_${Date.now()}`;
}

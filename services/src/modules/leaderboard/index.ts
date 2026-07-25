import { FastifyInstance } from "fastify";
import { redis } from "../../lib/redis";

function key(seasonId: string) {
  return `leaderboard:${seasonId}`;
}

export async function leaderboardRoutes(app: FastifyInstance) {
  app.get("/leaderboard/:seasonId", async (req) => {
    const { seasonId } = req.params as { seasonId: string };
    const limit = Number((req.query as { limit?: string })?.limit ?? 100);

    const raw = await redis.zrevrange(key(seasonId), 0, limit - 1, "WITHSCORES");
    const entries: { playerId: string; trophies: number; rank: number }[] = [];
    for (let i = 0; i < raw.length; i += 2) {
      entries.push({ playerId: raw[i], trophies: Number(raw[i + 1]), rank: i / 2 + 1 });
    }
    return entries;
  });
}

// Not yet wired to a route — hangs off match completion, which will
// likely be a webhook from the Fusion server or a dedicated
// POST /matches/:id/complete endpoint once that flow exists.
export async function recordMatchResult(seasonId: string, playerId: string, trophiesDelta: number) {
  await redis.zincrby(key(seasonId), trophiesDelta, playerId);
}

import { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { prisma } from "../../lib/prisma";
import { enqueue, dequeue, getStatus } from "./matcher";

const FALLBACK_MMR = 1000; // only used if the player row somehow lacks a rating

export async function matchmakingRoutes(app: FastifyInstance) {
  app.post("/matchmaking/queue", { preHandler: requireAuth }, async (req, reply) => {
    const { deckId } = z.object({ deckId: z.string() }).parse(req.body);
    // Queue at the player's persisted rating so pairing reflects real skill,
    // not a flat constant. Rating is updated on match completion (see matches).
    const player = await prisma.player.findUnique({
      where: { id: req.playerId! },
      select: { rating: true },
    });
    await enqueue(req.playerId!, player?.rating ?? FALLBACK_MMR, deckId);
    return { status: "queued" };
  });

  app.post("/matchmaking/cancel", { preHandler: requireAuth }, async (req, reply) => {
    await dequeue(req.playerId!);
    return { status: "cancelled" };
  });

  // Client polls this at ~1s. A websocket push would remove the polling
  // delay, worth doing once you're past this stub.
  app.get("/matchmaking/status", { preHandler: requireAuth }, async (req, reply) => {
    return getStatus(req.playerId!);
  });
}

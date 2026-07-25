import { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { enqueue, dequeue, getStatus } from "./matcher";

const DEFAULT_MMR = 1000; // TODO: replace with a real rating table lookup

export async function matchmakingRoutes(app: FastifyInstance) {
  app.post("/matchmaking/queue", { preHandler: requireAuth }, async (req, reply) => {
    const { deckId } = z.object({ deckId: z.string() }).parse(req.body);
    await enqueue(req.playerId!, DEFAULT_MMR, deckId);
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

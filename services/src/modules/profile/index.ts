import { FastifyInstance } from "fastify";
import { prisma } from "../../lib/prisma";

export async function profileRoutes(app: FastifyInstance) {
  app.get("/profile/:playerId", async (req, reply) => {
    const { playerId } = req.params as { playerId: string };

    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { id: true, displayName: true, level: true, xp: true },
    });

    if (!player) return reply.code(404).send({ error: "not_found" });
    return player;
  });
}

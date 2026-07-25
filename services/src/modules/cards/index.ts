import { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { prisma } from "../../lib/prisma";

export async function cardsRoutes(app: FastifyInstance) {
  app.get("/cards", async () => {
    return prisma.card.findMany();
  });

  app.get("/players/me/decks", { preHandler: requireAuth }, async (req) => {
    return prisma.deck.findMany({ where: { playerId: req.playerId! } });
  });

  app.post("/players/me/decks", { preHandler: requireAuth }, async (req, reply) => {
    const body = z
      .object({
        name: z.string().min(1).max(40),
        slots: z.array(z.string()).length(8),
      })
      .parse(req.body);

    // Slot 0 must be a hero card — this is a rule check, not just a UI
    // convention, so it belongs server-side. Duplicate-card and full
    // elixir-curve validation should land here too before this ships.
    const heroCard = await prisma.card.findUnique({ where: { id: body.slots[0] } });
    if (!heroCard || heroCard.type !== "hero") {
      return reply.code(400).send({ error: "slot_0_must_be_hero" });
    }

    return prisma.deck.create({
      data: { playerId: req.playerId!, name: body.name, slots: body.slots },
    });
  });
}

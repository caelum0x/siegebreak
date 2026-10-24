import { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { prisma } from "../../lib/prisma";
import { isMaxLevel, upgradeCost } from "../../lib/cardProgression";

export async function cardsRoutes(app: FastifyInstance) {
  app.get("/cards", async () => {
    return prisma.card.findMany();
  });

  // The authed player's owned collection — level/shards per card, joined with
  // the catalog so the client doesn't need a second round-trip to render name/
  // elixir/type. Distinct from the public `/cards` catalog above, which lists
  // every card that exists regardless of ownership.
  app.get("/players/me/cards", { preHandler: requireAuth }, async (req) => {
    const owned = await prisma.playerCard.findMany({
      where: { playerId: req.playerId! },
      include: { card: true },
    });

    return owned.map((pc) => ({
      cardId: pc.cardId,
      name: pc.card.name,
      type: pc.card.type,
      elixirCost: pc.card.elixirCost,
      level: pc.level,
      shards: pc.shards,
      maxLevel: isMaxLevel(pc.level),
      nextLevelCost: isMaxLevel(pc.level) ? null : upgradeCost(pc.level),
    }));
  });

  // Spends gold + shards to level up one owned card. The cost curve and max
  // level are pure functions (lib/cardProgression.ts) so the economy rules
  // stay testable without a live DB.
  app.post("/players/me/cards/:cardId/upgrade", { preHandler: requireAuth }, async (req, reply) => {
    const { cardId } = z.object({ cardId: z.string().min(1) }).parse(req.params);
    const playerId = req.playerId!;

    const owned = await prisma.playerCard.findUnique({
      where: { playerId_cardId: { playerId, cardId } },
    });
    if (!owned) {
      return reply.code(404).send({ error: "card_not_owned" });
    }
    if (isMaxLevel(owned.level)) {
      return reply.code(400).send({ error: "max_level" });
    }

    const cost = upgradeCost(owned.level);
    const wallet = await prisma.wallet.findUnique({ where: { playerId } });
    const gold = wallet?.gold ?? 0;
    if (gold < cost.gold || owned.shards < cost.shards) {
      return reply.code(402).send({
        error: "insufficient_resources",
        required: cost,
        available: { gold, shards: owned.shards },
      });
    }

    const [updatedCard] = await prisma.$transaction([
      prisma.playerCard.update({
        where: { playerId_cardId: { playerId, cardId } },
        data: { level: { increment: 1 }, shards: { decrement: cost.shards } },
      }),
      prisma.wallet.update({
        where: { playerId },
        data: { gold: { decrement: cost.gold } },
      }),
    ]);

    return {
      cardId,
      level: updatedCard.level,
      shards: updatedCard.shards,
      spent: cost,
    };
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
    // convention, so it belongs server-side.
    const heroCard = await prisma.card.findUnique({ where: { id: body.slots[0] } });
    if (!heroCard || heroCard.type !== "hero") {
      return reply.code(400).send({ error: "slot_0_must_be_hero" });
    }

    // No card may appear twice in the same deck.
    if (new Set(body.slots).size !== body.slots.length) {
      return reply.code(400).send({ error: "duplicate_card_in_deck" });
    }

    // Slots 1-7 were never checked against the catalog at all before this —
    // only slot 0 was looked up. Reject any slot that doesn't name a real
    // card instead of silently saving a deck with dead references.
    const nonHeroSlots = body.slots.slice(1);
    const matchedCards = await prisma.card.findMany({ where: { id: { in: nonHeroSlots } } });
    if (matchedCards.length !== nonHeroSlots.length) {
      return reply.code(400).send({ error: "unknown_card_in_deck" });
    }

    // Elixir-curve cap is deliberately not enforced here: the PRD gives a
    // cost range (1-9, hero fixed at 5) but no numeric average/sum cap, and
    // inventing one isn't a code fix — it's a product decision still open.
    return prisma.deck.create({
      data: { playerId: req.playerId!, name: body.name, slots: body.slots },
    });
  });
}

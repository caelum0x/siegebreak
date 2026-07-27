import { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { prisma } from "../../lib/prisma";
import { strictRateLimitConfig } from "../../lib/rateLimit";
import { verifyReceipt } from "./receiptVerification";
import { listProducts } from "./products";

export async function economyRoutes(app: FastifyInstance) {
  // Public catalog so clients can render the store from the server's source of
  // truth rather than a hardcoded client list.
  app.get("/economy/products", async () => listProducts());

  app.get("/economy/wallet", { preHandler: requireAuth }, async (req) => {
    const wallet = await prisma.wallet.findUnique({ where: { playerId: req.playerId! } });
    return wallet ?? { playerId: req.playerId, gold: 0, gems: 0 };
  });

  app.post("/economy/purchase/validate", { preHandler: requireAuth, config: strictRateLimitConfig() }, async (req, reply) => {
    const body = z
      .object({ receipt: z.string(), platform: z.enum(["ios", "android"]) })
      .parse(req.body);

    // Record the attempt before verifying — gives you an audit trail even
    // for receipts that fail validation (useful for fraud investigation).
    const purchase = await prisma.purchase.create({
      data: { playerId: req.playerId!, productId: "pending_verification", receipt: body.receipt },
    });

    let result;
    try {
      result = await verifyReceipt(body.platform, body.receipt);
    } catch (err) {
      req.log.error(err, "receipt verification failed");
      return reply.code(502).send({ error: "verification_unavailable" });
    }

    if (!result.valid) {
      return reply.code(402).send({ error: "receipt_invalid" });
    }

    await prisma.$transaction([
      prisma.purchase.update({
        where: { id: purchase.id },
        data: { productId: result.productId, validatedAt: new Date(), granted: true },
      }),
      // Upsert, not update: a player's first-ever transaction may be a purchase,
      // before any wallet row exists. Update alone would throw on the missing
      // row and 500 a legitimately-paid purchase.
      prisma.wallet.upsert({
        where: { playerId: req.playerId! },
        create: { playerId: req.playerId!, gems: result.gemsGranted },
        update: { gems: { increment: result.gemsGranted } },
      }),
    ]);

    return { status: "granted", productId: result.productId, gemsGranted: result.gemsGranted };
  });
}

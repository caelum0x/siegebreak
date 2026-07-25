import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireMatchServer } from "../../middleware/serverAuth";
import { recordMatchResult } from "../leaderboard";

const completeSchema = z.object({
  seasonId: z.string().min(1),
  region: z.string().min(1),
  mode: z.string().min(1),
  participants: z
    .array(
      z.object({
        playerId: z.string().min(1),
        deckId: z.string().min(1),
        result: z.enum(["win", "loss", "draw"]),
        trophiesDelta: z.number().int(),
      })
    )
    .min(2),
});

export async function matchRoutes(app: FastifyInstance) {
  // Called by the trusted game server when a match ends — never by a client,
  // hence requireMatchServer rather than requireAuth. trophiesDelta and result
  // are authoritative from the server sim, which is why they're accepted here
  // and not recomputed.
  app.post("/matches/:id/complete", { preHandler: requireMatchServer }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = completeSchema.parse(req.body);

    // Idempotency: match ids are server-assigned and completion may be retried
    // on network wobble, so a second completion for the same id must not double
    // -award trophies. The Match row is the guard.
    const existing = await prisma.match.findUnique({ where: { id } });
    if (existing) {
      return reply.code(409).send({ error: "already_recorded" });
    }

    // Persist to the source of truth first (Postgres), then update the derived
    // leaderboard (Redis). If the Redis step fails the match is still recorded
    // and the ladder can be rebuilt from match_participants.
    await prisma.match.create({
      data: {
        id,
        region: body.region,
        mode: body.mode,
        endedAt: new Date(),
        participants: {
          create: body.participants.map((p) => ({
            playerId: p.playerId,
            deckId: p.deckId,
            result: p.result,
            trophiesDelta: p.trophiesDelta,
          })),
        },
      },
    });

    await Promise.all(
      body.participants.map((p) =>
        recordMatchResult(body.seasonId, p.playerId, p.trophiesDelta)
      )
    );

    return reply.code(201).send({ status: "recorded", matchId: id });
  });
}

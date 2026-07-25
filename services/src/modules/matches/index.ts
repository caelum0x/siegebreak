import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireMatchServer } from "../../middleware/serverAuth";
import { recordMatchResult } from "../leaderboard";
import { computeElo, resultToScore, matchRewards, levelForXp } from "../../lib/rating";

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

    // Load current rating/xp for every participant so we can derive new values.
    // All must exist (they FK the match) — surface a clean 422 rather than a raw
    // FK error if the server reports an unknown player.
    const ids = body.participants.map((p) => p.playerId);
    const players = await prisma.player.findMany({
      where: { id: { in: ids } },
      select: { id: true, rating: true, xp: true },
    });
    const byId = new Map(players.map((p) => [p.id, p]));
    if (byId.size !== new Set(ids).size) {
      return reply.code(422).send({ error: "unknown_player" });
    }

    // Elo is a two-player update; for the 1v1 mode the two participants' ratings
    // move symmetrically. Other participant counts skip Elo (rating unchanged)
    // but still earn XP/gold.
    const newRatingById = new Map<string, number>();
    if (body.participants.length === 2) {
      const [pa, pb] = body.participants;
      const ra = byId.get(pa.playerId)!.rating;
      const rb = byId.get(pb.playerId)!.rating;
      const elo = computeElo(ra, rb, resultToScore(pa.result));
      newRatingById.set(pa.playerId, elo.a);
      newRatingById.set(pb.playerId, elo.b);
    }

    // Build the per-player progression updates (rating + xp/level + wallet gold).
    const rewardsById = new Map(
      body.participants.map((p) => {
        const current = byId.get(p.playerId)!;
        const reward = matchRewards(p.result);
        const newXp = current.xp + reward.xp;
        return [
          p.playerId,
          {
            rating: newRatingById.get(p.playerId) ?? current.rating,
            xp: newXp,
            level: levelForXp(newXp),
            gold: reward.gold,
          },
        ];
      })
    );

    // Persist match, participants, and all progression in one transaction so a
    // recorded match and its awarded rating/xp/gold can never diverge. Then
    // update the derived leaderboard (Redis) — if that fails the ladder can be
    // rebuilt from match_participants.
    await prisma.$transaction([
      prisma.match.create({
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
      }),
      ...body.participants.flatMap((p) => {
        const r = rewardsById.get(p.playerId)!;
        return [
          prisma.player.update({
            where: { id: p.playerId },
            data: { rating: r.rating, xp: r.xp, level: r.level },
          }),
          prisma.wallet.upsert({
            where: { playerId: p.playerId },
            create: { playerId: p.playerId, gold: r.gold },
            update: { gold: { increment: r.gold } },
          }),
        ];
      }),
    ]);

    await Promise.all(
      body.participants.map((p) =>
        recordMatchResult(body.seasonId, p.playerId, p.trophiesDelta)
      )
    );

    return reply.code(201).send({
      status: "recorded",
      matchId: id,
      ratings: body.participants.map((p) => ({
        playerId: p.playerId,
        rating: rewardsById.get(p.playerId)!.rating,
      })),
    });
  });
}

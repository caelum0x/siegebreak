import { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { prisma } from "../../lib/prisma";
import { summarizeRecord } from "../../lib/stats";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

// coerce + clamp: the query string arrives as a string, so coerce to a number,
// reject non-numeric junk (Zod → 400 via the shared handler), then bound the
// page size so a client can't ask for an unbounded scan.
const historyQuery = z.object({
  limit: z.coerce.number().int().positive().optional(),
});

// The shape returned per opponent in a history entry — flattened from the
// nested participant row so the client never has to reach through relations.
interface OpponentSummary {
  playerId: string;
  displayName: string;
  result: string;
}

export async function playerRoutes(app: FastifyInstance) {
  // Authenticated "who am I" — progression (level/xp/rating) joined with the
  // wallet. Distinct from the public GET /profile/:playerId, which deliberately
  // exposes less and is scoped by a path param rather than the token.
  app.get("/players/me", { preHandler: requireAuth }, async (req, reply) => {
    const player = await prisma.player.findUnique({
      where: { id: req.playerId! },
      select: { id: true, displayName: true, level: true, xp: true, rating: true },
    });
    if (!player) return reply.code(404).send({ error: "not_found" });

    // A player may not have a wallet row until their first grant; present it as
    // zeros rather than null so the client has a stable shape to render.
    const wallet = await prisma.wallet.findUnique({
      where: { playerId: req.playerId! },
      select: { gold: true, gems: true },
    });

    // Aggregate the player's win/loss/draw record from their participant rows.
    // One grouped query rather than three counts, then collapsed by the pure
    // stats helper so the win-rate rule stays testable in isolation.
    const grouped = await prisma.matchParticipant.groupBy({
      by: ["result"],
      where: { playerId: req.playerId! },
      _count: { _all: true },
    });
    const record = summarizeRecord(
      grouped.map((g) => ({ result: g.result, count: g._count._all }))
    );

    // Construct the wallet shape explicitly rather than spreading the row, so
    // the response contract is guaranteed { gold, gems } regardless of what
    // extra columns the query returns.
    return {
      ...player,
      wallet: { gold: wallet?.gold ?? 0, gems: wallet?.gems ?? 0 },
      record,
    };
  });

  // The authed player's recent completed matches, newest first. Reads from the
  // player's own participant rows and pulls the co-participants (excluding
  // self) so the client can show who they played. Bounded page size.
  app.get("/players/me/matches", { preHandler: requireAuth }, async (req) => {
    const { limit } = historyQuery.parse(req.query);
    const take = Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const playerId = req.playerId!;

    const rows = await prisma.matchParticipant.findMany({
      where: { playerId },
      orderBy: { match: { endedAt: "desc" } },
      take,
      select: {
        deckId: true,
        result: true,
        trophiesDelta: true,
        match: {
          select: {
            id: true,
            mode: true,
            region: true,
            endedAt: true,
            participants: {
              where: { playerId: { not: playerId } },
              select: {
                playerId: true,
                result: true,
                player: { select: { displayName: true } },
              },
            },
          },
        },
      },
    });

    return rows.map((row) => ({
      matchId: row.match.id,
      mode: row.match.mode,
      region: row.match.region,
      endedAt: row.match.endedAt,
      result: row.result,
      trophiesDelta: row.trophiesDelta,
      deckId: row.deckId,
      opponents: row.match.participants.map(
        (p): OpponentSummary => ({
          playerId: p.playerId,
          displayName: p.player.displayName,
          result: p.result,
        })
      ),
    }));
  });
}

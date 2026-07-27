import { FastifyInstance } from "fastify";
import { requireAuth } from "../../middleware/auth";
import { getSession, isParticipant } from "./sessionStore";

export async function sessionRoutes(app: FastifyInstance) {
  // A matched player fetches the concrete room to connect to. Scoped to the
  // session's participants: a non-participant (or a stale/unknown id) gets a
  // 404 rather than a 403, so session ids aren't enumerable — a caller can't
  // distinguish "exists but not yours" from "doesn't exist".
  app.get("/matches/session/:id", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const session = await getSession(id);
    if (!session || !isParticipant(session, req.playerId!)) {
      return reply.code(404).send({ error: "session_not_found" });
    }

    return session;
  });
}

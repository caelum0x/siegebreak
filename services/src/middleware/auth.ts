import { FastifyRequest, FastifyReply } from "fastify";
import { verifyAccessToken } from "../lib/jwt";

declare module "fastify" {
  interface FastifyRequest {
    playerId?: string;
  }
}

// Attach as a route's preHandler, not a global hook — some routes
// (card catalog, public profile) are intentionally unauthenticated.
export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return reply.code(401).send({ error: "missing_token" });
  }

  try {
    const payload = verifyAccessToken(header.slice("Bearer ".length));
    req.playerId = payload.playerId;
  } catch {
    return reply.code(401).send({ error: "invalid_token" });
  }
}

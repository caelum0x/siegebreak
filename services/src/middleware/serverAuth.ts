import { FastifyRequest, FastifyReply } from "fastify";

// Guards server-to-server endpoints (match results, future admin/live-ops
// hooks) that must be callable only by our own trusted game server, never by a
// player client. A shared secret is sufficient here because both ends are
// first-party; player-facing routes use JWTs via requireAuth instead.
export async function requireMatchServer(req: FastifyRequest, reply: FastifyReply) {
  const expected = process.env.MATCH_SERVER_SECRET;
  if (!expected) {
    // Fail closed: a missing secret must never mean "allow everyone".
    req.log.error("MATCH_SERVER_SECRET is not set — refusing server-auth route");
    return reply.code(503).send({ error: "server_auth_unconfigured" });
  }

  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ") || header.slice("Bearer ".length) !== expected) {
    return reply.code(401).send({ error: "invalid_server_secret" });
  }
}

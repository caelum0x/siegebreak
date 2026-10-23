import { FastifyInstance } from "fastify";
import { requireAuth } from "../../middleware/auth";
import { verifyAccessToken } from "../../lib/jwt";
import { tokenFromQuery } from "../matchmaking";
import { getSession, hostPlayerId, isParticipant } from "./sessionStore";
import { publishRelay, registerRelaySocket } from "./relay";

// Hard ceiling on a single relay frame. Generous for a JSON input/snapshot
// message; exists only to stop a misbehaving client from flooding the relay
// (and the Redis pub/sub channel every other instance subscribes to) with an
// oversized payload.
const MAX_RELAY_FRAME_BYTES = 16 * 1024;

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

  // Real-time in-match transport for the "local" SESSION_PROVIDER (see
  // sessionStore.providerName / relay.ts). Both participants of an allocated
  // session connect here to exchange gameplay frames for the rest of the
  // match: whoever sessionStore.hostPlayerId names runs the authoritative
  // simulation and broadcasts state, the other sends input and applies what
  // it receives. Auth is via a ?token= query param, same as the matchmaking
  // subscribe socket (WS handshakes can't carry an Authorization header).
  app.get("/sessions/:id/relay", { websocket: true }, async (connection, req) => {
    const socket = connection.socket;
    const { id } = req.params as { id: string };

    const token = tokenFromQuery(req.query);
    let playerId: string;
    try {
      if (!token) throw new Error("missing token");
      playerId = verifyAccessToken(token).playerId;
    } catch {
      socket.send(JSON.stringify({ type: "error", error: "unauthorized" }));
      socket.close();
      return;
    }

    const session = await getSession(id);
    if (!session || !isParticipant(session, playerId)) {
      // Same not-found-not-forbidden posture as the HTTP route above: a
      // participant can't tell a stale/expired session from one that was
      // never theirs.
      socket.send(JSON.stringify({ type: "error", error: "session_not_found" }));
      socket.close();
      return;
    }

    // Tell the client its role before relaying anything, so it never has to
    // guess whether it's driving the simulation or just rendering it.
    socket.send(
      JSON.stringify({
        type: "welcome",
        isHost: hostPlayerId(session) === playerId,
        participants: session.participants.map((p) => p.playerId),
        mode: session.mode,
        region: session.region,
      })
    );

    const unregister = registerRelaySocket(id, playerId, (data) => socket.send(data));
    socket.on("close", unregister);

    socket.on("message", (raw: Buffer) => {
      if (raw.length === 0 || raw.length > MAX_RELAY_FRAME_BYTES) return;
      publishRelay({ sessionId: id, fromPlayerId: playerId, data: raw.toString() }).catch((err) =>
        req.log.error(err, "session relay publish failed")
      );
    });
  });
}

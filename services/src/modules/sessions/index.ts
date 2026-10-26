import { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { verifyAccessToken } from "../../lib/jwt";
import { tokenFromQuery } from "../matchmaking";
import { getSession, hostPlayerId, isParticipant } from "./sessionStore";
import { publishRelay, registerRelaySocket } from "./relay";
import { completeMatch } from "../matches";
import { trophyDelta, type MatchResult } from "../../lib/rating";
import { dequeue } from "../matchmaking/matcher";

// Hard ceiling on a single relay frame. Generous for a JSON input/snapshot
// message; exists only to stop a misbehaving client from flooding the relay
// (and the Redis pub/sub channel every other instance subscribes to) with an
// oversized payload.
const MAX_RELAY_FRAME_BYTES = 16 * 1024;

// Evergreen season for the "local" provider's self-reported match completion
// below. The backend has no season-rotation concept yet (POST
// /matches/:id/complete's seasonId is caller-supplied and nothing creates or
// rotates seasons anywhere) — inventing a rotation schedule is a product
// decision, not a code gap, so this is one deliberately simple default
// rather than leaving the only working transport's match results unrecorded.
const LOCAL_MATCH_SEASON_ID = process.env.MATCH_SEASON_ID || "s1";

const completeByHostSchema = z.object({
  participants: z
    .array(
      z.object({
        playerId: z.string().min(1),
        result: z.enum(["win", "loss", "draw"]),
      })
    )
    .min(2)
    .max(2),
});

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

  // Closes the gap flagged as a bare TODO in the Unity client
  // (MatchStateController.Finish): under the "local" relay provider there is
  // no dedicated, trusted game server to call POST /matches/:id/complete —
  // the host participant's own client runs the authoritative simulation
  // (MatchHostSimulator) and is the only one who knows the real outcome, so
  // it's the only one allowed to report it here. This does NOT make the host
  // client trusted the way requireMatchServer's shared secret does (a
  // motivated host could still misreport); it closes the "every real match
  // played over the only working transport vanishes with zero rating/XP/
  // gold/shard/history effect" gap, which is strictly worse than trusting
  // the deterministic host for the un-verifiable parts of the result while
  // still deriving everything we *can* verify server-side (who was actually
  // in this session, what deck they actually queued with, how a given
  // result maps to a trophy swing) instead of taking the client's word for
  // any of that.
  app.post("/sessions/:id/complete", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = completeByHostSchema.parse(req.body);

    const session = await getSession(id);
    if (!session) {
      return reply.code(404).send({ error: "session_not_found" });
    }

    // Only the deterministic host may report a result — same
    // not-found-not-forbidden posture as the relay route above, so a guest
    // (or a non-participant) can't distinguish "not your call to make" from
    // "unknown session" by probing this route.
    if (hostPlayerId(session) !== req.playerId) {
      return reply.code(404).send({ error: "session_not_found" });
    }

    // The reported participants must be exactly this session's participants
    // — no more, no fewer, no substitutions. Everything else about them
    // (deckId, trophy swing) is then derived server-side, never trusted from
    // the request body.
    const sessionPlayerIds = new Set(session.participants.map((p) => p.playerId));
    const reportedPlayerIds = new Set(body.participants.map((p) => p.playerId));
    const sameParticipants =
      sessionPlayerIds.size === reportedPlayerIds.size &&
      [...sessionPlayerIds].every((playerId) => reportedPlayerIds.has(playerId));
    if (!sameParticipants) {
      return reply.code(400).send({ error: "participants_mismatch" });
    }

    // For the only mode this provider serves (1v1), the two reported results
    // must actually be a valid pair — reject a host trying to report both
    // players as winners (or both as losers), since that's never a real
    // outcome of a single match.
    if (body.participants.length === 2) {
      const [ra, rb] = body.participants.map((p) => p.result);
      const validPair =
        (ra === "draw" && rb === "draw") || (ra === "win" && rb === "loss") || (ra === "loss" && rb === "win");
      if (!validPair) {
        return reply.code(400).send({ error: "invalid_result_combination" });
      }
    }

    const deckIdByPlayer = new Map(session.participants.map((p) => [p.playerId, p.deckId]));
    const outcome = await completeMatch(id, {
      seasonId: LOCAL_MATCH_SEASON_ID,
      region: session.region,
      mode: session.mode,
      participants: body.participants.map((p) => ({
        playerId: p.playerId,
        deckId: deckIdByPlayer.get(p.playerId) ?? "",
        result: p.result as MatchResult,
        trophiesDelta: trophyDelta(p.result as MatchResult),
      })),
    });

    if (outcome.code === 201) {
      // Free both participants' matchmaking tickets immediately instead of
      // leaving them pinned to this now-finished session until its 1h TTL
      // lapses (see the /matchmaking/queue guard above, which otherwise
      // keeps rejecting their next queue attempt as "already_in_match").
      await Promise.all([...sessionPlayerIds].map((playerId) => dequeue(playerId)));
    }

    return reply.code(outcome.code).send(outcome.body);
  });
}

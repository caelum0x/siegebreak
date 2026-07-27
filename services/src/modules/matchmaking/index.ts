import { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { prisma } from "../../lib/prisma";
import { verifyAccessToken } from "../../lib/jwt";
import { enqueue, dequeue, getStatus } from "./matcher";
import { registerSocket, matchFoundMessage } from "./notifier";

const FALLBACK_MMR = 1000; // only used if the player row somehow lacks a rating

// Browsers can't set an Authorization header on a WebSocket handshake, so the
// access token is passed as a query param instead. Pulled out as a pure helper
// so the extraction rule is testable without a live socket.
export function tokenFromQuery(query: unknown): string | null {
  if (query && typeof query === "object" && "token" in query) {
    const token = (query as { token: unknown }).token;
    if (typeof token === "string" && token.length > 0) return token;
  }
  return null;
}

export async function matchmakingRoutes(app: FastifyInstance) {
  app.post("/matchmaking/queue", { preHandler: requireAuth }, async (req, reply) => {
    const { deckId } = z.object({ deckId: z.string() }).parse(req.body);
    // Queue at the player's persisted rating so pairing reflects real skill,
    // not a flat constant. Rating is updated on match completion (see matches).
    const player = await prisma.player.findUnique({
      where: { id: req.playerId! },
      select: { rating: true },
    });
    await enqueue(req.playerId!, player?.rating ?? FALLBACK_MMR, deckId);
    return { status: "queued" };
  });

  app.post("/matchmaking/cancel", { preHandler: requireAuth }, async (req, reply) => {
    await dequeue(req.playerId!);
    return { status: "cancelled" };
  });

  // Polling fallback: clients that can't hold a socket (or as a backstop behind
  // the WS push below) read status here at ~1s.
  app.get("/matchmaking/status", { preHandler: requireAuth }, async (req, reply) => {
    return getStatus(req.playerId!);
  });

  // Real-time push: a queued client subscribes here and is notified the instant
  // the matcher pairs it, rather than waiting for its next poll. Auth is via a
  // ?token= query param (WS handshakes can't carry an Authorization header).
  // On connect we also replay the current ticket, closing the race where a
  // match is made in the window between queueing and the socket opening.
  app.get("/matchmaking/subscribe", { websocket: true }, async (connection, req) => {
    // @fastify/websocket v8 hands the handler a SocketStream; the underlying ws
    // WebSocket is on `.socket`.
    const socket = connection.socket;

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

    const unregister = registerSocket(playerId, (data) => socket.send(data));
    socket.on("close", unregister);

    // Replay: if already matched before subscribing, push it immediately.
    const ticket = await getStatus(playerId);
    if (ticket?.status === "matched" && ticket.sessionId) {
      socket.send(matchFoundMessage(ticket.sessionId));
    }
  });
}

import type Redis from "ioredis";
import { redis } from "../../lib/redis";

// Real-time in-match relay — the actual transport behind the "local"
// SESSION_PROVIDER (see sessionStore.providerName). Once matchmaking
// allocates a session, both participants connect to
// GET /sessions/:id/relay and exchange gameplay frames for the rest of the
// match: the host (sessionStore.hostPlayerId) runs the authoritative
// simulation and broadcasts state snapshots, the guest sends input (card
// deploys) and applies the snapshots it receives. This module only knows
// *who* is in *which* session and forwards frames between them unparsed —
// it has no opinion on what a frame means.
//
// If this ever moves to Photon Fusion (or a dedicated server/Agones), this
// file and its client-side counterpart (client/.../Services/MatchRelayClient)
// are the only things that change — everything upstream (matchmaking,
// allocation, session lookup) stays the same.

const CHANNEL = "session:relay";

export interface RelayEnvelope {
  sessionId: string;
  fromPlayerId: string;
  data: string;
}

type Sender = (data: string) => void;

// Local (per-instance) registry: sessionId -> playerId -> sender. A session
// only ever has the two matched participants, so each room stays tiny.
const rooms = new Map<string, Map<string, Sender>>();

// Register a connected socket for a participant of a session. Returns an
// unregister function to call on socket close so rooms don't leak entries.
export function registerRelaySocket(sessionId: string, playerId: string, send: Sender): () => void {
  let room = rooms.get(sessionId);
  if (!room) {
    room = new Map();
    rooms.set(sessionId, room);
  }
  room.set(playerId, send);

  return () => {
    const current = rooms.get(sessionId);
    if (!current) return;
    current.delete(playerId);
    if (current.size === 0) rooms.delete(sessionId);
  };
}

// Forward a frame to every other participant of the session connected to
// *this* instance (the sender never gets its own frame echoed back). Returns
// how many sockets were reached, so dispatchLocal(...) === 0 is the expected,
// unremarkable case when the other participant is connected to a different
// instance (that instance's own subscriber handles it via Redis below).
export function dispatchLocal(envelope: RelayEnvelope): number {
  const room = rooms.get(envelope.sessionId);
  if (!room) return 0;
  let delivered = 0;
  for (const [playerId, send] of room) {
    if (playerId === envelope.fromPlayerId) continue;
    send(envelope.data);
    delivered++;
  }
  return delivered;
}

// Publish a frame for cross-instance fan-out. The two participants of a
// session can end up connected to different API instances, so every instance
// publishes here and every instance's subscriber (startSessionRelay) delivers
// to whichever of its own locally-registered sockets match.
export async function publishRelay(envelope: RelayEnvelope): Promise<void> {
  await redis.publish(CHANNEL, JSON.stringify(envelope));
}

// Dedicated subscriber connection — same rationale as
// modules/matchmaking/notifier.ts: a Redis connection in subscribe mode can't
// also issue normal commands, so this is a duplicate of the shared client
// rather than a reuse of it.
let subscriber: Redis | null = null;

export function startSessionRelay(onError?: (err: unknown) => void): void {
  if (subscriber) return;
  subscriber = redis.duplicate();
  subscriber.subscribe(CHANNEL).catch((err) => onError?.(err));
  subscriber.on("message", (_channel, message) => {
    try {
      dispatchLocal(JSON.parse(message) as RelayEnvelope);
    } catch (err) {
      onError?.(err);
    }
  });
}

export async function stopSessionRelay(): Promise<void> {
  if (!subscriber) return;
  await subscriber.quit();
  subscriber = null;
}

// Exposed for tests to assert/clear registry state without reaching into
// module internals through other means.
export function _clearRoomsForTest(): void {
  rooms.clear();
}

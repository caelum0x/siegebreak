import { randomUUID } from "crypto";
import { redis } from "../../lib/redis";

// A game session is the concrete realtime "room" the two matched clients
// connect to. This is our own dedicated-session registry: allocation writes a
// record to Redis that the trusted game server (or, in local dev, the clients
// themselves) reads to know who is in the room and where to connect. It
// replaces the earlier placeholder that returned a synthetic session string
// and never persisted anything.

const KEY_PREFIX = "session:";
// Sessions self-expire so abandoned/never-joined rooms don't accumulate. An
// hour is comfortably longer than any single match plus reconnect grace.
const SESSION_TTL_SECONDS = 60 * 60;

export interface SessionParticipant {
  playerId: string;
  deckId: string;
}

export interface GameSession {
  id: string;
  mode: string;
  region: string;
  status: "allocated";
  createdAt: number;
  participants: SessionParticipant[];
  connection: SessionConnection;
}

export interface SessionConnection {
  /** Realtime provider the clients route through. */
  provider: string;
  /** Room/session name to join on that provider (equals the session id). */
  roomName: string;
}

export interface CreateSessionInput {
  mode: string;
  region: string;
  participants: SessionParticipant[];
}

function key(id: string): string {
  return `${KEY_PREFIX}${id}`;
}

// Which realtime provider the game clients should connect through. Defaults to
// our own "local" dedicated-session model; set SESSION_PROVIDER=photon (with the
// Photon SDK on the client) to route rooms through Photon Fusion instead. The
// room name is the session id under either provider, so the allocation contract
// is stable across the swap.
function providerName(): string {
  return process.env.SESSION_PROVIDER || "local";
}

// Allocate and persist a session for a set of participants. Returns the full
// record so the caller can hand the id back to the matched players immediately.
export async function createSession(input: CreateSessionInput): Promise<GameSession> {
  const id = randomUUID();
  const session: GameSession = {
    id,
    mode: input.mode,
    region: input.region,
    status: "allocated",
    createdAt: Date.now(),
    participants: input.participants,
    connection: { provider: providerName(), roomName: id },
  };

  await redis.set(key(id), JSON.stringify(session), "EX", SESSION_TTL_SECONDS);
  return session;
}

// Fetch a session by id, or null if it never existed / has expired. Tolerates a
// corrupt value by returning null rather than throwing, so one bad row can't
// take down the lookup route.
export async function getSession(id: string): Promise<GameSession | null> {
  const raw = await redis.get(key(id));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GameSession;
  } catch {
    return null;
  }
}

export function isParticipant(session: GameSession, playerId: string): boolean {
  return session.participants.some((p) => p.playerId === playerId);
}

// Deterministic authority assignment for the realtime relay (modules/sessions/
// relay.ts): the first participant in allocation order runs the authoritative
// simulation and broadcasts state; the other sends input only. Both sides
// derive this the same way from the same session record, so there's no
// handshake or election needed — and no scenario where both or neither think
// they're host.
export function hostPlayerId(session: GameSession): string | undefined {
  return session.participants[0]?.playerId;
}

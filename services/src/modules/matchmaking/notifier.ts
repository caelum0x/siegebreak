import type Redis from "ioredis";
import { redis } from "../../lib/redis";

// Real-time "match found" fan-out. When the matcher pairs players it publishes
// an event on a Redis channel; every API instance runs a subscriber that pushes
// the event to any of those players connected to *that* instance. Redis pub/sub
// is what makes this correct across more than one instance — a player connected
// to instance B still gets notified when the matcher on instance A pairs them.

const CHANNEL = "mm:notify";

export interface MatchFoundEvent {
  playerId: string;
  sessionId: string;
}

// A connected client's send function. A player may hold several sockets (e.g.
// multiple tabs); all of them are notified.
type Sender = (data: string) => void;

// Local (per-instance) registry of connected sockets by playerId.
const sockets = new Map<string, Set<Sender>>();

// Register a socket for a player. Returns an unregister function to call on
// socket close so the map doesn't leak entries.
export function registerSocket(playerId: string, send: Sender): () => void {
  let set = sockets.get(playerId);
  if (!set) {
    set = new Set();
    sockets.set(playerId, set);
  }
  set.add(send);

  return () => {
    const current = sockets.get(playerId);
    if (!current) return;
    current.delete(send);
    if (current.size === 0) sockets.delete(playerId);
  };
}

// The wire message a subscribed client receives when their match is ready.
export function matchFoundMessage(sessionId: string): string {
  return JSON.stringify({ type: "matched", sessionId });
}

// Push an event to this instance's locally-connected sockets. Returns how many
// sockets were notified (0 if the player isn't connected here — expected when
// they're on another instance, where that instance's subscriber handles it).
export function dispatchLocal(event: MatchFoundEvent): number {
  const set = sockets.get(event.playerId);
  if (!set || set.size === 0) return 0;
  const message = matchFoundMessage(event.sessionId);
  for (const send of set) send(message);
  return set.size;
}

// Publish a match-found event to all instances via Redis.
export async function publishMatchFound(event: MatchFoundEvent): Promise<void> {
  await redis.publish(CHANNEL, JSON.stringify(event));
}

// Dedicated subscriber connection: a Redis connection in subscribe mode can't
// also issue normal commands, so this is duplicated from the shared client
// (inheriting its config) rather than reusing it. Started once at boot.
let subscriber: Redis | null = null;

export function startMatchNotifier(onError?: (err: unknown) => void): void {
  if (subscriber) return;
  subscriber = redis.duplicate();
  subscriber.subscribe(CHANNEL).catch((err) => onError?.(err));
  subscriber.on("message", (_channel, message) => {
    try {
      dispatchLocal(JSON.parse(message) as MatchFoundEvent);
    } catch (err) {
      onError?.(err);
    }
  });
}

export async function stopMatchNotifier(): Promise<void> {
  if (!subscriber) return;
  await subscriber.quit();
  subscriber = null;
}

// Exposed for tests to assert/clear registry state without reaching into module
// internals through other means.
export function _clearSocketsForTest(): void {
  sockets.clear();
}

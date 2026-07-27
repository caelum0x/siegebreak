import { BASE_URL } from "./client";
import { getSession } from "../auth/session";

// Builds the matchmaking subscribe URL: the REST base is http(s), the socket is
// ws(s), and the access token rides as a query param because a browser can't
// set an Authorization header on a WebSocket handshake. Pure so it's testable
// without opening a socket.
export function matchSocketUrl(baseUrl: string, token: string): string {
  const wsBase = baseUrl.replace(/^http/, "ws");
  return `${wsBase}/matchmaking/subscribe?token=${encodeURIComponent(token)}`;
}

export interface MatchSocketHandlers {
  /** Called with the allocated session id when the server pushes a match. */
  onMatched: (sessionId: string) => void;
  /** Called if the socket can't be opened or errors; callers fall back to poll. */
  onError?: () => void;
}

// Opens a match subscribe socket and returns a close function. When WebSocket
// isn't available (SSR / jsdom tests) or there's no token, it returns a noop
// closer so callers can always rely on the polling fallback and this never
// throws. The socket is a real-time accelerator, not the source of truth.
export function openMatchSocket(handlers: MatchSocketHandlers): () => void {
  if (typeof WebSocket === "undefined") return () => {};

  const token = getSession()?.accessToken;
  if (!token) return () => {};

  let ws: WebSocket;
  try {
    ws = new WebSocket(matchSocketUrl(BASE_URL, token));
  } catch {
    handlers.onError?.();
    return () => {};
  }

  ws.onmessage = (event: MessageEvent) => {
    try {
      const msg = JSON.parse(String(event.data)) as { type?: string; sessionId?: string };
      if (msg.type === "matched" && typeof msg.sessionId === "string") {
        handlers.onMatched(msg.sessionId);
      }
    } catch {
      // Ignore malformed frames — the poll loop remains the backstop.
    }
  };
  ws.onerror = () => handlers.onError?.();

  return () => {
    try {
      ws.close();
    } catch {
      // Already closing/closed.
    }
  };
}

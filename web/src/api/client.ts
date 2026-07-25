import {
  clearSession,
  getSession,
  setTokens,
} from "../auth/session";
import type {
  AuthTokens,
  Card,
  CreateDeckInput,
  Deck,
  LeaderboardEntry,
  MatchTicket,
  StatusResponse,
  Wallet,
} from "../types";

const DEFAULT_BASE_URL = "http://localhost:8080";

export const BASE_URL: string = (
  import.meta.env.VITE_API_URL ?? DEFAULT_BASE_URL
).replace(/\/$/, "");

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

/** Extracts the backend's `{ error: string }` code when present. */
export function apiErrorCode(value: unknown): string | undefined {
  if (!isApiError(value)) return undefined;
  const body = value.body;
  if (body && typeof body === "object" && "error" in body) {
    const code = (body as { error: unknown }).error;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

interface RequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  auth?: boolean;
}

function buildHeaders(auth: boolean, hasBody: boolean): HeadersInit {
  const headers: Record<string, string> = {};
  if (hasBody) headers["Content-Type"] = "application/json";
  if (auth) {
    const session = getSession();
    if (session?.accessToken) {
      headers["Authorization"] = `Bearer ${session.accessToken}`;
    }
  }
  return headers;
}

function rawFetch(
  path: string,
  method: string,
  body: unknown,
  auth: boolean
): Promise<Response> {
  const hasBody = body !== undefined;
  return fetch(`${BASE_URL}${path}`, {
    method,
    headers: buildHeaders(auth, hasBody),
    body: hasBody ? JSON.stringify(body) : undefined,
  });
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function toResult<T>(res: Response): Promise<T> {
  const body = await parseBody(res);
  if (!res.ok) {
    throw new ApiError(res.status, `Request failed with ${res.status}`, body);
  }
  return body as T;
}

// Attempts a single refresh using the stored refresh token. Uses a bare fetch
// (not the 401-aware path) to avoid any recursion.
async function tryRefresh(): Promise<boolean> {
  const session = getSession();
  if (!session?.refreshToken) return false;
  const res = await rawFetch(
    "/auth/refresh",
    "POST",
    { refreshToken: session.refreshToken },
    false
  );
  if (!res.ok) return false;
  const tokens = (await parseBody(res)) as AuthTokens;
  if (!tokens?.accessToken || !tokens?.refreshToken) return false;
  setTokens(tokens);
  return true;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = false } = options;

  let res = await rawFetch(path, method, body, auth);

  // On a 401 for an authenticated call, attempt exactly one refresh + retry.
  if (res.status === 401 && auth) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      res = await rawFetch(path, method, body, auth);
    }
    if (res.status === 401) {
      clearSession();
    }
  }

  return toResult<T>(res);
}

// ---- Typed endpoint functions -------------------------------------------

export function guestLogin(deviceId: string): Promise<AuthTokens> {
  return request<AuthTokens>("/auth/guest", { method: "POST", body: { deviceId } });
}

export function refresh(refreshToken: string): Promise<AuthTokens> {
  return request<AuthTokens>("/auth/refresh", { method: "POST", body: { refreshToken } });
}

export function getCards(): Promise<Card[]> {
  return request<Card[]>("/cards");
}

export function getDecks(): Promise<Deck[]> {
  return request<Deck[]>("/players/me/decks", { auth: true });
}

export function createDeck(input: CreateDeckInput): Promise<Deck> {
  return request<Deck>("/players/me/decks", { method: "POST", body: input, auth: true });
}

export function getWallet(): Promise<Wallet> {
  return request<Wallet>("/economy/wallet", { auth: true });
}

export function queueMatch(deckId: string): Promise<StatusResponse> {
  return request<StatusResponse>("/matchmaking/queue", {
    method: "POST",
    body: { deckId },
    auth: true,
  });
}

export function getMatchStatus(): Promise<MatchTicket> {
  return request<MatchTicket>("/matchmaking/status", { auth: true });
}

export function cancelMatch(): Promise<StatusResponse> {
  return request<StatusResponse>("/matchmaking/cancel", { method: "POST", auth: true });
}

export function getLeaderboard(seasonId: string): Promise<LeaderboardEntry[]> {
  return request<LeaderboardEntry[]>(`/leaderboard/${encodeURIComponent(seasonId)}`);
}

// Best-effort analytics ingest — never throws, so callers can fire-and-forget.
export async function sendEvent(
  name: string,
  properties?: Record<string, unknown>
): Promise<void> {
  try {
    await rawFetch("/analytics/event", "POST", { name, properties }, false);
  } catch {
    // Swallow: analytics must never break a user flow.
  }
}

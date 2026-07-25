import jwt from "jsonwebtoken";

const ACCESS_TTL = "15m";
const REFRESH_TTL = "30d";

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET is not set");
  return s;
}

export interface AccessPayload {
  playerId: string;
}

export interface RefreshPayload {
  playerId: string;
  tokenVersion: number;
}

export function signAccessToken(playerId: string): string {
  return jwt.sign({ playerId } satisfies AccessPayload, secret(), { expiresIn: ACCESS_TTL });
}

export function signRefreshToken(playerId: string, tokenVersion: number): string {
  return jwt.sign({ playerId, tokenVersion } satisfies RefreshPayload, secret(), {
    expiresIn: REFRESH_TTL,
  });
}

// Throws on invalid/expired token — callers should let it propagate to the
// route's try/catch or Fastify's error handler, not swallow it silently.
export function verifyAccessToken(token: string): AccessPayload {
  return jwt.verify(token, secret()) as AccessPayload;
}

export function verifyRefreshToken(token: string): RefreshPayload {
  return jwt.verify(token, secret()) as RefreshPayload;
}

// Centralised rate-limit configuration. All numbers are env-driven with
// production-safe defaults, and every getter reads process.env at call time
// (not module load) so tests can override limits before buildApp() runs.
//
// NOTE: @fastify/rate-limit defaults to an in-memory store keyed on client IP.
// That is correct for a single instance, but a multi-instance deployment must
// switch to the plugin's Redis store (pass a `redis` client to the global
// registration) so counters are shared across instances; otherwise each
// instance enforces the limit independently and the effective limit multiplies.

const DEFAULT_GLOBAL_MAX = 100;
const DEFAULT_AUTH_MAX = 10;
const DEFAULT_WINDOW = "1 minute";

function timeWindow(): string {
  return process.env.RATE_LIMIT_WINDOW ?? DEFAULT_WINDOW;
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// Global default limit applied to every route unless a route overrides it.
export function globalRateLimit(): { max: number; timeWindow: string } {
  return {
    max: positiveInt(process.env.RATE_LIMIT_MAX, DEFAULT_GLOBAL_MAX),
    timeWindow: timeWindow(),
  };
}

// Stricter per-route override for sensitive endpoints (auth + purchase
// validation) to blunt credential stuffing and receipt-replay abuse. Spread
// into a route's `config` field: `{ config: strictRateLimitConfig() }`.
export function strictRateLimitConfig(): {
  rateLimit: { max: number; timeWindow: string };
} {
  return {
    rateLimit: {
      max: positiveInt(process.env.AUTH_RATE_LIMIT_MAX, DEFAULT_AUTH_MAX),
      timeWindow: timeWindow(),
    },
  };
}

// JSON body returned on a 429; matches the plugin's errorResponseBuilder shape.
export function rateLimitErrorResponse(): { error: string } {
  return { error: "rate_limited" };
}

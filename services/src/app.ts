import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";
import { prisma } from "./lib/prisma";
import { redis } from "./lib/redis";
import { globalRateLimit, rateLimitErrorResponse } from "./lib/rateLimit";
import { authRoutes } from "./modules/auth";
import { profileRoutes } from "./modules/profile";
import { playerRoutes } from "./modules/players";
import { cardsRoutes } from "./modules/cards";
import { matchmakingRoutes } from "./modules/matchmaking";
import { economyRoutes } from "./modules/economy";
import { leaderboardRoutes } from "./modules/leaderboard";
import { matchRoutes } from "./modules/matches";
import { analyticsRoutes } from "./modules/analytics";

// Builds the Fastify instance without binding a port, so tests can drive it
// via app.inject() and index.ts owns the actual listen()/lifecycle. Keeping
// construction and startup separate is what makes the routes testable.
export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" });

  // Browser clients (the web frontend) are a different origin from the API, so
  // CORS is required. Bearer tokens are used (not cookies), so credentials stay
  // off. Allowed origins come from CORS_ORIGINS (comma-separated); unset means
  // reflect any origin, which is fine for local dev but should be pinned in prod.
  const configured = process.env.CORS_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean);
  app.register(cors, { origin: configured && configured.length > 0 ? configured : true });

  // Global default rate limit. Registered before the route modules so its
  // onRoute hook sees every route (and honours per-route `config.rateLimit`
  // overrides set on the sensitive auth/economy endpoints). Numbers are
  // env-driven (RATE_LIMIT_MAX / RATE_LIMIT_WINDOW); see lib/rateLimit.ts for
  // the multi-instance (Redis store) caveat — in-memory is fine for now.
  const { max, timeWindow } = globalRateLimit();
  app.register(rateLimit, {
    global: true,
    max,
    timeWindow,
    // The plugin THROWS whatever this returns, which then flows through the
    // shared error handler below. Return an Error carrying the 429 status so
    // the handler can emit the JSON body ({ error: "rate_limited" }) with the
    // right code rather than masking it as a 500.
    errorResponseBuilder: (_req, ctx) => {
      const err = new Error("rate_limited") as Error & { statusCode?: number };
      err.statusCode = ctx.ban ? 403 : 429;
      return err;
    },
  });

  // Liveness probe: process is up and serving. Deliberately checks no
  // dependencies so an orchestrator won't kill a pod during a transient DB or
  // Redis blip — that is the readiness probe's job (GET /ready) below.
  app.get("/health", async () => ({ status: "ok" }));

  // Readiness probe: only report ready when BOTH backing stores answer, so load
  // balancers stop routing traffic to an instance that can't serve real work.
  app.get("/ready", async (_req, reply) => {
    const checks = { postgres: false, redis: false };

    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.postgres = true;
    } catch (err) {
      app.log.error(err, "readiness: postgres check failed");
    }

    try {
      await redis.ping();
      checks.redis = true;
    } catch (err) {
      app.log.error(err, "readiness: redis check failed");
    }

    if (checks.postgres && checks.redis) {
      return reply.code(200).send({ status: "ready" });
    }
    return reply.code(503).send({ status: "not_ready", checks });
  });

  app.register(authRoutes);
  app.register(profileRoutes);
  app.register(playerRoutes);
  app.register(cardsRoutes);
  app.register(matchmakingRoutes);
  app.register(economyRoutes);
  app.register(leaderboardRoutes);
  app.register(matchRoutes);
  app.register(analyticsRoutes);

  app.setErrorHandler((err, req, reply) => {
    req.log.error(err);
    // Zod parse failures thrown inside handlers surface here — without this
    // branch they'd fall through to a 500, hiding a plain bad-request from
    // the client. Fastify's own schema validation sets `.validation` instead.
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: "validation_failed", issues: err.issues });
    }
    if ((err as { validation?: unknown }).validation) {
      return reply.code(400).send({ error: "validation_failed" });
    }
    // @fastify/rate-limit throws a 429 error that would otherwise be masked as
    // a 500 here; honour its status and the errorResponseBuilder body instead.
    if ((err as { statusCode?: number }).statusCode === 429) {
      return reply.code(429).send(rateLimitErrorResponse());
    }
    return reply.code(500).send({ error: "internal_error" });
  });

  return app;
}

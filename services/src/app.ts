import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { ZodError } from "zod";
import { authRoutes } from "./modules/auth";
import { profileRoutes } from "./modules/profile";
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

  app.get("/health", async () => ({ status: "ok" }));

  app.register(authRoutes);
  app.register(profileRoutes);
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
    return reply.code(500).send({ error: "internal_error" });
  });

  return app;
}

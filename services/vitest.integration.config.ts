import { defineConfig } from "vitest/config";

// Integration tests run against REAL Postgres + Redis (no mocks). They are kept
// in test-integration/ and excluded from the default `npm test` unit run, which
// mocks those dependencies. Requires a running DB/Redis — see docker-compose.yml
// or the DATABASE_URL/REDIS_URL below.
export default defineConfig({
  test: {
    environment: "node",
    include: ["test-integration/**/*.test.ts"],
    // A single DB is shared, so run serially to keep truncation deterministic.
    fileParallelism: false,
    sequence: { concurrent: false },
    hookTimeout: 30_000,
    testTimeout: 30_000,
    env: {
      NODE_ENV: "test",
      JWT_SECRET: "integration-secret",
      MATCH_SERVER_SECRET: "integration-server-secret",
      // Keep the IP-keyed rate limiter effectively unlimited: the flows drive
      // many /auth/* calls from one inject IP within a single window, which the
      // default limits would otherwise trip.
      RATE_LIMIT_MAX: "100000",
      AUTH_RATE_LIMIT_MAX: "100000",
      DATABASE_URL:
        process.env.DATABASE_URL ?? "postgresql://postgres@localhost:5433/siegebreak_test",
      // Dedicated Redis logical DB (15) so flushdb never touches other data.
      REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379/15",
    },
  },
});

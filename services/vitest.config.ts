import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Set before any module import so lib/redis (which throws if REDIS_URL is
    // unset) and lib/jwt (needs JWT_SECRET) load cleanly. Redis is lazyConnect,
    // so this URL is never actually dialed unless a test drives a Redis path.
    env: {
      NODE_ENV: "test",
      JWT_SECRET: "test-secret-do-not-use-in-prod",
      REDIS_URL: "redis://localhost:6379",
      // The in-memory rate limiter keys on IP and app.inject reuses one IP, so
      // low limits would trip the existing suites. Keep the global + auth
      // limits effectively unlimited here; the dedicated rate-limit test
      // overrides AUTH_RATE_LIMIT_MAX to a small value before its own buildApp().
      RATE_LIMIT_MAX: "100000",
      AUTH_RATE_LIMIT_MAX: "100000",
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // Entry point and IO-only glue aren't unit-tested here; the route +
      // logic modules are what the suite actually exercises.
      exclude: ["src/index.ts", "src/db/**", "src/lib/prisma.ts", "src/lib/redis.ts"],
    },
  },
});

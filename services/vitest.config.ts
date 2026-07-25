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

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";

let app: FastifyInstance;

beforeAll(async () => {
  app = buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("GET /health", () => {
  it("reports ok", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });
});

describe("CORS", () => {
  it("reflects the request origin so browser clients can call the API", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "http://localhost:5173" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });

  it("answers CORS preflight for a protected route", async () => {
    const res = await app.inject({
      method: "OPTIONS",
      url: "/players/me/decks",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "POST",
      },
    });
    expect(res.statusCode).toBeLessThan(300);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });
});

describe("POST /analytics/event", () => {
  it("accepts a well-formed event with 202", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/analytics/event",
      payload: { name: "match_started", properties: { region: "eu" } },
    });
    expect(res.statusCode).toBe(202);
  });

  it("accepts an event with no properties", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/analytics/event",
      payload: { name: "app_open" },
    });
    expect(res.statusCode).toBe(202);
  });

  it("rejects a body missing the required name with 400 (Zod error mapped, not 500)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/analytics/event",
      payload: { properties: { region: "eu" } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("validation_failed");
  });
});

describe("auth on protected routes", () => {
  it("rejects a request with no bearer token", async () => {
    const res = await app.inject({ method: "GET", url: "/players/me/decks" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("missing_token");
  });

  it("rejects a malformed bearer token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/players/me/decks",
      headers: { authorization: "Bearer not-a-real-jwt" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("invalid_token");
  });
});

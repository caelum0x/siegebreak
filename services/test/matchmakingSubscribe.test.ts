import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { tokenFromQuery } from "../src/modules/matchmaking";

describe("tokenFromQuery", () => {
  it("extracts a non-empty token from the query object", () => {
    expect(tokenFromQuery({ token: "abc" })).toBe("abc");
  });

  it("returns null when the token is missing, empty, or wrong-typed", () => {
    expect(tokenFromQuery({})).toBeNull();
    expect(tokenFromQuery({ token: "" })).toBeNull();
    expect(tokenFromQuery({ token: 123 })).toBeNull();
    expect(tokenFromQuery(null)).toBeNull();
    expect(tokenFromQuery(undefined)).toBeNull();
  });
});

describe("WebSocket route registration", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // The @fastify/websocket plugin is registered and the subscribe route builds
  // without error. A plain HTTP GET (no Upgrade header) to a websocket route is
  // rejected by the plugin, which is the correct guard for non-WS callers.
  it("builds the app with the subscribe route and rejects a non-upgrade GET", async () => {
    const res = await app.inject({ method: "GET", url: "/matchmaking/subscribe" });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
});

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";

// Mock the identity providers (so no jose/JWKS) and Prisma (so no DB). The link
// route's own logic — rebind-in-place, conflict handling — is what's under test.
const { verifyGoogleToken, verifyAppleToken } = vi.hoisted(() => ({
  verifyGoogleToken: vi.fn(),
  verifyAppleToken: vi.fn(),
}));
vi.mock("../src/modules/auth/providers", () => ({ verifyGoogleToken, verifyAppleToken }));

const { player } = vi.hoisted(() => ({
  player: { findUnique: vi.fn(), update: vi.fn() },
}));
vi.mock("../src/lib/prisma", () => ({ prisma: { player } }));

import { buildApp } from "../src/app";
import { signAccessToken } from "../src/lib/jwt";

let app: FastifyInstance;
const auth = { authorization: `Bearer ${signAccessToken("guest-1")}` };

beforeAll(async () => {
  app = buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  verifyGoogleToken.mockReset();
  verifyAppleToken.mockReset();
  player.findUnique.mockReset();
  player.update.mockReset();
});

describe("POST /auth/link", () => {
  it("requires authentication", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/link",
      payload: { provider: "google", token: "tok" },
    });
    expect(res.statusCode).toBe(401);
    expect(verifyGoogleToken).not.toHaveBeenCalled();
  });

  it("rebinds the caller's guest account to the verified identity in place", async () => {
    verifyGoogleToken.mockResolvedValue({ provider: "google", providerId: "g-abc" });
    player.findUnique.mockResolvedValue(null); // identity not yet claimed
    player.update.mockResolvedValue({ id: "guest-1", tokenVersion: 0 });

    const res = await app.inject({
      method: "POST",
      url: "/auth/link",
      headers: auth,
      payload: { provider: "google", token: "tok" },
    });

    expect(res.statusCode).toBe(200);
    const bodyJson = res.json();
    expect(bodyJson.status).toBe("linked");
    expect(bodyJson.accessToken).toBeTruthy();
    // Crucially updates the SAME player row, not a new one.
    expect(player.update).toHaveBeenCalledWith({
      where: { id: "guest-1" },
      data: { authProvider: "google", authProviderId: "g-abc" },
    });
  });

  it("refuses to link an identity already owned by another player", async () => {
    verifyGoogleToken.mockResolvedValue({ provider: "google", providerId: "g-abc" });
    player.findUnique.mockResolvedValue({ id: "someone-else" });

    const res = await app.inject({
      method: "POST",
      url: "/auth/link",
      headers: auth,
      payload: { provider: "google", token: "tok" },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("identity_already_linked");
    expect(player.update).not.toHaveBeenCalled();
  });

  it("is a no-op when the identity is already the caller's own", async () => {
    verifyGoogleToken.mockResolvedValue({ provider: "google", providerId: "g-abc" });
    player.findUnique.mockResolvedValue({ id: "guest-1" });

    const res = await app.inject({
      method: "POST",
      url: "/auth/link",
      headers: auth,
      payload: { provider: "google", token: "tok" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("already_linked");
    expect(player.update).not.toHaveBeenCalled();
  });
});

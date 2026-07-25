import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock jose so verification logic (claim mapping, env + sub checks) is tested
// without network JWKS fetches or real signing keys.
const { jwtVerify } = vi.hoisted(() => ({ jwtVerify: vi.fn() }));
vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => vi.fn()),
  jwtVerify,
}));

import { verifyAppleToken, verifyGoogleToken } from "../src/modules/auth/providers";

const originalEnv = { ...process.env };

beforeEach(() => {
  jwtVerify.mockReset();
  process.env.APPLE_CLIENT_ID = "com.siegebreak.app";
  process.env.GOOGLE_CLIENT_ID = "google-client-id.apps.googleusercontent.com";
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("verifyGoogleToken", () => {
  it("maps the verified sub claim to a google identity", async () => {
    jwtVerify.mockResolvedValue({ payload: { sub: "g-123", aud: "google-client-id.apps.googleusercontent.com" } });
    await expect(verifyGoogleToken("tok")).resolves.toEqual({ provider: "google", providerId: "g-123" });
  });

  it("passes issuer and audience to jose for validation", async () => {
    jwtVerify.mockResolvedValue({ payload: { sub: "g-123" } });
    await verifyGoogleToken("tok");
    const opts = jwtVerify.mock.calls[0][2];
    expect(opts.audience).toBe("google-client-id.apps.googleusercontent.com");
    expect(opts.issuer).toContain("https://accounts.google.com");
  });

  it("throws when GOOGLE_CLIENT_ID is not configured", async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    await expect(verifyGoogleToken("tok")).rejects.toThrow(/GOOGLE_CLIENT_ID/);
    expect(jwtVerify).not.toHaveBeenCalled();
  });

  it("rejects a token whose payload has no sub", async () => {
    jwtVerify.mockResolvedValue({ payload: { aud: "x" } });
    await expect(verifyGoogleToken("tok")).rejects.toThrow(/sub/);
  });

  it("propagates a signature/verification failure from jose", async () => {
    jwtVerify.mockRejectedValue(new Error("signature verification failed"));
    await expect(verifyGoogleToken("tok")).rejects.toThrow(/signature/);
  });
});

describe("verifyAppleToken", () => {
  it("maps the verified sub claim to an apple identity with the right issuer/aud", async () => {
    jwtVerify.mockResolvedValue({ payload: { sub: "a-999" } });
    await expect(verifyAppleToken("tok")).resolves.toEqual({ provider: "apple", providerId: "a-999" });
    const opts = jwtVerify.mock.calls[0][2];
    expect(opts.issuer).toBe("https://appleid.apple.com");
    expect(opts.audience).toBe("com.siegebreak.app");
  });

  it("throws when APPLE_CLIENT_ID is not configured", async () => {
    delete process.env.APPLE_CLIENT_ID;
    await expect(verifyAppleToken("tok")).rejects.toThrow(/APPLE_CLIENT_ID/);
  });
});

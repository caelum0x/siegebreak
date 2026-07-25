import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "../src/lib/jwt";

describe("jwt", () => {
  it("round-trips an access token, preserving the playerId", () => {
    const token = signAccessToken("player-123");
    expect(verifyAccessToken(token).playerId).toBe("player-123");
  });

  it("round-trips a refresh token, preserving playerId and tokenVersion", () => {
    const token = signRefreshToken("player-123", 7);
    const payload = verifyRefreshToken(token);
    expect(payload.playerId).toBe("player-123");
    expect(payload.tokenVersion).toBe(7);
  });

  it("rejects a token signed with a different secret", () => {
    const forged = jwt.sign({ playerId: "attacker" }, "wrong-secret");
    expect(() => verifyAccessToken(forged)).toThrow();
  });

  it("rejects a tampered token", () => {
    const token = signAccessToken("player-123");
    const tampered = token.slice(0, -4) + "aaaa";
    expect(() => verifyAccessToken(tampered)).toThrow();
  });

  it("rejects an expired token", () => {
    const expired = jwt.sign({ playerId: "player-123" }, "test-secret-do-not-use-in-prod", {
      expiresIn: "-1s",
    });
    expect(() => verifyAccessToken(expired)).toThrow();
  });
});

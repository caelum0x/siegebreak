import { describe, it, expect } from "vitest";
import { matchSocketUrl, openMatchSocket } from "./matchSocket";

describe("matchSocketUrl", () => {
  it("converts an http base to ws and appends the encoded token", () => {
    expect(matchSocketUrl("http://localhost:8080", "a b")).toBe(
      "ws://localhost:8080/matchmaking/subscribe?token=a%20b"
    );
  });

  it("converts an https base to wss", () => {
    expect(matchSocketUrl("https://api.example.com", "tok")).toBe(
      "wss://api.example.com/matchmaking/subscribe?token=tok"
    );
  });
});

describe("openMatchSocket", () => {
  it("returns a noop closer (and never throws) where WebSocket is unavailable", () => {
    // jsdom provides no WebSocket, exercising the polling-fallback path.
    const close = openMatchSocket({ onMatched: () => undefined });
    expect(typeof close).toBe("function");
    expect(() => close()).not.toThrow();
  });
});

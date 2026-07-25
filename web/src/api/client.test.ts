import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getWallet, isApiError } from "./client";
import { clearSession, getSession, setTokens } from "../auth/session";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body === undefined ? "" : JSON.stringify(body)),
  } as unknown as Response;
}

function lastInit(mock: ReturnType<typeof vi.fn>, callIndex: number): RequestInit {
  return mock.mock.calls[callIndex][1] as RequestInit;
}

function authHeader(init: RequestInit): string | undefined {
  return (init.headers as Record<string, string>)["Authorization"];
}

describe("api client", () => {
  beforeEach(() => {
    clearSession();
    setTokens({ accessToken: "access-1", refreshToken: "refresh-1" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("attaches the bearer access token to authenticated requests", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { playerId: "p1", gold: 5, gems: 2 }));
    vi.stubGlobal("fetch", fetchMock);

    const wallet = await getWallet();

    expect(wallet.gold).toBe(5);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(authHeader(lastInit(fetchMock, 0))).toBe("Bearer access-1");
  });

  it("refreshes once and retries on a 401", async () => {
    const fetchMock = vi
      .fn()
      // 1) original request -> 401
      .mockResolvedValueOnce(jsonResponse(401, { error: "unauthorized" }))
      // 2) refresh -> new tokens
      .mockResolvedValueOnce(
        jsonResponse(200, { accessToken: "access-2", refreshToken: "refresh-2" })
      )
      // 3) retry with the fresh token -> success
      .mockResolvedValueOnce(jsonResponse(200, { playerId: "p1", gold: 9, gems: 0 }));
    vi.stubGlobal("fetch", fetchMock);

    const wallet = await getWallet();

    expect(wallet.gold).toBe(9);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // Refresh call carried the stored refresh token.
    const refreshInit = lastInit(fetchMock, 1);
    expect(JSON.parse(String(refreshInit.body))).toEqual({ refreshToken: "refresh-1" });

    // Retry used the newly issued access token.
    expect(authHeader(lastInit(fetchMock, 2))).toBe("Bearer access-2");

    // Session now holds the rotated tokens.
    expect(getSession()).toEqual({ accessToken: "access-2", refreshToken: "refresh-2" });
  });

  it("clears the session when the refresh fails", async () => {
    const fetchMock = vi
      .fn()
      // 1) original request -> 401
      .mockResolvedValueOnce(jsonResponse(401, { error: "unauthorized" }))
      // 2) refresh -> 401 (invalid refresh token)
      .mockResolvedValueOnce(jsonResponse(401, { error: "invalid_refresh_token" }));
    vi.stubGlobal("fetch", fetchMock);

    let caught: unknown;
    try {
      await getWallet();
    } catch (err) {
      caught = err;
    }

    expect(isApiError(caught)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getSession()).toBeNull();
  });
});

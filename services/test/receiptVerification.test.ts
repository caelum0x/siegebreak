import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mint is mocked so the Google path can be tested without real service-account
// key material or a token exchange.
const { mintGoogleAccessToken } = vi.hoisted(() => ({
  mintGoogleAccessToken: vi.fn(),
}));
vi.mock("../src/modules/economy/googleAuth", () => ({ mintGoogleAccessToken }));

import { verifyReceipt } from "../src/modules/economy/receiptVerification";

const originalEnv = { ...process.env };

function mockFetchOnce(status: number, json: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => json,
    })
  );
}

beforeEach(() => {
  mintGoogleAccessToken.mockReset().mockResolvedValue("ya29.test-token");
  delete process.env.IAP_MODE;
  delete process.env.APPLE_SHARED_SECRET;
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...originalEnv };
});

describe("verifyReceipt — dev mode", () => {
  beforeEach(() => {
    process.env.IAP_MODE = "dev";
  });

  it("grants gems for a well-formed dev receipt of a known product", async () => {
    const result = await verifyReceipt("ios", "dev:gems_medium");
    expect(result).toEqual({ valid: true, productId: "gems_medium", gemsGranted: 550 });
  });

  it("rejects a dev receipt for an unknown product", async () => {
    const result = await verifyReceipt("android", "dev:gems_free");
    expect(result.valid).toBe(false);
    expect(result.gemsGranted).toBe(0);
  });

  it("rejects a malformed dev receipt", async () => {
    expect((await verifyReceipt("ios", "not-a-dev-receipt")).valid).toBe(false);
  });
});

describe("verifyReceipt — Apple", () => {
  it("grants gems from the newest verified in_app product", async () => {
    mockFetchOnce(200, {
      status: 0,
      receipt: {
        in_app: [
          { product_id: "gems_small", purchase_date_ms: "1000" },
          { product_id: "gems_large", purchase_date_ms: "2000" },
        ],
      },
    });

    const result = await verifyReceipt("ios", "base64-receipt");
    expect(result).toEqual({ valid: true, productId: "gems_large", gemsGranted: 1200 });
  });

  it("retries against sandbox on status 21007 then grants", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ status: 21007 }) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          status: 0,
          receipt: { in_app: [{ product_id: "gems_small", purchase_date_ms: "1" }] },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyReceipt("ios", "sandbox-receipt");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain("sandbox");
    expect(result).toEqual({ valid: true, productId: "gems_small", gemsGranted: 100 });
  });

  it("rejects a receipt Apple reports as invalid (non-zero status)", async () => {
    mockFetchOnce(200, { status: 21002 });
    expect((await verifyReceipt("ios", "bad")).valid).toBe(false);
  });

  it("rejects when the verified product is not in the catalog", async () => {
    mockFetchOnce(200, {
      status: 0,
      receipt: { in_app: [{ product_id: "gems_phantom", purchase_date_ms: "1" }] },
    });
    expect((await verifyReceipt("ios", "r")).valid).toBe(false);
  });
});

describe("verifyReceipt — Google", () => {
  const receipt = JSON.stringify({
    packageName: "com.siegebreak.app",
    productId: "gems_large",
    purchaseToken: "tok-123",
  });

  it("mints a token, calls the Play API, and grants on purchaseState 0", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ purchaseState: 0 }) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyReceipt("android", receipt);

    expect(mintGoogleAccessToken).toHaveBeenCalled();
    // The Play Developer API URL carries the receipt fields, and the minted
    // token rides in the Authorization header.
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("com.siegebreak.app");
    expect(url).toContain("gems_large");
    expect(url).toContain("tok-123");
    expect(init.headers.Authorization).toBe("Bearer ya29.test-token");
    expect(result).toEqual({ valid: true, productId: "gems_large", gemsGranted: 1200 });
  });

  it("rejects a canceled purchase (purchaseState 1)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ purchaseState: 1 }) })
    );
    expect((await verifyReceipt("android", receipt)).valid).toBe(false);
  });

  it("rejects a malformed android receipt without calling the store", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await verifyReceipt("android", "{not-json");
    expect(result.valid).toBe(false);
    expect(mintGoogleAccessToken).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

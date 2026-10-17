import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";

// Mock Prisma (purchase audit row + wallet grant, in a transaction). Redis is
// untouched by the economy routes but app.ts pulls it in transitively, so it's
// left to the vitest env's lazyConnect URL.
const { purchase, wallet, $transaction } = vi.hoisted(() => ({
  purchase: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
  wallet: { findUnique: vi.fn(), upsert: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("../src/lib/prisma", () => ({ prisma: { purchase, wallet, $transaction } }));

import { buildApp } from "../src/app";
import { signAccessToken } from "../src/lib/jwt";

let app: FastifyInstance;
const auth = { authorization: `Bearer ${signAccessToken("buyer")}` };
const originalEnv = { ...process.env };

beforeAll(async () => {
  app = buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  purchase.create.mockReset().mockResolvedValue({ id: "purchase-1" });
  purchase.update.mockReset();
  purchase.findFirst.mockReset().mockResolvedValue(null);
  wallet.findUnique.mockReset();
  wallet.upsert.mockReset();
  $transaction.mockReset().mockResolvedValue([]);
  process.env.IAP_MODE = "dev"; // exercise the full flow without store creds
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("GET /economy/products", () => {
  it("exposes the server-side catalog", async () => {
    const res = await app.inject({ method: "GET", url: "/economy/products" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toContainEqual({ productId: "gems_small", gems: 100 });
  });
});

describe("POST /economy/purchase/validate", () => {
  it("grants gems for a valid (dev) receipt and records the purchase", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/economy/purchase/validate",
      headers: auth,
      payload: { platform: "ios", receipt: "dev:gems_large" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      status: "granted",
      productId: "gems_large",
      gemsGranted: 1200,
    });

    // Audit row created before verification, then finalised in the txn.
    expect(purchase.create).toHaveBeenCalled();
    expect($transaction).toHaveBeenCalledTimes(1);
    // Wallet is upserted (not update) so a first-purchase player still gets gems.
    expect(wallet.upsert).toHaveBeenCalledWith({
      where: { playerId: "buyer" },
      create: { playerId: "buyer", gems: 1200 },
      update: { gems: { increment: 1200 } },
    });
  });

  it("does not re-grant gems when the same already-granted receipt is resubmitted", async () => {
    purchase.findFirst.mockResolvedValue({
      id: "purchase-1",
      productId: "gems_large",
      granted: true,
    });

    const res = await app.inject({
      method: "POST",
      url: "/economy/purchase/validate",
      headers: auth,
      payload: { platform: "ios", receipt: "dev:gems_large" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      status: "granted",
      productId: "gems_large",
      gemsGranted: 0,
      duplicate: true,
    });
    // No new audit row, no verification, and critically: no second grant.
    expect(purchase.create).not.toHaveBeenCalled();
    expect($transaction).not.toHaveBeenCalled();
    expect(wallet.upsert).not.toHaveBeenCalled();
  });

  it("returns 402 for a receipt that fails verification and grants nothing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/economy/purchase/validate",
      headers: auth,
      payload: { platform: "android", receipt: "dev:gems_free" },
    });

    expect(res.statusCode).toBe(402);
    expect(res.json().error).toBe("receipt_invalid");
    expect($transaction).not.toHaveBeenCalled();
  });

  it("rejects a body missing platform with 400 (Zod)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/economy/purchase/validate",
      headers: auth,
      payload: { receipt: "dev:gems_small" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("validation_failed");
  });

  it("requires authentication", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/economy/purchase/validate",
      payload: { platform: "ios", receipt: "dev:gems_small" },
    });
    expect(res.statusCode).toBe(401);
  });
});

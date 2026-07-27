import { z } from "zod";
import { gemsForProduct } from "./products";
import { mintGoogleAccessToken } from "./googleAuth";

export interface ReceiptResult {
  valid: boolean;
  productId: string;
  gemsGranted: number;
}

// IMPORTANT: productId is taken from the *verified* store response, and
// gemsGranted is looked up from the server-side catalog (./products) — never
// from a client-supplied field. A modified client therefore can't claim
// "gems_large" while paying for "gems_small": whatever product the store
// confirms is what's granted, and an unknown product grants nothing.

const APPLE_PROD_URL = "https://buy.itunes.apple.com/verifyReceipt";
const APPLE_SANDBOX_URL = "https://sandbox.itunes.apple.com/verifyReceipt";
// Apple status 21007: a sandbox receipt was sent to the prod endpoint. The
// documented handling is to retry against the sandbox endpoint.
const APPLE_STATUS_OK = 0;
const APPLE_STATUS_SANDBOX = 21007;

const INVALID: ReceiptResult = { valid: false, productId: "", gemsGranted: 0 };

// Grant helper: resolves gems for a store-confirmed product from the catalog.
// Unknown product -> invalid (no currency), not a zero-gem "success".
function grantFor(productId: string): ReceiptResult {
  const gems = gemsForProduct(productId);
  if (gems === null) return INVALID;
  return { valid: true, productId, gemsGranted: gems };
}

function isDevMode(): boolean {
  return process.env.IAP_MODE === "dev";
}

// Dev/sandbox provider so the full purchase flow works locally without store
// credentials. Accepts receipts of the form "dev:<productId>" and grants from
// the same catalog the real providers use. Guarded behind IAP_MODE=dev so it
// can never be active in production.
function verifyDevReceipt(receipt: string): ReceiptResult {
  const match = /^dev:(.+)$/.exec(receipt.trim());
  if (!match) return INVALID;
  return grantFor(match[1]);
}

// ---- Apple App Store ------------------------------------------------------

interface AppleVerifyResponse {
  status: number;
  receipt?: { in_app?: { product_id?: string; purchase_date_ms?: string }[] };
  latest_receipt_info?: { product_id?: string; purchase_date_ms?: string }[];
}

async function postAppleReceipt(url: string, body: string): Promise<AppleVerifyResponse> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  if (!res.ok) throw new Error(`apple verifyReceipt failed with ${res.status}`);
  return (await res.json()) as AppleVerifyResponse;
}

// Pick the most recent purchased product id from the verified payload. Consumables
// land in receipt.in_app; auto-renewables surface in latest_receipt_info. Prefer
// the latter when present, else the former, taking the newest by purchase date.
function extractAppleProductId(data: AppleVerifyResponse): string | null {
  const items = data.latest_receipt_info?.length
    ? data.latest_receipt_info
    : data.receipt?.in_app ?? [];
  if (items.length === 0) return null;

  const newest = [...items].sort(
    (a, b) => Number(b.purchase_date_ms ?? 0) - Number(a.purchase_date_ms ?? 0)
  )[0];
  return newest.product_id ?? null;
}

async function verifyApple(receipt: string): Promise<ReceiptResult> {
  const payload = JSON.stringify({
    "receipt-data": receipt,
    // Shared secret is required for auto-renewables; optional for consumables.
    ...(process.env.APPLE_SHARED_SECRET
      ? { password: process.env.APPLE_SHARED_SECRET }
      : {}),
  });

  let data = await postAppleReceipt(APPLE_PROD_URL, payload);
  if (data.status === APPLE_STATUS_SANDBOX) {
    data = await postAppleReceipt(APPLE_SANDBOX_URL, payload);
  }
  if (data.status !== APPLE_STATUS_OK) return INVALID;

  const productId = extractAppleProductId(data);
  if (!productId) return INVALID;
  return grantFor(productId);
}

// ---- Google Play ----------------------------------------------------------

// Android receipts carry the fields the Play Developer API needs, JSON-encoded
// into the single `receipt` string so the request contract stays { platform,
// receipt } for both platforms.
const googleReceiptSchema = z.object({
  packageName: z.string().min(1),
  productId: z.string().min(1),
  purchaseToken: z.string().min(1),
});

interface GoogleProductPurchase {
  // 0 = purchased, 1 = canceled.
  purchaseState?: number;
}

function parseGoogleReceipt(receipt: string): z.infer<typeof googleReceiptSchema> | null {
  let json: unknown;
  try {
    json = JSON.parse(receipt);
  } catch {
    return null;
  }
  const parsed = googleReceiptSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

async function verifyGoogle(receipt: string): Promise<ReceiptResult> {
  const fields = parseGoogleReceipt(receipt);
  if (!fields) return INVALID;

  const token = await mintGoogleAccessToken();
  const url =
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
    `${encodeURIComponent(fields.packageName)}/purchases/products/` +
    `${encodeURIComponent(fields.productId)}/tokens/${encodeURIComponent(fields.purchaseToken)}`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`google purchases.get failed with ${res.status}`);

  const data = (await res.json()) as GoogleProductPurchase;
  // Only a confirmed purchase (state 0) grants currency.
  if (data.purchaseState !== 0) return INVALID;

  // Grant against the product id from the receipt, which the API call just
  // proved corresponds to a real purchase for this package.
  return grantFor(fields.productId);
}

// ---- Entry point ----------------------------------------------------------

export async function verifyReceipt(
  platform: "ios" | "android",
  receipt: string
): Promise<ReceiptResult> {
  if (isDevMode()) return verifyDevReceipt(receipt);
  return platform === "ios" ? verifyApple(receipt) : verifyGoogle(receipt);
}

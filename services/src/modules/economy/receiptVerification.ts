export interface ReceiptResult {
  valid: boolean;
  productId: string;
  gemsGranted: number;
}

// IMPORTANT: productId and gemsGranted must come from the *verified*
// receipt response, never from a client-supplied field in the request
// body — otherwise a modified client could claim "gems_large" while
// actually paying for "gems_small". The route in ./index.ts is written
// with that constraint already in mind.
export async function verifyReceipt(
  platform: "ios" | "android",
  receipt: string
): Promise<ReceiptResult> {
  // platform === "ios"     -> Apple App Store Server API
  // platform === "android" -> Google Play Developer API
  // Both need server credentials that don't belong in this repo.
  throw new Error("verifyReceipt not implemented — wire up Apple/Google server APIs before enabling purchases");
}

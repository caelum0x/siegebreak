import { importPKCS8, SignJWT } from "jose";

// Mints a Google OAuth2 access token for the Android Publisher API using a
// service-account key (the JWT-bearer grant flow). This is the real handshake
// Google requires to call purchases.products.get:
//   1. sign a JWT assertion with the service account's private key (RS256),
//   2. exchange it at the token endpoint for a short-lived access token.
// The service-account JSON is provided via GOOGLE_SERVICE_ACCOUNT_JSON so no
// key material lives in the repo.

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GRANT_TYPE = "urn:ietf:params:oauth:grant-type:jwt-bearer";
// Read-only scope is sufficient for verifying a purchase.
const SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const ASSERTION_TTL_SECONDS = 3600;

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

function loadServiceAccount(): ServiceAccount {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON is not set — cannot verify Google Play purchases"
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON");
  }
  const sa = parsed as Partial<ServiceAccount>;
  if (!sa.client_email || !sa.private_key) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON missing client_email/private_key");
  }
  return { client_email: sa.client_email, private_key: sa.private_key };
}

// Builds and signs the JWT assertion. `nowSeconds` is injected so the timing is
// deterministic under test; production passes the real clock.
async function buildAssertion(sa: ServiceAccount, nowSeconds: number): Promise<string> {
  const key = await importPKCS8(sa.private_key, "RS256");
  return new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience(TOKEN_URL)
    .setIssuedAt(nowSeconds)
    .setExpirationTime(nowSeconds + ASSERTION_TTL_SECONDS)
    .sign(key);
}

// Returns a bearer access token. Not cached: purchase verification is
// low-frequency and each mint is cheap relative to the store round-trip that
// follows; add a short-lived cache here if volume ever warrants it.
export async function mintGoogleAccessToken(): Promise<string> {
  const sa = loadServiceAccount();
  const nowSeconds = Math.floor(Date.now() / 1000);
  const assertion = await buildAssertion(sa, nowSeconds);

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: GRANT_TYPE, assertion }).toString(),
  });

  if (!res.ok) {
    throw new Error(`google token exchange failed with ${res.status}`);
  }

  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("google token exchange returned no access_token");
  }
  return data.access_token;
}

import { createRemoteJWKSet, jwtVerify, JWTPayload } from "jose";

export interface VerifiedIdentity {
  provider: "apple" | "google";
  providerId: string;
}

// Remote JWK sets — jose fetches and caches the signing keys lazily on first
// use and refreshes them on rotation, so constructing these at module load is
// cheap and does no network I/O until a token is actually verified.
const appleJwks = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));
const googleJwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set — cannot verify identity tokens`);
  return value;
}

// The `sub` claim is the stable, provider-scoped user id we bind accounts to.
// Everything else (email, name) is mutable and must not be used as identity.
function subjectOf(payload: JWTPayload): string {
  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    throw new Error("identity token missing sub claim");
  }
  return payload.sub;
}

// Verifies signature against Apple's JWKS and checks iss + aud. `aud` must be
// this app's bundle id / service id (APPLE_CLIENT_ID); without that check a
// token minted for a different app would be accepted.
export async function verifyAppleToken(identityToken: string): Promise<VerifiedIdentity> {
  const audience = requireEnv("APPLE_CLIENT_ID");
  const { payload } = await jwtVerify(identityToken, appleJwks, {
    issuer: "https://appleid.apple.com",
    audience,
  });
  return { provider: "apple", providerId: subjectOf(payload) };
}

// Verifies signature against Google's JWKS and checks iss + aud. Google issues
// the id token with either issuer form, so both are accepted.
export async function verifyGoogleToken(idToken: string): Promise<VerifiedIdentity> {
  const audience = requireEnv("GOOGLE_CLIENT_ID");
  const { payload } = await jwtVerify(idToken, googleJwks, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience,
  });
  return { provider: "google", providerId: subjectOf(payload) };
}

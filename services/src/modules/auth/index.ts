import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../../lib/jwt";
import { strictRateLimitConfig } from "../../lib/rateLimit";
import { verifyAppleToken, verifyGoogleToken, VerifiedIdentity } from "./providers";
import { STARTER_CARD_IDS } from "../../lib/cardProgression";

const guestSchema = z.object({ deviceId: z.string().min(8) });
const linkSchema = z.object({
  provider: z.enum(["apple", "google"]),
  token: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance) {
  // Device-bound guest account — the standard F2P entry point. Upgrading a
  // guest to Apple/Google later should re-bind authProviderId on the same
  // Player row rather than creating a second one; that flow isn't built
  // yet, flagging it so it doesn't get lost.
  app.post("/auth/guest", { config: strictRateLimitConfig() }, async (req, reply) => {
    const { deviceId } = guestSchema.parse(req.body);

    let player = await prisma.player.findUnique({ where: { authProviderId: deviceId } });
    if (!player) {
      player = await prisma.player.create({
        data: {
          displayName: `Player${Math.floor(Math.random() * 100000)}`,
          authProvider: "guest",
          authProviderId: deviceId,
          wallet: { create: { gold: 0, gems: 0 } },
          // Every fresh account starts owning a small curated set (incl. one
          // hero) so there's something to see/upgrade on first login, before
          // a single match has been played.
          cards: { create: STARTER_CARD_IDS.map((cardId) => ({ cardId })) },
        },
      });
    }

    return issueTokens(player.id, player.tokenVersion);
  });

  app.post("/auth/apple", { config: strictRateLimitConfig() }, async (req, reply) => {
    const { identityToken } = z.object({ identityToken: z.string() }).parse(req.body);
    const identity = await verifyAppleToken(identityToken);
    const player = await upsertFromIdentity(identity);
    return issueTokens(player.id, player.tokenVersion);
  });

  app.post("/auth/google", { config: strictRateLimitConfig() }, async (req, reply) => {
    const { idToken } = z.object({ idToken: z.string() }).parse(req.body);
    const identity = await verifyGoogleToken(idToken);
    const player = await upsertFromIdentity(identity);
    return issueTokens(player.id, player.tokenVersion);
  });

  // Upgrade the *current* (guest) account to a real Apple/Google identity by
  // rebinding it in place — the whole point is to preserve the player's
  // progress, so this must never create a second Player row. Auth'd with the
  // guest's own access token; the verified provider `sub` becomes the new
  // authProviderId.
  app.post("/auth/link", { preHandler: requireAuth, config: strictRateLimitConfig() }, async (req, reply) => {
    const { provider, token } = linkSchema.parse(req.body);
    const identity =
      provider === "apple" ? await verifyAppleToken(token) : await verifyGoogleToken(token);

    // If this identity is already bound to a Player, only a no-op relink of the
    // caller's own account is allowed; binding someone else's identity (or
    // stealing one already claimed) must fail rather than merge accounts.
    const owner = await prisma.player.findUnique({
      where: { authProviderId: identity.providerId },
    });
    if (owner && owner.id !== req.playerId) {
      return reply.code(409).send({ error: "identity_already_linked" });
    }
    if (owner && owner.id === req.playerId) {
      return { status: "already_linked", provider: identity.provider };
    }

    const updated = await prisma.player.update({
      where: { id: req.playerId! },
      data: { authProvider: identity.provider, authProviderId: identity.providerId },
    });

    // Reissue tokens so the client immediately holds a fresh pair for the now
    // upgraded account (identity is unchanged — same playerId — but this keeps
    // the client's token lifecycle clean post-link).
    return { status: "linked", provider: identity.provider, ...issueTokens(updated.id, updated.tokenVersion) };
  });

  // Rotates on every use: bumping tokenVersion means a stolen refresh
  // token stops working the moment the legitimate client refreshes next,
  // and lets you force-logout a player by bumping it server-side.
  app.post("/auth/refresh", { config: strictRateLimitConfig() }, async (req, reply) => {
    const { refreshToken } = z.object({ refreshToken: z.string() }).parse(req.body);

    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      return reply.code(401).send({ error: "invalid_refresh_token" });
    }

    const player = await prisma.player.findUnique({ where: { id: payload.playerId } });
    if (!player || player.tokenVersion !== payload.tokenVersion) {
      return reply.code(401).send({ error: "invalid_refresh_token" });
    }

    const updated = await prisma.player.update({
      where: { id: player.id },
      data: { tokenVersion: { increment: 1 } },
    });

    return issueTokens(updated.id, updated.tokenVersion);
  });
}

async function upsertFromIdentity(identity: VerifiedIdentity) {
  return prisma.player.upsert({
    where: { authProviderId: identity.providerId },
    update: {},
    create: {
      displayName: `Player${Math.floor(Math.random() * 100000)}`,
      authProvider: identity.provider,
      authProviderId: identity.providerId,
      wallet: { create: { gold: 0, gems: 0 } },
      cards: { create: STARTER_CARD_IDS.map((cardId) => ({ cardId })) },
    },
  });
}

function issueTokens(playerId: string, tokenVersion: number) {
  return {
    accessToken: signAccessToken(playerId),
    refreshToken: signRefreshToken(playerId, tokenVersion),
  };
}

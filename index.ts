import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../../lib/jwt";
import { verifyAppleToken, verifyGoogleToken, VerifiedIdentity } from "./providers";

const guestSchema = z.object({ deviceId: z.string().min(8) });

export async function authRoutes(app: FastifyInstance) {
  // Device-bound guest account — the standard F2P entry point. Upgrading a
  // guest to Apple/Google later should re-bind authProviderId on the same
  // Player row rather than creating a second one; that flow isn't built
  // yet, flagging it so it doesn't get lost.
  app.post("/auth/guest", async (req, reply) => {
    const { deviceId } = guestSchema.parse(req.body);

    let player = await prisma.player.findUnique({ where: { authProviderId: deviceId } });
    if (!player) {
      player = await prisma.player.create({
        data: {
          displayName: `Player${Math.floor(Math.random() * 100000)}`,
          authProvider: "guest",
          authProviderId: deviceId,
          wallet: { create: { gold: 0, gems: 0 } },
        },
      });
    }

    return issueTokens(player.id, player.tokenVersion);
  });

  app.post("/auth/apple", async (req, reply) => {
    const { identityToken } = z.object({ identityToken: z.string() }).parse(req.body);
    const identity = await verifyAppleToken(identityToken);
    const player = await upsertFromIdentity(identity);
    return issueTokens(player.id, player.tokenVersion);
  });

  app.post("/auth/google", async (req, reply) => {
    const { idToken } = z.object({ idToken: z.string() }).parse(req.body);
    const identity = await verifyGoogleToken(idToken);
    const player = await upsertFromIdentity(identity);
    return issueTokens(player.id, player.tokenVersion);
  });

  // Rotates on every use: bumping tokenVersion means a stolen refresh
  // token stops working the moment the legitimate client refreshes next,
  // and lets you force-logout a player by bumping it server-side.
  app.post("/auth/refresh", async (req, reply) => {
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
    },
  });
}

function issueTokens(playerId: string, tokenVersion: number) {
  return {
    accessToken: signAccessToken(playerId),
    refreshToken: signRefreshToken(playerId, tokenVersion),
  };
}

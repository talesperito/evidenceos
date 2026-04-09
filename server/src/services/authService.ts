import crypto from 'crypto';
import { FastifyInstance } from 'fastify';
import { prisma } from '../db/connection';

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';
const JWT_REFRESH_EXPIRES_IN_DAYS = Number(process.env.JWT_REFRESH_EXPIRES_IN_DAYS || '7');
const REFRESH_COOKIE_NAME = 'evidenceos_refresh_token';

interface TokenUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function buildAccessToken(server: FastifyInstance, user: TokenUser) {
  return server.jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    {
      expiresIn: JWT_EXPIRES_IN,
    },
  );
}

async function createRefreshSession(user: TokenUser, ipAddress?: string, userAgent?: string) {
  const refreshToken = crypto.randomBytes(48).toString('hex');
  const tokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + JWT_REFRESH_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000);

  const session = await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash,
      ipAddress,
      userAgent,
      expiresAt,
    },
  });

  return { refreshToken, session };
}

async function revokeSessionByToken(token?: string | null) {
  if (!token) {
    return;
  }

  await prisma.session.updateMany({
    where: {
      tokenHash: hashToken(token),
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}

async function resolveSession(token?: string | null) {
  if (!token) {
    return null;
  }

  return prisma.session.findFirst({
    where: {
      tokenHash: hashToken(token),
      revokedAt: null,
      expiresAt: { gt: new Date() },
      user: {
        active: true,
        deletedAt: null,
      },
    },
    include: {
      user: true,
    },
  });
}

export {
  REFRESH_COOKIE_NAME,
  buildAccessToken,
  createRefreshSession,
  revokeSessionByToken,
  resolveSession,
};

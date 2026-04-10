import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as argon2 from 'argon2';
import { prisma } from '../db/connection';
import { auditService } from '../services/auditService';
import {
  REFRESH_COOKIE_NAME,
  buildAccessToken,
  createRefreshSession,
  resolveSession,
  revokeSessionByToken,
} from '../services/authService';

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/api/auth',
};

export async function authRoutes(server: FastifyInstance) {
  server.post('/login', async (request, reply) => {
    const loginSchema = z.object({
      email: z.string().email(),
      password: z.string(),
    });

    const { email, password } = loginSchema.parse(request.body);

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.active) {
      return reply.status(401).send({ message: 'Credenciais invalidas' });
    }

    const isPasswordValid = await argon2.verify(user.passwordHash, password);
    if (!isPasswordValid) {
      await auditService.log({
        userEmail: email,
        userName: 'Visitante',
        action: 'LOGIN_FAILED',
        details: { reason: 'Senha incorreta' },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });
      return reply.status(401).send({ message: 'Credenciais invalidas' });
    }

    const tokenUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    const token = buildAccessToken(server, tokenUser);
    const { refreshToken, session } = await createRefreshSession(
      tokenUser,
      request.ip,
      request.headers['user-agent'],
    );

    reply.setCookie(REFRESH_COOKIE_NAME, refreshToken, {
      ...REFRESH_COOKIE_OPTIONS,
      expires: session.expiresAt,
    });

    await auditService.log({
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      action: 'LOGIN',
      targetType: 'session',
      targetId: session.id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  });

  server.post('/change-password', {
    onRequest: [async (request) => await request.jwtVerify()],
  }, async (request, reply) => {
    const user = request.user as { id: string; email: string; name: string };
    const changePasswordSchema = z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(6),
    });

    const { currentPassword, newPassword } = changePasswordSchema.parse(request.body);

    const currentUser = await prisma.user.findUnique({
      where: { id: user.id },
    });

    if (!currentUser || !currentUser.active) {
      return reply.status(404).send({ message: 'Usuario nao encontrado' });
    }

    const isCurrentPasswordValid = await argon2.verify(currentUser.passwordHash, currentPassword);
    if (!isCurrentPasswordValid) {
      await auditService.log({
        userId: user.id,
        userEmail: user.email,
        userName: user.name,
        action: 'PASSWORD_CHANGE_FAILED',
        details: { reason: 'Senha atual incorreta' },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.status(401).send({ message: 'Senha atual incorreta' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await argon2.hash(newPassword),
      },
    });

    await auditService.log({
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      action: 'PASSWORD_CHANGE',
      targetType: 'user',
      targetId: user.id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return { message: 'Senha atualizada com sucesso' };
  });

  server.post('/logout', {
    onRequest: [async (request) => await request.jwtVerify()],
  }, async (request, reply) => {
    const user = request.user as any;
    const refreshToken = request.cookies[REFRESH_COOKIE_NAME];

    await revokeSessionByToken(refreshToken);
    reply.clearCookie(REFRESH_COOKIE_NAME, REFRESH_COOKIE_OPTIONS);

    await auditService.log({
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      action: 'LOGOUT',
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return { status: 'logged out' };
  });

  server.post('/refresh', async (request, reply) => {
    const refreshToken = request.cookies[REFRESH_COOKIE_NAME];
    const session = await resolveSession(refreshToken);

    if (!session) {
      reply.clearCookie(REFRESH_COOKIE_NAME, REFRESH_COOKIE_OPTIONS);
      return reply.status(401).send({ message: 'Sessao expirada ou invalida' });
    }

    await revokeSessionByToken(refreshToken);
    const tokenUser = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role,
    };
    const token = buildAccessToken(server, tokenUser);
    const newSession = await createRefreshSession(
      tokenUser,
      request.ip,
      request.headers['user-agent'],
    );

    reply.setCookie(REFRESH_COOKIE_NAME, newSession.refreshToken, {
      ...REFRESH_COOKIE_OPTIONS,
      expires: newSession.session.expiresAt,
    });

    await auditService.log({
      userId: session.user.id,
      userEmail: session.user.email,
      userName: session.user.name,
      action: 'SESSION_REFRESH',
      targetType: 'session',
      targetId: newSession.session.id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return {
      token,
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        role: session.user.role,
      },
    };
  });

  server.get('/me', {
    onRequest: [async (request) => await request.jwtVerify()],
  }, async (request) => {
    const decoded = request.user as any;
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, email: true, name: true, role: true },
    });
    return user;
  });
}

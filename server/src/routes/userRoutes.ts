import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as argon2 from 'argon2';
import { prisma } from '../db/connection';
import { auditService } from '../services/auditService';

export async function userRoutes(server: FastifyInstance) {
  
  // Middleware de Admin
  server.addHook('onRequest', async (request, reply) => {
    await request.jwtVerify();
    const user = request.user as any;
    if (user.role !== 'ADMIN') {
      return reply.status(403).send({ message: 'Acesso negado: Requer privilégios de Admin' });
    }
  });

  // Listar usuários
  server.get('/', async () => {
    return await prisma.user.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true, lastLoginAt: true }
    });
  });

  // Criar usuário
  server.post('/', async (request, reply) => {
    const userSchema = z.object({
      name: z.string().min(1),
      email: z.string().email(),
      password: z.string().min(6),
      role: z.enum(['ADMIN', 'PERITO', 'VISUALIZADOR']).default('PERITO'),
    });

    const data = userSchema.parse(request.body);
    const admin = request.user as any;

    const passwordHash = await argon2.hash(data.password);

    const newUser = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash,
        role: data.role
      }
    });

    await auditService.log({
      userId: admin.id,
      userEmail: admin.email,
      userName: admin.name,
      action: 'USER_CREATE',
      targetType: 'user',
      targetId: newUser.id,
      details: { email: data.email, role: data.role },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent']
    });

    return reply.status(201).send({ id: newUser.id, email: newUser.email });
  });

  server.put('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const admin = request.user as any;

    const updateUserSchema = z.object({
      name: z.string().min(1).optional(),
      email: z.string().email().optional(),
      password: z.string().min(6).optional(),
      role: z.enum(['ADMIN', 'PERITO', 'VISUALIZADOR']).optional(),
      active: z.boolean().optional(),
    });

    const data = updateUserSchema.parse(request.body);
    const updateData: Record<string, unknown> = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.role !== undefined) updateData.role = data.role;
    if (data.active !== undefined) {
      updateData.active = data.active;
      if (!data.active) {
        updateData.deletedAt = new Date();
      }
    }
    if (data.password) {
      updateData.passwordHash = await argon2.hash(data.password);
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });

    await auditService.log({
      userId: admin.id,
      userEmail: admin.email,
      userName: admin.name,
      action: 'USER_UPDATE',
      targetType: 'user',
      targetId: id,
      details: {
        ...data,
        password: data.password ? '[REDACTED]' : undefined,
      },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.send(updatedUser);
  });

  // Desativar usuário
  server.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const admin = request.user as any;

    await prisma.user.update({
      where: { id },
      data: { active: false, deletedAt: new Date() }
    });

    await auditService.log({
      userId: admin.id,
      userEmail: admin.email,
      userName: admin.name,
      action: 'USER_DEACTIVATE',
      targetType: 'user',
      targetId: id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent']
    });

    return reply.status(204).send();
  });
}

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/connection';
import { auditService } from '../services/auditService';

const standardSchema = z.object({
  code: z.string().min(1),
  title: z.string().min(1),
  category: z.string().optional(),
  description: z.string().optional(),
  fullText: z.string().optional(),
  sourceUrl: z.string().url().optional().or(z.literal('')),
  effectiveDate: z.string().optional().transform((value) => (value ? new Date(value) : null)),
  version: z.string().optional(),
  active: z.boolean().optional(),
});

export async function custodyStandardRoutes(server: FastifyInstance) {
  server.addHook('onRequest', async (request) => {
    await request.jwtVerify();
  });

  server.get('/', async () => {
    return prisma.custodyStandard.findMany({
      where: { active: true },
      orderBy: [{ category: 'asc' }, { title: 'asc' }],
    });
  });

  server.post('/', async (request, reply) => {
    const user = request.user as { id: string; email: string; name: string; role?: string };
    if (user.role !== 'ADMIN') {
      return reply.status(403).send({ message: 'Acesso negado: Requer privilégios de Admin' });
    }

    const data = standardSchema.parse(request.body);
    const created = await prisma.custodyStandard.create({
      data: {
        ...data,
        sourceUrl: data.sourceUrl || null,
      },
    });

    await auditService.log({
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      action: 'STANDARD_CREATE',
      targetType: 'custody_standard',
      targetId: String(created.id),
      details: { title: created.title, category: created.category },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.status(201).send(created);
  });

  server.put('/:id', async (request, reply) => {
    const user = request.user as { id: string; email: string; name: string; role?: string };
    if (user.role !== 'ADMIN') {
      return reply.status(403).send({ message: 'Acesso negado: Requer privilégios de Admin' });
    }

    const { id } = request.params as { id: string };
    const data = standardSchema.partial().parse(request.body);
    const updated = await prisma.custodyStandard.update({
      where: { id: Number(id) },
      data: {
        ...data,
        sourceUrl: data.sourceUrl === '' ? null : data.sourceUrl,
      },
    });

    await auditService.log({
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      action: 'STANDARD_UPDATE',
      targetType: 'custody_standard',
      targetId: String(updated.id),
      details: { title: updated.title, category: updated.category },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return updated;
  });

  server.delete('/:id', async (request, reply) => {
    const user = request.user as { id: string; email: string; name: string; role?: string };
    if (user.role !== 'ADMIN') {
      return reply.status(403).send({ message: 'Acesso negado: Requer privilégios de Admin' });
    }

    const { id } = request.params as { id: string };
    await prisma.custodyStandard.update({
      where: { id: Number(id) },
      data: { active: false },
    });

    await auditService.log({
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      action: 'STANDARD_DELETE',
      targetType: 'custody_standard',
      targetId: id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.status(204).send();
  });
}

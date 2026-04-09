import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/connection';

const serializeLog = (log: Awaited<ReturnType<typeof prisma.auditLog.findFirstOrThrow>>) => ({
  ...log,
  id: log.id.toString(),
});

export async function auditRoutes(server: FastifyInstance) {
  server.addHook('onRequest', async (request) => {
    await request.jwtVerify();
  });

  server.post('/', async (request, reply) => {
    const user = request.user as { id: string; email: string; name: string };
    const bodySchema = z.object({
      action: z.string().min(1),
      targetType: z.string().optional(),
      targetId: z.string().optional(),
      details: z.unknown().optional(),
    });

    const data = bodySchema.parse(request.body);
    const log = await prisma.auditLog.create({
      data: {
        userId: user.id,
        userEmail: user.email,
        userName: user.name,
        action: data.action,
        targetType: data.targetType,
        targetId: data.targetId,
        details: data.details ?? {},
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      },
    });

    return reply.status(201).send(serializeLog(log));
  });

  server.get('/', async (request, reply) => {
    const user = request.user as { role?: string };
    if (user.role !== 'ADMIN') {
      return reply.status(403).send({ message: 'Acesso negado: Requer privilégios de Admin' });
    }

    const querySchema = z.object({
      page: z.string().optional().transform((value) => Number(value) || 1),
      limit: z.string().optional().transform((value) => Math.min(Number(value) || 50, 200)),
      action: z.string().optional(),
      userEmail: z.string().optional(),
    });

    const { page, limit, action, userEmail } = querySchema.parse(request.query);
    const skip = (page - 1) * limit;

    const where = {
      ...(action ? { action } : {}),
      ...(userEmail ? { userEmail: { contains: userEmail, mode: 'insensitive' as const } } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return {
      items: items.map(serializeLog),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  });

  server.get('/export', async (request, reply) => {
    const user = request.user as { role?: string };
    if (user.role !== 'ADMIN') {
      return reply.status(403).send({ message: 'Acesso negado: Requer privilégios de Admin' });
    }

    const querySchema = z.object({
      format: z.enum(['json', 'csv']).default('json'),
    });

    const { format } = querySchema.parse(request.query);
    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });

    if (format === 'csv') {
      const header = 'id,createdAt,action,userEmail,userName,targetType,targetId,ipAddress';
      const rows = logs.map((log) =>
        [
          log.id.toString(),
          log.createdAt.toISOString(),
          log.action,
          log.userEmail,
          log.userName,
          log.targetType || '',
          log.targetId || '',
          log.ipAddress || '',
        ]
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(','),
      );

      reply.header('content-type', 'text/csv; charset=utf-8');
      reply.header('content-disposition', 'attachment; filename="audit-logs.csv"');
      return [header, ...rows].join('\n');
    }

    return {
      exportedAt: new Date().toISOString(),
      total: logs.length,
      items: logs.map(serializeLog),
    };
  });
}

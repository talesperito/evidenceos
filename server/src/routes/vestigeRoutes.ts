import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/connection';
import { auditService } from '../services/auditService';

const VALID_ESTADO_CONSERVACAO = [
  'NAO_AVALIADO', 'NOVO_LACRADO', 'SEMI_NOVO',
  'USADO_FUNCIONANDO', 'DANIFICADO', 'SEM_CONDICOES'
];

const VALID_DESTINACAO = ['NAO_INICIADO', 'SOLICITADO', 'FINALIZADO'];

export async function vestigeRoutes(server: FastifyInstance) {
  const querySchema = z.object({
    page: z.string().optional().transform(v => Number(v) || 1),
    limit: z.string().optional().transform(v => Number(v) || 50),
    category: z.string().optional(),
    search: z.string().optional(),
    estadoConservacao: z.string().optional(),
    destinacao: z.string().optional(),
  });

  const buildWhereClause = (category?: string, search?: string, estadoConservacao?: string, destinacao?: string) => {
    const where: Record<string, unknown> = { deletedAt: null };
    if (category) where.categoryId = Number(category);
    if (estadoConservacao) where.estadoConservacao = estadoConservacao;
    if (destinacao) where.destinacao = destinacao;
    if (search) {
      where.OR = [
        { material: { contains: search, mode: 'insensitive' } },
        { registroFav: { contains: search, mode: 'insensitive' } },
        { requisicao: { contains: search, mode: 'insensitive' } },
        { involucro: { contains: search, mode: 'insensitive' } },
      ];
    }
    return where;
  };

  server.addHook('onRequest', async (request) => {
    await request.jwtVerify();
  });

  const requireEditorAccess = async (request: any, reply: any) => {
    const user = request.user as { role?: string };
    if (user.role !== 'ADMIN' && user.role !== 'PERITO') {
      return reply.status(403).send({ message: 'Acesso negado: Requer perfil com permissão de edição' });
    }
  };

  const requireAdminAccess = async (request: any, reply: any) => {
    const user = request.user as { role?: string };
    if (user.role !== 'ADMIN') {
      return reply.status(403).send({ message: 'Acesso negado: Requer privilégios de Admin' });
    }
  };

  server.get('/', async (request) => {
    const { page, limit, category, search, estadoConservacao, destinacao } = querySchema.parse(request.query);
    const skip = (page - 1) * limit;
    const where = buildWhereClause(category, search, estadoConservacao, destinacao);

    const [items, total] = await Promise.all([
      prisma.vestige.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { category: true },
      }),
      prisma.vestige.count({ where }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  });

  server.get('/search', async (request) => {
    const { page, limit, category, search, estadoConservacao, destinacao } = querySchema.parse(request.query);
    const skip = (page - 1) * limit;
    const where = buildWhereClause(category, search, estadoConservacao, destinacao);

    const [items, total] = await Promise.all([
      prisma.vestige.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { category: true },
      }),
      prisma.vestige.count({ where }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  });

  server.get('/stats', async () => {
    const total = await prisma.vestige.count({ where: { deletedAt: null } });
    const statsByCategory = await prisma.vestige.groupBy({
      by: ['categoryId'],
      _count: { id: true },
      where: { deletedAt: null },
    });

    return {
      total,
      statsByCategory,
      timestamp: new Date(),
    };
  });

  server.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user as any;

    const vestige = await prisma.vestige.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: { category: true },
    });

    if (!vestige) {
      return reply.status(404).send({ message: 'Vestígio não encontrado' });
    }

    await auditService.log({
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      action: 'VIEW_DETAIL',
      targetType: 'vestige',
      targetId: vestige.id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return vestige;
  });

  server.post('/', { preHandler: requireEditorAccess }, async (request) => {
    const vestigeSchema = z.object({
      material: z.string().min(1),
      categoryId: z.number(),
      registroFav: z.string().optional(),
      requisicao: z.string().optional(),
      involucro: z.string().optional(),
      municipio: z.string().default('Lavras'),
      dataColeta: z.string().optional().transform(v => v ? new Date(v) : null),
      observacoes: z.string().optional(),
      estadoConservacao: z.enum(VALID_ESTADO_CONSERVACAO as [string, ...string[]]).default('NAO_AVALIADO'),
      destinacao: z.enum(VALID_DESTINACAO as [string, ...string[]]).default('NAO_INICIADO'),
    });

    const data = vestigeSchema.parse(request.body);
    const user = request.user as any;

    const vestige = await prisma.vestige.create({
      data: {
        ...data,
        createdBy: user.id,
      },
    });

    await auditService.log({
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      action: 'CREATE',
      targetType: 'vestige',
      targetId: vestige.id,
      details: data,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return vestige;
  });

  server.put('/:id', { preHandler: requireEditorAccess }, async (request) => {
    const { id } = request.params as { id: string };
    const user = request.user as any;

    const updateSchema = z.object({
      material: z.string().optional(),
      categoryId: z.number().optional(),
      registroFav: z.string().optional(),
      requisicao: z.string().optional(),
      involucro: z.string().optional(),
      municipio: z.string().optional(),
      dataColeta: z.string().optional().transform(v => v ? new Date(v) : null),
      observacoes: z.string().optional(),
      estadoConservacao: z.enum(VALID_ESTADO_CONSERVACAO as [string, ...string[]]).optional(),
      destinacao: z.enum(VALID_DESTINACAO as [string, ...string[]]).optional(),
      destinacaoObs: z.string().optional(),
    });

    const data = updateSchema.parse(request.body);

    if (data.destinacao) {
      const current = await prisma.vestige.findUnique({
        where: { id },
        select: { destinacao: true },
      });

      if (current && current.destinacao !== data.destinacao) {
        await prisma.vestigeDestinationLog.create({
          data: {
            vestigeId: id,
            fromStatus: current.destinacao,
            toStatus: data.destinacao,
            observation: data.destinacaoObs || null,
            changedBy: user.id,
          },
        });

        (data as any).destinacaoChangedBy = user.id;
        (data as any).destinacaoChangedAt = new Date();
      }
    }

    const vestige = await prisma.vestige.update({
      where: { id },
      data: {
        ...data,
        updatedBy: user.id,
      },
    });

    await auditService.log({
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      action: 'UPDATE',
      targetType: 'vestige',
      targetId: vestige.id,
      details: data,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return vestige;
  });

  server.get('/:id/destination-history', async (request, reply) => {
    const { id } = request.params as { id: string };

    const logs = await prisma.vestigeDestinationLog.findMany({
      where: { vestigeId: id },
      orderBy: { changedAt: 'desc' },
      include: {
        user: { select: { name: true, email: true } },
      },
    });

    return logs.map((log: any) => ({
      id: String(log.id),
      fromStatus: log.fromStatus,
      toStatus: log.toStatus,
      observation: log.observation,
      changedBy: log.user.name,
      changedByEmail: log.user.email,
      changedAt: log.changedAt.toISOString(),
    }));
  });

  server.delete('/:id', { preHandler: requireAdminAccess }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user as any;

    await prisma.vestige.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await auditService.log({
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      action: 'DELETE',
      targetType: 'vestige',
      targetId: id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.status(204).send();
  });
}

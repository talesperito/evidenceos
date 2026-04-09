import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/connection';
import { auditService } from '../services/auditService';

export async function vestigeRoutes(server: FastifyInstance) {
  const querySchema = z.object({
    page: z.string().optional().transform(v => Number(v) || 1),
    limit: z.string().optional().transform(v => Number(v) || 50),
    category: z.string().optional(),
    search: z.string().optional(),
  });

  const buildWhereClause = (category?: string, search?: string) => {
    const where: Record<string, unknown> = { deletedAt: null };
    if (category) where.categoryId = Number(category);
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
  
  // Middleware de proteção global para estas rotas
  server.addHook('onRequest', async (request) => {
    await request.jwtVerify();
  });

  const requireWriteAccess = async (request: any, reply: any) => {
    const user = request.user as { role?: string };
    if (user.role !== 'ADMIN') {
      return reply.status(403).send({ message: 'Acesso negado: Requer privilégios de Admin' });
    }
  };

  // Listar vestígios (Paginado + Filtros)
  server.get('/', async (request, reply) => {
    const { page, limit, category, search } = querySchema.parse(request.query);
    const skip = (page - 1) * limit;
    const where = buildWhereClause(category, search);

    const [items, total] = await Promise.all([
      prisma.vestige.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { category: true }
      }),
      prisma.vestige.count({ where })
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  });

  server.get('/search', async (request) => {
    const { page, limit, category, search } = querySchema.parse(request.query);
    const skip = (page - 1) * limit;
    const where = buildWhereClause(category, search);

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

  // Estatísticas
  server.get('/stats', async () => {
    const total = await prisma.vestige.count({ where: { deletedAt: null } });
    const statsByCategory = await prisma.vestige.groupBy({
      by: ['categoryId'],
      _count: { id: true },
      where: { deletedAt: null }
    });

    return {
      total,
      statsByCategory,
      timestamp: new Date()
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

  // Criar vestígio
  server.post('/', { preHandler: requireWriteAccess }, async (request, reply) => {
    const vestigeSchema = z.object({
      material: z.string().min(1),
      categoryId: z.number(),
      registroFav: z.string().optional(),
      requisicao: z.string().optional(),
      involucro: z.string().optional(),
      municipio: z.string().default('Lavras'),
      dataColeta: z.string().optional().transform(v => v ? new Date(v) : null),
      observacoes: z.string().optional(),
    });

    const data = vestigeSchema.parse(request.body);
    const user = request.user as any;

    const vestige = await prisma.vestige.create({
      data: {
        ...data,
        createdBy: user.id
      }
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
      userAgent: request.headers['user-agent']
    });

    return vestige;
  });

  // Atualizar vestígio
  server.put('/:id', { preHandler: requireWriteAccess }, async (request, reply) => {
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
    });

    const data = updateSchema.parse(request.body);

    const vestige = await prisma.vestige.update({
      where: { id },
      data: {
        ...data,
        updatedBy: user.id
      }
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
      userAgent: request.headers['user-agent']
    });

    return vestige;
  });

  // Excluir (Soft Delete)
  server.delete('/:id', { preHandler: requireWriteAccess }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user as any;

    await prisma.vestige.update({
      where: { id },
      data: { deletedAt: new Date() }
    });

    await auditService.log({
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      action: 'DELETE',
      targetType: 'vestige',
      targetId: id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent']
    });

    return reply.status(204).send();
  });
}

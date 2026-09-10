import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/connection';
import { auditService } from '../services/auditService';
import {
  ItemPlan,
  StoredItem,
  VestigeItemError,
  planCreate,
  planUpdate,
} from '../services/vestigeItemService';

const VALID_ESTADO_CONSERVACAO = [
  'NAO_AVALIADO', 'NOVO_LACRADO', 'SEMI_NOVO',
  'USADO_FUNCIONANDO', 'DANIFICADO', 'SEM_CONDICOES'
];

// NAO_INICIADO = na URC · RETIRADO = saiu da URC (detalhe fica na FAV do PCNET).
// SOLICITADO e FINALIZADO saíram do seletor da UI, mas continuam aceitos aqui:
// registros gravados antes da simplificação precisam poder ser salvos de novo.
const VALID_DESTINACAO = ['NAO_INICIADO', 'RETIRADO', 'SOLICITADO', 'FINALIZADO'];

// Normaliza uma lista de números vinda da query: remove espaços, descarta vazios e duplicatas.
const normalizeNumeros = (arr?: string[] | null): string[] => {
  if (!arr) return [];
  const cleaned = arr.map((s) => s.trim()).filter((s) => s.length > 0);
  return Array.from(new Set(cleaned));
};

// Invólucros e requisições chegam como { numero, motivo }. O motivo só é lido para itens
// incluídos numa edição — ver vestigeItemService.
const itemListSchema = z.array(z.object({
  numero: z.string().max(30),
  motivo: z.string().max(40).optional(),
}));

// Só os itens ativos vão para a tela. O id (BigInt) fica de fora: não serializa em JSON.
const activeItems = {
  where: { removedAt: null },
  select: { numero: true, motivo: true },
  orderBy: { id: 'asc' },
} as const;

// Bundle antigo em cache no navegador ainda manda `requisicao` como texto e invólucros como
// lista de strings. Sem esta trava, o Zod descartaria o campo desconhecido e o vestígio seria
// gravado sem a requisição, sem erro nenhum na tela.
const isLegacyPayload = (body: unknown): boolean => {
  if (!body || typeof body !== 'object') return false;
  const { requisicao, involucros } = body as { requisicao?: unknown; involucros?: unknown };
  return requisicao !== undefined
    || (Array.isArray(involucros) && involucros.some((item) => typeof item === 'string'));
};

const LEGACY_PAYLOAD_MESSAGE = 'Esta tela está desatualizada. Recarregue a página com Ctrl+Shift+R e salve de novo.';

// Antes/depois só das listas que mudaram: é o que permite reconstruir, pelos Logs de
// Auditoria, a sequência de invólucros e requisições de um vestígio.
const describeItemChange = (
  plan: ItemPlan<bigint> | null,
  before: StoredItem<bigint>[],
  after: { numero: string; motivo: string }[],
) =>
  plan && (plan.toAdd.length > 0 || plan.toRemove.length > 0)
    ? {
        antes: before.map(({ numero, motivo }) => ({ numero, motivo })),
        depois: after,
        incluidos: plan.toAdd,
        removidos: plan.toRemove.map(({ numero, motivo }) => ({ numero, motivo })),
      }
    : undefined;

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
        { requisicoes: { some: { removedAt: null, numero: { contains: search, mode: 'insensitive' } } } },
        { involucros: { some: { removedAt: null, numero: { contains: search, mode: 'insensitive' } } } },
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
        include: { category: true, involucros: activeItems, requisicoes: activeItems },
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
        include: { category: true, involucros: activeItems, requisicoes: activeItems },
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

  server.get('/check-duplicate', async (request) => {
    const schema = z.object({
      // Aceita um único valor (?involucro=X) ou repetido (?involucro=X&involucro=Y). Idem requisicao.
      involucro: z.union([z.string(), z.array(z.string())]).optional(),
      requisicao: z.union([z.string(), z.array(z.string())]).optional(),
      excludeId: z.string().optional(), // ID do vestígio atual em caso de edição
    });

    const parsed = schema.parse(request.query);
    const asList = (value?: string | string[]) => normalizeNumeros(Array.isArray(value) ? value : value ? [value] : []);
    const involucros = asList(parsed.involucro);
    const requisicoes = asList(parsed.requisicao);
    const { excludeId } = parsed;

    const duplicates: { field: string; value: string; vestigeId: string; material: string; registroFav: string | null }[] = [];

    // Cada número é verificado contra os itens ativos de todos os vestígios não excluídos.
    const vestigeFilter = {
      deletedAt: null,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    };
    const vestigeSelect = { vestige: { select: { id: true, material: true, registroFav: true } } };

    for (const numero of involucros) {
      const found = await prisma.vestigeInvolucro.findFirst({
        where: { numero, removedAt: null, vestige: vestigeFilter },
        select: vestigeSelect,
      });
      if (found) {
        duplicates.push({ field: 'involucro', value: numero, vestigeId: found.vestige.id, material: found.vestige.material, registroFav: found.vestige.registroFav });
      }
    }

    for (const numero of requisicoes) {
      const found = await prisma.vestigeRequisicao.findFirst({
        where: { numero, removedAt: null, vestige: vestigeFilter },
        select: vestigeSelect,
      });
      if (found) {
        duplicates.push({ field: 'requisicao', value: numero, vestigeId: found.vestige.id, material: found.vestige.material, registroFav: found.vestige.registroFav });
      }
    }

    return { duplicates };
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
      include: { category: true, involucros: activeItems, requisicoes: activeItems },
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

  server.post('/', { preHandler: requireEditorAccess }, async (request, reply) => {
    if (isLegacyPayload(request.body)) {
      return reply.status(400).send({ message: LEGACY_PAYLOAD_MESSAGE });
    }

    const vestigeSchema = z.object({
      material: z.string().min(1),
      categoryId: z.number(),
      registroFav: z.string().optional(),
      requisicoes: itemListSchema.optional(),
      involucros: itemListSchema.optional(),
      municipio: z.string().default('Lavras'),
      dataColeta: z.string().optional().transform(v => v ? new Date(v) : null),
      observacoes: z.string().optional(),
      estadoConservacao: z.enum(VALID_ESTADO_CONSERVACAO as [string, ...string[]]).default('NAO_AVALIADO'),
      destinacao: z.enum(VALID_DESTINACAO as [string, ...string[]]).default('NAO_INICIADO'),
    });

    const { involucros: rawInvolucros, requisicoes: rawRequisicoes, ...data } = vestigeSchema.parse(request.body);
    const user = request.user as any;

    let involucros;
    let requisicoes;
    try {
      involucros = planCreate('involucro', rawInvolucros);
      requisicoes = planCreate('requisicao', rawRequisicoes);
    } catch (error) {
      if (error instanceof VestigeItemError) return reply.status(400).send({ message: error.message });
      throw error;
    }

    const vestige = await prisma.vestige.create({
      data: {
        ...data,
        createdBy: user.id,
        involucros: involucros.length > 0 ? { create: involucros } : undefined,
        requisicoes: requisicoes.length > 0 ? { create: requisicoes } : undefined,
      },
      include: { involucros: activeItems, requisicoes: activeItems },
    });

    await auditService.log({
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      action: 'CREATE',
      targetType: 'vestige',
      targetId: vestige.id,
      details: { ...data, involucros, requisicoes },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return vestige;
  });

  server.put('/:id', { preHandler: requireEditorAccess }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user as any;

    if (isLegacyPayload(request.body)) {
      return reply.status(400).send({ message: LEGACY_PAYLOAD_MESSAGE });
    }

    const updateSchema = z.object({
      material: z.string().optional(),
      categoryId: z.number().optional(),
      registroFav: z.string().optional(),
      requisicoes: itemListSchema.optional(),
      involucros: itemListSchema.optional(),
      municipio: z.string().optional(),
      dataColeta: z.string().optional().transform(v => v ? new Date(v) : null),
      observacoes: z.string().optional(),
      estadoConservacao: z.enum(VALID_ESTADO_CONSERVACAO as [string, ...string[]]).optional(),
      destinacao: z.enum(VALID_DESTINACAO as [string, ...string[]]).optional(),
      destinacaoObs: z.string().optional(),
    });

    const { involucros: rawInvolucros, requisicoes: rawRequisicoes, ...data } = updateSchema.parse(request.body);

    const storedItems = {
      where: { removedAt: null },
      select: { id: true, numero: true, motivo: true },
      orderBy: { id: 'asc' },
    } as const;

    const current = await prisma.vestige.findFirst({
      where: { id, deletedAt: null },
      select: { destinacao: true, involucros: storedItems, requisicoes: storedItems },
    });

    if (!current) {
      return reply.status(404).send({ message: 'Vestígio não encontrado' });
    }

    // Uma lista só é mexida quando o cliente a envia; sem ela, os itens gravados ficam como estão.
    let plans: { involucros: ItemPlan<bigint> | null; requisicoes: ItemPlan<bigint> | null };
    try {
      plans = {
        involucros: rawInvolucros === undefined ? null : planUpdate('involucro', current.involucros, rawInvolucros),
        requisicoes: rawRequisicoes === undefined ? null : planUpdate('requisicao', current.requisicoes, rawRequisicoes),
      };
    } catch (error) {
      if (error instanceof VestigeItemError) return reply.status(400).send({ message: error.message });
      throw error;
    }
    const { involucros: involucrosPlan, requisicoes: requisicoesPlan } = plans;

    if (data.destinacao && current.destinacao !== data.destinacao) {
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

    // Numa transação só: se a gravação do vestígio falhar, nenhum item é incluído nem removido.
    // Item removido não é apagado — recebe removedAt e some apenas das telas.
    const removedAt = new Date();
    const vestige = await prisma.$transaction(async (tx) => {
      if (involucrosPlan && involucrosPlan.toRemove.length > 0) {
        await tx.vestigeInvolucro.updateMany({
          where: { id: { in: involucrosPlan.toRemove.map((item) => item.id) } },
          data: { removedAt },
        });
      }
      for (const item of involucrosPlan?.toAdd ?? []) {
        await tx.vestigeInvolucro.create({ data: { vestigeId: id, ...item } });
      }

      if (requisicoesPlan && requisicoesPlan.toRemove.length > 0) {
        await tx.vestigeRequisicao.updateMany({
          where: { id: { in: requisicoesPlan.toRemove.map((item) => item.id) } },
          data: { removedAt },
        });
      }
      for (const item of requisicoesPlan?.toAdd ?? []) {
        await tx.vestigeRequisicao.create({ data: { vestigeId: id, ...item } });
      }

      return tx.vestige.update({
        where: { id },
        data: {
          ...data,
          updatedBy: user.id,
        },
        include: { involucros: activeItems, requisicoes: activeItems },
      });
    });

    const involucrosChange = describeItemChange(involucrosPlan, current.involucros, vestige.involucros);
    const requisicoesChange = describeItemChange(requisicoesPlan, current.requisicoes, vestige.requisicoes);

    await auditService.log({
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      action: 'UPDATE',
      targetType: 'vestige',
      targetId: vestige.id,
      details: {
        ...data,
        ...(involucrosChange ? { involucros: involucrosChange } : {}),
        ...(requisicoesChange ? { requisicoes: requisicoesChange } : {}),
      },
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

    const existing = await prisma.vestige.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      return reply.status(404).send({ message: 'Vestígio não encontrado ou já excluído.' });
    }

    await prisma.vestige.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: user.id },
    });

    await auditService.log({
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      action: 'DELETE',
      targetType: 'vestige',
      targetId: id,
      details: { material: existing.material, registroFav: existing.registroFav },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.status(204).send();
  });
}

import { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/connection';
import { auditService } from '../services/auditService';

// Solicitações de retirada de vestígio. Desenho e decisões em
// docs/plans/2026-08-25-solicitacao-retirada.md — ler as Partes 2 e 11 antes de mexer aqui.
//
// O EvidenceOS registra a INTENÇÃO de retirada (quem pediu, o quê, para quando, por quê); o ato
// oficial continua sendo a movimentação na FAV do PCNET. A única rota deste arquivo que escreve em
// `vestiges` é a /complete, acionada por um perito que presenciou a entrega (Parte 2.9).

// Espelho dos `value` de WITHDRAWAL_REASONS em client/types.ts. Mexeu aqui, mexa lá.
// Guardamos o CÓDIGO, nunca o rótulo exibido (Parte 3.3).
const VALID_REASONS = ['DESTRUICAO', 'RESTITUICAO', 'ANALISE_INVESTIGACAO', 'SOLICITACAO_JUDICIAL', 'OUTROS'] as const;
const VALID_STATUSES = ['SOLICITADA', 'CONCLUIDA', 'CANCELADA', 'NAO_COMPARECEU'] as const;
// Pelo PATCH só se encerra sem movimentar vestígio. Concluir é exclusivo da /complete (Parte 4.6).
const PATCHABLE_STATUSES: readonly string[] = ['CANCELADA', 'NAO_COMPARECEU'];
const STATUS_LABEL: Record<string, string> = {
  SOLICITADA: 'Agendada',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
  NAO_COMPARECEU: 'Não compareceu',
};
const MAX_ITEMS_PER_REQUEST = 200;

// Regra da URC: retirada exige 24h de antecedência (Parte 2.11). A folga de 5 min existe porque o
// navegador compara com o relógio dele e o servidor com o dele; sem ela, um agendamento de 24h01
// passaria na tela e seria recusado aqui por segundos de defasagem.
const ANTECEDENCIA_MINIMA_MS = 24 * 60 * 60 * 1000;
const TOLERANCIA_RELOGIO_MS = 5 * 60 * 1000;

// Mesma frase do ScheduleModal, para a regra não ter dois textos diferentes.
const MSG_PRAZO_BLOQUEADO = 'Agendamento bloqueado. É necessária antecedência mínima de 24h. Para urgências, contate a administração da URC.';
const MSG_NAO_ENCONTRADA = 'Solicitação não encontrada.';
const msgStatusTerminal = (status: string) =>
  `Esta solicitação já está como "${STATUS_LABEL[status] ?? status}" e não pode mais ser alterada. Para corrigir, registre uma nova solicitação.`;

type RequestUser = { id: string; email: string; name: string; role: string };

// Requisições e invólucros ATIVOS do vestígio, só os números, na ordem de inclusão.
// Nunca a coluna antiga `requisicaoLegado` (Parte 0.4 do plano).
const activeNumbers = {
  where: { removedAt: null },
  select: { numero: true },
  orderBy: { id: 'asc' },
} as const;

const REQUEST_INCLUDE = {
  requester: { select: { id: true, name: true, email: true } },
  statusChanger: { select: { id: true, name: true, email: true } },
  items: {
    orderBy: { id: 'asc' },
    include: {
      vestige: {
        select: {
          id: true,
          material: true,
          registroFav: true,
          municipio: true,
          destinacao: true,
          deletedAt: true,
          requisicoes: activeNumbers,
          involucros: activeNumbers,
        },
      },
    },
  },
} as const;

// Nunca devolver o objeto do Prisma cru: o id do item é BigInt e derrubaria a resposta com 500 (T-01).
const serializeRequest = (r: any) => ({
  id: r.id,
  scheduledFor: r.scheduledFor.toISOString(),
  status: r.status,
  notes: r.notes,
  deadlineOverrideReason: r.deadlineOverrideReason, // null = agendado dentro do prazo
  requestedBy: r.requestedBy,
  requesterName: r.requester?.name ?? null,
  requesterEmail: r.requester?.email ?? null,
  requestedAt: r.requestedAt.toISOString(),
  statusChangedBy: r.statusChangedBy,
  statusChangedByName: r.statusChanger?.name ?? null,
  statusChangedAt: r.statusChangedAt?.toISOString() ?? null,
  statusNote: r.statusNote,
  items: (r.items ?? []).map((it: any) => ({
    id: String(it.id),
    vestigeId: it.vestigeId,
    reason: it.reason,
    reasonDetail: it.reasonDetail,
    material: it.vestige?.material ?? null,
    registroFav: it.vestige?.registroFav ?? null,
    requisicoes: (it.vestige?.requisicoes ?? []).map((item: any) => item.numero),
    municipio: it.vestige?.municipio ?? null,
    involucros: (it.vestige?.involucros ?? []).map((item: any) => item.numero),
    // Situação ATUAL do vestígio: o painel precisa saber quem já consta fora da URC.
    destinacao: it.vestige?.destinacao ?? null,
    vestigeDeleted: Boolean(it.vestige?.deletedAt),
  })),
});

// O server.ts não tem setErrorHandler: um ZodError vazando de .parse() viraria HTTP 500 (T-02).
const sendValidationError = (reply: FastifyReply, error: z.ZodError) =>
  reply.status(400).send({ message: z.prettifyError(error) });

const requireEditorAccess = async (request: any, reply: any) => {
  const user = request.user as { role?: string };
  if (user.role !== 'ADMIN' && user.role !== 'PERITO') {
    return reply.status(403).send({ message: 'Acesso negado: Requer perfil com permissão de edição' });
  }
};

class StatusConflictError extends Error {}

const createSchema = z.object({
  scheduledFor: z.iso.datetime({ offset: true, error: 'Data e hora do agendamento inválidas.' }),
  notes: z.string().max(1000, 'Observações com no máximo 1000 caracteres.').optional(),
  deadlineOverrideReason: z.string().max(500, 'Justificativa da urgência com no máximo 500 caracteres.').optional(),
  items: z.array(z.object({
    vestigeId: z.guid({ error: 'Identificador de vestígio inválido.' }),
    reason: z.enum(VALID_REASONS, { error: 'Motivo de retirada inválido.' }),
    reasonDetail: z.string().max(200, 'Justificativa de "Outros" com no máximo 200 caracteres.').optional(),
  }))
    .min(1, 'Informe ao menos um vestígio.')
    .max(MAX_ITEMS_PER_REQUEST, `O sistema registra no máximo ${MAX_ITEMS_PER_REQUEST} itens por solicitação. Divida em mais de um agendamento.`),
}).superRefine((data, ctx) => {
  data.items.forEach((item, index) => {
    if (item.reason === 'OUTROS' && !item.reasonDetail?.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['items', index, 'reasonDetail'],
        message: 'Justificativa obrigatória quando o motivo é "Outros".',
      });
    }
  });
  const ids = data.items.map((item) => item.vestigeId);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: 'custom', path: ['items'], message: 'O mesmo vestígio aparece mais de uma vez na solicitação.' });
  }
});

const listQuerySchema = z.object({
  status: z.enum(VALID_STATUSES, { error: 'Status inválido.' }).optional(),
  from: z.iso.datetime({ offset: true, error: 'Data inicial inválida.' }).optional(),
  to: z.iso.datetime({ offset: true, error: 'Data final inválida.' }).optional(),
  vestigeId: z.guid({ error: 'Identificador de vestígio inválido.' }).optional(),
  page: z.string().optional().transform((v) => Math.max(Number(v) || 1, 1)),
  limit: z.string().optional().transform((v) => Math.min(Math.max(Number(v) || 50, 1), 200)),
});

const statusSchema = z.object({
  status: z.enum(VALID_STATUSES, { error: 'Status inválido.' }),
  statusNote: z.string().max(500, 'Observação com no máximo 500 caracteres.').optional(),
});

const completeSchema = z.object({
  withdrawnVestigeIds: z.array(z.guid({ error: 'Identificador de vestígio inválido.' }))
    .min(1, 'Marque ao menos um material como retirado. Se ninguém compareceu, use a ação "Não compareceu".')
    .max(MAX_ITEMS_PER_REQUEST),
  statusNote: z.string().max(500, 'Observação com no máximo 500 caracteres.').optional(),
});

export async function withdrawalRoutes(server: FastifyInstance) {
  server.addHook('onRequest', async (request) => {
    await request.jwtVerify();
  });

  // Criar solicitação. Qualquer perfil autenticado pode agendar (README, perfis de acesso).
  server.post('/', async (request, reply) => {
    const user = request.user as RequestUser;
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    const body = parsed.data;

    // Regra das 24h no servidor, com exceção só para ADMIN mediante justificativa (Parte 2.11).
    // Data no passado cai aqui por consequência: é menor que agora + 24h.
    const limite = Date.now() + ANTECEDENCIA_MINIMA_MS - TOLERANCIA_RELOGIO_MS;
    const foraDoPrazo = new Date(body.scheduledFor).getTime() < limite;

    // Decide se a justificativa vai para o banco. Enviada num agendamento dentro do prazo, é
    // ignorada — senão a coluna vira lixo e a consulta "quem furou o prazo" perde o sentido.
    let overrideAplicado = false;
    if (foraDoPrazo) {
      if (user.role !== 'ADMIN') {
        return reply.status(400).send({ message: MSG_PRAZO_BLOQUEADO });
      }
      if (!body.deadlineOverrideReason?.trim()) {
        return reply.status(400).send({
          message: 'Agendamento com menos de 24h de antecedência exige justificativa. Descreva o motivo da urgência.',
        });
      }
      overrideAplicado = true;
    }

    // Todos os vestígios precisam existir, numa consulta só. Nada é criado parcialmente.
    const vestigeIds = body.items.map((item) => item.vestigeId);
    const found = await prisma.vestige.findMany({
      where: { id: { in: vestigeIds }, deletedAt: null },
      select: { id: true },
    });
    const foundIds = new Set(found.map((vestige) => vestige.id));
    const missing = vestigeIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      return reply.status(400).send({ message: `Vestígio(s) não encontrado(s) ou excluído(s): ${missing.join(', ')}` });
    }

    const deadlineOverrideReason = overrideAplicado ? body.deadlineOverrideReason!.trim() : null;

    // create aninhado é atômico: solicitação sem itens não pode existir.
    const created = await prisma.withdrawalRequest.create({
      data: {
        scheduledFor: new Date(body.scheduledFor),
        notes: body.notes?.trim() || null,
        deadlineOverrideReason,
        requestedBy: user.id,
        items: {
          create: body.items.map((item) => ({
            vestigeId: item.vestigeId,
            reason: item.reason,
            reasonDetail: item.reason === 'OUTROS' ? item.reasonDetail?.trim() || null : null,
          })),
        },
      },
      include: REQUEST_INCLUDE,
    });

    await auditService.log({
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      action: 'WITHDRAWAL_REQUESTED',
      targetType: 'withdrawal_request',
      targetId: created.id,
      details: {
        scheduledFor: body.scheduledFor,
        itemCount: body.items.length,
        vestigeIds,
        reasons: body.items.map((item) => item.reason),
        deadlineOverride: overrideAplicado,
        ...(overrideAplicado ? { deadlineOverrideReason } : {}),
      },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.status(201).send(serializeRequest(created));
  });

  server.get('/', async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    const { status, from, to, vestigeId, page, limit } = parsed.data;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (from || to) {
      where.scheduledFor = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }
    if (vestigeId) where.items = { some: { vestigeId } };

    const [items, total] = await Promise.all([
      prisma.withdrawalRequest.findMany({
        where,
        // Para retirada agendada, o que interessa é a próxima primeiro.
        orderBy: { scheduledFor: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: REQUEST_INCLUDE,
      }),
      prisma.withdrawalRequest.count({ where }),
    ]);

    return {
      items: items.map(serializeRequest),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  });

  // Índice leve para o selo do card: sem paginação, para o selo não sumir em silêncio a partir
  // da 201ª solicitação aberta (T-06). Declarada antes de /:id de propósito.
  server.get('/open-items', async () => {
    const items = await prisma.withdrawalRequestItem.findMany({
      where: { request: { status: 'SOLICITADA' } },
      select: {
        vestigeId: true,
        request: { select: { id: true, scheduledFor: true, requester: { select: { name: true } } } },
      },
      orderBy: { request: { scheduledFor: 'asc' } },
    });

    return items.map((item) => ({
      vestigeId: item.vestigeId,
      requestId: item.request.id,
      scheduledFor: item.request.scheduledFor.toISOString(),
      requesterName: item.request.requester.name,
    }));
  });

  server.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const found = await prisma.withdrawalRequest.findUnique({ where: { id }, include: REQUEST_INCLUDE });
    if (!found) return reply.status(404).send({ message: MSG_NAO_ENCONTRADA });
    return serializeRequest(found);
  });

  // Cancelar ou "Não compareceu". NUNCA escreve em `vestiges`: nesses desfechos nada saiu da URC.
  server.patch('/:id/status', { preHandler: requireEditorAccess }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user as RequestUser;
    const parsed = statusSchema.safeParse(request.body);
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    const { status, statusNote } = parsed.data;

    if (status === 'CONCLUIDA') {
      return reply.status(400).send({
        message: 'Para concluir uma retirada, use a ação "Registrar retirada", que exige informar quais materiais saíram.',
      });
    }
    if (!PATCHABLE_STATUSES.includes(status)) {
      return reply.status(400).send({ message: 'Por aqui a solicitação só pode ser cancelada ou marcada como "Não compareceu".' });
    }

    // Transição atômica: se dois operadores agirem ao mesmo tempo, só o primeiro grava (T-08).
    const { count } = await prisma.withdrawalRequest.updateMany({
      where: { id, status: 'SOLICITADA' },
      data: {
        status,
        statusNote: statusNote?.trim() || null,
        statusChangedBy: user.id,
        statusChangedAt: new Date(),
      },
    });

    if (count === 0) {
      const existing = await prisma.withdrawalRequest.findUnique({ where: { id }, select: { status: true } });
      if (!existing) return reply.status(404).send({ message: MSG_NAO_ENCONTRADA });
      return reply.status(409).send({ message: msgStatusTerminal(existing.status) });
    }

    await auditService.log({
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      action: 'WITHDRAWAL_STATUS_CHANGED',
      targetType: 'withdrawal_request',
      targetId: id,
      details: { fromStatus: 'SOLICITADA', toStatus: status, statusNote: statusNote?.trim() || null },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    const updated = await prisma.withdrawalRequest.findUnique({ where: { id }, include: REQUEST_INCLUDE });
    return serializeRequest(updated);
  });

  // Registrar a retirada: conclui a solicitação e move para RETIRADO só os vestígios que saíram de
  // fato. Retirada parcial é o caso normal (Parte 2.10). Única rota que escreve em `vestiges`.
  server.post('/:id/complete', { preHandler: requireEditorAccess }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user as RequestUser;
    const parsed = completeSchema.safeParse(request.body);
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    const body = parsed.data;

    const solicitacao = await prisma.withdrawalRequest.findUnique({
      where: { id },
      select: { status: true, items: { select: { vestigeId: true } } },
    });
    if (!solicitacao) return reply.status(404).send({ message: MSG_NAO_ENCONTRADA });
    if (solicitacao.status !== 'SOLICITADA') {
      return reply.status(409).send({ message: msgStatusTerminal(solicitacao.status) });
    }

    // 🔒 Checagem de autorização, não de digitação: sem ela, a rota serviria para marcar como
    // retirado QUALQUER vestígio do sistema, passando um id arbitrário no corpo (T-11).
    const idsDaSolicitacao = new Set(solicitacao.items.map((item) => item.vestigeId));
    const retirados = new Set(body.withdrawnVestigeIds);
    const forasteiros = [...retirados].filter((vestigeId) => !idsDaSolicitacao.has(vestigeId));
    if (forasteiros.length > 0) {
      return reply.status(400).send({ message: `Estes materiais não fazem parte desta solicitação: ${forasteiros.join(', ')}` });
    }

    const total = idsDaSolicitacao.size;
    const naoRetirados = [...idsDaSolicitacao].filter((vestigeId) => !retirados.has(vestigeId));
    const parcial = retirados.size < total;
    const notaFinal = [
      body.statusNote?.trim(),
      parcial ? `Retirada parcial: ${retirados.size} de ${total} itens.` : null,
    ].filter(Boolean).join(' | ') || null;
    const agora = new Date();

    // Uma transação só: metade aplicada deixaria solicitação concluída com vestígio ainda na URC,
    // ou o inverso (T-13).
    let movimentados: string[];
    try {
      movimentados = await prisma.$transaction(async (tx) => {
        // Trava e conclui. Se outro operador concluiu no mesmo instante, count = 0 e tudo aborta.
        const { count } = await tx.withdrawalRequest.updateMany({
          where: { id, status: 'SOLICITADA' },
          data: { status: 'CONCLUIDA', statusNote: notaFinal, statusChangedBy: user.id, statusChangedAt: agora },
        });
        if (count === 0) throw new StatusConflictError();

        const moved: string[] = [];
        for (const vestigeId of retirados) {
          const atual = await tx.vestige.findUnique({
            where: { id: vestigeId },
            select: { destinacao: true, deletedAt: true },
          });

          // Excluído do cadastro, ou já fora da URC (RETIRADO; FINALIZADO é o equivalente legado,
          // mesma regra de estaForaDaUrc no client): não há transição a registrar.
          if (!atual || atual.deletedAt || atual.destinacao === 'RETIRADO' || atual.destinacao === 'FINALIZADO') {
            continue;
          }

          // Mesmo padrão da edição do vestígio (vestigeRoutes.ts), para o histórico de destinação
          // continuar sendo um só. `destinacaoObs` não é tocado: é a observação digitada por alguém (T-14).
          await tx.vestigeDestinationLog.create({
            data: {
              vestigeId,
              fromStatus: atual.destinacao,
              toStatus: 'RETIRADO',
              observation: `Retirada registrada no painel — solicitação ${id}`,
              changedBy: user.id,
            },
          });

          await tx.vestige.update({
            where: { id: vestigeId },
            data: {
              destinacao: 'RETIRADO',
              destinacaoChangedBy: user.id,
              destinacaoChangedAt: agora,
              updatedBy: user.id,
            },
          });
          moved.push(vestigeId);
        }
        return moved;
      }, { timeout: 30_000 });
    } catch (error) {
      if (error instanceof StatusConflictError) {
        const atual = await prisma.withdrawalRequest.findUnique({ where: { id }, select: { status: true } });
        return reply.status(409).send({ message: msgStatusTerminal(atual?.status ?? 'CONCLUIDA') });
      }
      throw error;
    }

    // Registrar o que NÃO saiu é deliberado: "por que este vestígio continuou na URC depois de
    // agendado?" é uma pergunta que alguém vai fazer.
    await auditService.log({
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      action: 'WITHDRAWAL_COMPLETED',
      targetType: 'withdrawal_request',
      targetId: id,
      details: {
        itemCount: total,
        withdrawnCount: retirados.size,
        withdrawnVestigeIds: [...retirados],
        notWithdrawnVestigeIds: naoRetirados,
        movedVestigeIds: movimentados,
        partial: parcial,
        statusNote: notaFinal,
      },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    const updated = await prisma.withdrawalRequest.findUnique({ where: { id }, include: REQUEST_INCLUDE });
    return serializeRequest(updated);
  });
}

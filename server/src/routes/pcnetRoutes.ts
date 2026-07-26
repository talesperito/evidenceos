import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/connection';
import { auditService } from '../services/auditService';

// Ações disponíveis hoje na integração com o PCNET (ver docs/plans/2026-07-24-integracao-pcnet.md):
// - VIEW_FAV: abre o PDF da Ficha de Acompanhamento de Vestígio (leitura pura).
// - MOVIMENTAR: abre a tela "Sob Custódia", onde o usuário escolhe a finalidade e salva no PCNET.
const VALID_ACTIONS = ['VIEW_FAV', 'MOVIMENTAR'] as const;

// O EvidenceOS apenas abre a tela do PCNET em outra aba; nunca submete o formulário nem recebe
// retorno do PCNET. Por isso o único status possível é SOLICITADO — registrar "SUCESSO" seria
// afirmar algo que não temos como verificar.
const VALID_STATUSES = ['SOLICITADO'] as const;

export async function pcnetRoutes(server: FastifyInstance) {
  server.addHook('onRequest', async (request) => {
    await request.jwtVerify();
  });

  server.post('/:id/pcnet-actions', async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user as any;

    const bodySchema = z.object({
      action: z.enum(VALID_ACTIONS),
      status: z.enum(VALID_STATUSES).default('SOLICITADO'),
      pcnetIdentifier: z.string().min(1),
    });

    const { action, status, pcnetIdentifier } = bodySchema.parse(request.body);

    const vestige = await prisma.vestige.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, registroFav: true, material: true },
    });

    if (!vestige) {
      return reply.status(404).send({ message: 'Vestígio não encontrado' });
    }

    const log = await prisma.pcnetActionLog.create({
      data: {
        vestigeId: vestige.id,
        action,
        status,
        pcnetIdentifier,
        requestedBy: user.id,
      },
    });

    // Além do log específico do PCNET, registra também na trilha de auditoria geral,
    // para que a ação apareça junto das demais operações sobre o vestígio.
    await auditService.log({
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      action: `PCNET_${action}`,
      targetType: 'vestige',
      targetId: vestige.id,
      details: { pcnetIdentifier, status, registroFav: vestige.registroFav },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.status(201).send({
      id: String(log.id),
      action: log.action,
      status: log.status,
      pcnetIdentifier: log.pcnetIdentifier,
      requestedAt: log.requestedAt.toISOString(),
    });
  });

  server.get('/:id/pcnet-actions', async (request) => {
    const { id } = request.params as { id: string };

    const logs = await prisma.pcnetActionLog.findMany({
      where: { vestigeId: id },
      orderBy: { requestedAt: 'desc' },
      include: {
        user: { select: { name: true, email: true } },
      },
    });

    return logs.map((log: any) => ({
      id: String(log.id),
      action: log.action,
      status: log.status,
      pcnetIdentifier: log.pcnetIdentifier,
      requestedBy: log.user.name,
      requestedByEmail: log.user.email,
      requestedAt: log.requestedAt.toISOString(),
    }));
  });
}

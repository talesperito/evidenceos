import { Prisma } from '@prisma/client';
import { prisma } from '../db/connection';

interface AuditLogData {
  userId?: string;
  userEmail: string;
  userName: string;
  action: string;
  targetType?: string;
  targetId?: string;
  details?: any;
  ipAddress?: string;
  userAgent?: string;
}

// Transação das operações de custódia. O padrão do Prisma (2 s na fila, 5 s de duração) faria
// uma edição legítima falhar num pico curto; a retirada de 200 itens já precisava dos 30 s.
export const CUSTODY_TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 };

const toAuditRow = (data: AuditLogData) => ({
  userId: data.userId,
  userEmail: data.userEmail,
  userName: data.userName,
  action: data.action,
  targetType: data.targetType,
  targetId: data.targetId,
  details: data.details || {},
  ipAddress: data.ipAddress,
  userAgent: data.userAgent,
});

export const auditService = {
  async log(data: AuditLogData) {
    try {
      await prisma.auditLog.create({ data: toAuditRow(data) });
    } catch (error) {
      console.error('Falha ao gravar log de auditoria:', error);
      // Não lançamos erro aqui para não travar a operação principal se o log falhar
    }
  },

  // Para operações de custódia: grava na mesma transação da mudança e deixa o erro subir de
  // propósito. Sem o registro a mudança é desfeita — alteração de custódia sem autor não existe.
  async logInTransaction(tx: Prisma.TransactionClient, data: AuditLogData) {
    await tx.auditLog.create({ data: toAuditRow(data) });
  },
};

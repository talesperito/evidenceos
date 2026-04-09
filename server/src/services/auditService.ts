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

export const auditService = {
  async log(data: AuditLogData) {
    try {
      await prisma.auditLog.create({
        data: {
          userId: data.userId,
          userEmail: data.userEmail,
          userName: data.userName,
          action: data.action,
          targetType: data.targetType,
          targetId: data.targetId,
          details: data.details || {},
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
        },
      });
    } catch (error) {
      console.error('Falha ao gravar log de auditoria:', error);
      // Não lançamos erro aqui para não travar a operação principal se o log falhar
    }
  }
};

import { apiRequest, getApiBaseUrl } from './apiClient';
import { AuditLog, User } from '../types';

interface ApiAuditLog {
  id: string;
  userName: string;
  userEmail: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  details?: unknown;
  createdAt: string;
}

const stringifyDetails = (details: unknown) => {
  if (!details) return '';
  if (typeof details === 'string') return details;
  return JSON.stringify(details);
};

const mapLog = (log: ApiAuditLog): AuditLog => ({
  id: log.id,
  userName: log.userName,
  userEmail: log.userEmail,
  action: log.action,
  targetType: log.targetType,
  targetId: log.targetId,
  details: stringifyDetails(log.details),
  timestamp: log.createdAt,
});

export const logAction = async (user: User, action: string, details: string) => {
  await apiRequest('/api/audit', {
    method: 'POST',
    body: JSON.stringify({
      action,
      targetType: 'ui_event',
      targetId: user.id,
      details,
    }),
  });
};

export const getLogs = async (): Promise<AuditLog[]> => {
  const response = await apiRequest<{ items: ApiAuditLog[] }>('/api/audit?limit=200');
  return response.items.map(mapLog);
};

export const getAuditExportUrl = (format: 'json' | 'csv' = 'csv') =>
  `${getApiBaseUrl()}/api/audit/export?format=${format}`;

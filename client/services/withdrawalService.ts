import { apiRequest as rawApiRequest } from './apiClient';
import {
  OpenWithdrawalItem,
  WithdrawalRequest,
  WithdrawalRequestItem,
} from '../types';

// Quando o navegador não chega ao servidor (sem rede, servidor fora do ar), o fetch lança TypeError
// com texto do próprio navegador, em inglês ("Failed to fetch", "NetworkError when attempting to
// fetch resource"). Aqui ele vira uma mensagem que diz o que importa para quem está na tela.
// A conversão fica só em volta da chamada: um erro ao montar a resposta nunca é tratado como falha de rede.
const apiRequest = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  try {
    return await rawApiRequest<T>(path, init);
  } catch (err) {
    if (err instanceof TypeError) {
      const leitura = !init.method || init.method === 'GET';
      throw new Error(leitura
        ? 'Não foi possível carregar — verifique a conexão e tente de novo.'
        : 'Nada foi registrado — verifique a conexão e tente de novo.');
    }
    throw err;
  }
};

// Solicitações de retirada. Plano: docs/plans/2026-08-25-solicitacao-retirada.md (Partes 4 e 5.3).
const BASE_PATH = '/api/withdrawal-requests';

interface ApiWithdrawalItem {
  id: string;
  vestigeId: string;
  reason: string;
  reasonDetail?: string | null;
  material?: string | null;
  registroFav?: string | null;
  requisicoes?: string[] | null;
  municipio?: string | null;
  involucros?: string[] | null;
  destinacao?: string | null;
  vestigeDeleted?: boolean;
}

interface ApiWithdrawalRequest {
  id: string;
  scheduledFor: string;
  status: string;
  notes?: string | null;
  deadlineOverrideReason?: string | null;
  requestedBy: string;
  requesterName?: string | null;
  requesterEmail?: string | null;
  requestedAt: string;
  statusChangedByName?: string | null;
  statusChangedAt?: string | null;
  statusNote?: string | null;
  items?: ApiWithdrawalItem[] | null;
}

// Tradução registroFav → fav, igual ao mapVestige do dataService.
const mapItem = (item: ApiWithdrawalItem): WithdrawalRequestItem => ({
  id: item.id,
  vestigeId: item.vestigeId,
  reason: item.reason, // fica em código; quem traduz é getWithdrawalReasonLabel na hora de exibir
  reasonDetail: item.reasonDetail ?? null,
  material: item.material ?? null,
  fav: item.registroFav ?? '',
  requisicoes: item.requisicoes ?? [],
  involucros: item.involucros ?? [],
  municipio: item.municipio ?? null,
  destinacao: item.destinacao ?? null,
  vestigeDeleted: Boolean(item.vestigeDeleted),
});

const mapRequest = (request: ApiWithdrawalRequest): WithdrawalRequest => ({
  id: request.id,
  scheduledFor: request.scheduledFor,
  status: request.status,
  notes: request.notes ?? null,
  deadlineOverrideReason: request.deadlineOverrideReason ?? null,
  requestedBy: request.requestedBy,
  requesterName: request.requesterName ?? null,
  requesterEmail: request.requesterEmail ?? null,
  requestedAt: request.requestedAt,
  statusChangedByName: request.statusChangedByName ?? null,
  statusChangedAt: request.statusChangedAt ?? null,
  statusNote: request.statusNote ?? null,
  items: (request.items ?? []).map(mapItem),
});

export interface CreateWithdrawalPayload {
  scheduledFor: string; // toISOString()
  notes?: string;
  deadlineOverrideReason?: string;
  items: { vestigeId: string; reason: string; reasonDetail?: string }[];
}

export interface WithdrawalListFilters {
  status?: string;
  from?: string; // ISO
  to?: string;   // ISO
  limit?: number;
}

export interface WithdrawalListResult {
  items: WithdrawalRequest[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export const createWithdrawalRequest = async (payload: CreateWithdrawalPayload): Promise<WithdrawalRequest> =>
  mapRequest(await apiRequest<ApiWithdrawalRequest>(BASE_PATH, {
    method: 'POST',
    body: JSON.stringify(payload),
  }));

export const listWithdrawalRequests = async (filters: WithdrawalListFilters = {}): Promise<WithdrawalListResult> => {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  params.set('limit', String(filters.limit ?? 200));

  const response = await apiRequest<{ items: ApiWithdrawalRequest[]; meta: WithdrawalListResult['meta'] }>(
    `${BASE_PATH}?${params.toString()}`,
  );
  return { items: response.items.map(mapRequest), meta: response.meta };
};

export const getWithdrawalRequest = async (id: string): Promise<WithdrawalRequest> =>
  mapRequest(await apiRequest<ApiWithdrawalRequest>(`${BASE_PATH}/${encodeURIComponent(id)}`));

export const listOpenWithdrawalItems = (): Promise<OpenWithdrawalItem[]> =>
  apiRequest<OpenWithdrawalItem[]>(`${BASE_PATH}/open-items`);

// Só encerra sem movimentar vestígio. Concluir é pelo completeWithdrawal.
export const updateWithdrawalStatus = async (
  id: string,
  status: 'CANCELADA' | 'NAO_COMPARECEU',
  statusNote?: string,
): Promise<WithdrawalRequest> =>
  mapRequest(await apiRequest<ApiWithdrawalRequest>(`${BASE_PATH}/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, statusNote }),
  }));

// Conclui a solicitação E move para RETIRADO os vestígios informados (só os que saíram de fato).
export const completeWithdrawal = async (
  id: string,
  withdrawnVestigeIds: string[],
  statusNote?: string,
): Promise<WithdrawalRequest> =>
  mapRequest(await apiRequest<ApiWithdrawalRequest>(`${BASE_PATH}/${encodeURIComponent(id)}/complete`, {
    method: 'POST',
    body: JSON.stringify({ withdrawnVestigeIds, statusNote }),
  }));

// "26/08/2026 às 14:00". O backend devolve ISO em UTC; quem converte para o fuso de quem olha é o navegador.
export const formatScheduledFull = (iso: string): string => {
  const date = new Date(iso);
  return `${date.toLocaleDateString('pt-BR')} às ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
};

// "26/08 14h" ou "26/08 14h30" — cabe no selo do card.
export const formatScheduledShort = (iso: string): string => {
  const date = new Date(iso);
  const dia = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const minutos = date.getMinutes();
  return `${dia} ${date.getHours()}h${minutos ? String(minutos).padStart(2, '0') : ''}`;
};

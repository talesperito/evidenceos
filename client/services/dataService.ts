import { apiRequest } from './apiClient';
import { Vestige, VestigeItem } from '../types';

interface ApiCategory {
  id: number;
  name: string;
}

interface ApiVestige {
  id: string;
  categoryId: number;
  registroFav?: string | null;
  requisicoes?: VestigeItem[] | null;
  involucros?: VestigeItem[] | null;
  material: string;
  municipio: string;
  dataColeta?: string | null;
  observacoes?: string | null;
  category?: ApiCategory | null;
  // NOVOS CAMPOS
  estadoConservacao: string;
  destinacao: string;
  destinacaoObs?: string | null;
  destinacaoChangedBy?: string | null;
  destinacaoChangedAt?: string | null;
}

const formatDate = (value?: string | null) => {
  if (!value) return 'N/I';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/I';
  return date.toLocaleDateString('pt-BR');
};

const parseDate = (value?: string) => {
  if (!value || value === 'N/I') return undefined;
  const parts = value.split('/');
  if (parts.length !== 3) return undefined;
  const [day, month, year] = parts;
  return new Date(Number(year), Number(month) - 1, Number(day)).toISOString();
};

const mapVestige = (item: ApiVestige): Vestige => ({
  id: item.id,
  categoryId: item.categoryId,
  material: item.material,
  requisicoes: (item.requisicoes || []).map(({ numero, motivo }) => ({ numero, motivo })),
  involucros: (item.involucros || []).map(({ numero, motivo }) => ({ numero, motivo })),
  fav: item.registroFav || '',
  municipio: item.municipio || 'Lavras',
  data: formatDate(item.dataColeta),
  planilhaOrigem: item.category?.name || 'Sem categoria',
  observacoes: item.observacoes || '',
  // NOVOS CAMPOS
  estadoConservacao: item.estadoConservacao || 'NAO_AVALIADO',
  destinacao: item.destinacao || 'NAO_INICIADO',
  destinacaoObs: item.destinacaoObs || undefined,
  destinacaoChangedBy: item.destinacaoChangedBy || undefined,
  destinacaoChangedAt: item.destinacaoChangedAt || undefined,
});

let categoryCache: ApiCategory[] | null = null;

export const getCategories = async (): Promise<ApiCategory[]> => {
  if (categoryCache) return categoryCache;
  categoryCache = await apiRequest<ApiCategory[]>('/api/categories');
  return categoryCache;
};

const resolveCategoryId = async (vestige: Partial<Vestige>) => {
  if (vestige.categoryId) return vestige.categoryId;
  const categories = await getCategories();
  const match = categories.find((category) => category.name === vestige.planilhaOrigem);
  if (!match) {
    throw new Error('Categoria/origem inválida para o vestígio.');
  }
  return match.id;
};

// Só número e motivo seguem para o servidor (marcas de tela como `novo` ficam de fora),
// e linhas deixadas em branco no formulário são descartadas.
const buildItemsPayload = (items?: VestigeItem[]) =>
  (items || [])
    .map(({ numero, motivo }) => ({ numero: numero.trim(), motivo: motivo || undefined }))
    .filter((item) => item.numero.length > 0);

const buildPayload = async (vestige: Partial<Vestige>) => ({
  material: vestige.material,
  categoryId: await resolveCategoryId(vestige),
  registroFav: vestige.fav || undefined,
  requisicoes: buildItemsPayload(vestige.requisicoes),
  involucros: buildItemsPayload(vestige.involucros),
  municipio: vestige.municipio || 'Lavras',
  dataColeta: parseDate(vestige.data),
  observacoes: vestige.observacoes || undefined,
  // NOVOS CAMPOS
  estadoConservacao: vestige.estadoConservacao || undefined,
  destinacao: vestige.destinacao || undefined,
  destinacaoObs: vestige.destinacaoObs || undefined,
});

export const fetchAllVestiges = async (): Promise<Vestige[]> => {
  const limit = 500;
  let page = 1;
  let totalPages = 1;
  const items: Vestige[] = [];

  while (page <= totalPages) {
    const response = await apiRequest<{ items: ApiVestige[]; meta: { totalPages: number } }>(
      `/api/vestiges?page=${page}&limit=${limit}`,
    );
    items.push(...response.items.map(mapVestige));
    totalPages = response.meta.totalPages || 1;
    page += 1;
  }

  return items;
};

export const createVestige = async (vestige: Partial<Vestige>): Promise<Vestige> => {
  const created = await apiRequest<ApiVestige>('/api/vestiges', {
    method: 'POST',
    body: JSON.stringify(await buildPayload(vestige)),
  });
  return mapVestige(created);
};

export const updateVestige = async (id: string, vestige: Partial<Vestige>): Promise<Vestige> => {
  const updated = await apiRequest<ApiVestige>(`/api/vestiges/${id}`, {
    method: 'PUT',
    body: JSON.stringify(await buildPayload(vestige)),
  });
  return mapVestige(updated);
};

export const deleteVestige = async (id: string): Promise<void> => {
  await apiRequest(`/api/vestiges/${id}`, { method: 'DELETE' });
};

export interface DestinationLogEntry {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  observation: string | null;
  changedBy: string;
  changedByEmail: string;
  changedAt: string;
}

export const fetchDestinationHistory = async (vestigeId: string): Promise<DestinationLogEntry[]> => {
  return apiRequest<DestinationLogEntry[]>(`/api/vestiges/${vestigeId}/destination-history`);
};

// --- Integração PCNET ---
// Ver docs/plans/2026-07-24-integracao-pcnet.md.
// O EvidenceOS apenas abre a tela correspondente do PCNET em outra aba, reaproveitando a sessão
// que o usuário já tem aberta lá. Não autentica, não preenche e não salva nada no PCNET — por isso
// o registro abaixo é sempre "SOLICITADO": sabemos que a tela foi aberta, não o que o usuário fez nela.
export type PcnetAction = 'VIEW_FAV' | 'MOVIMENTAR';

const PCNET_BASE_URL = 'https://www.pcnet.mg.gov.br/PCnet';

export const buildPcnetUrl = (action: PcnetAction, fav: string): string => {
  const identifier = encodeURIComponent(fav.trim());
  return action === 'VIEW_FAV'
    ? `${PCNET_BASE_URL}/cadeiacustodiasel.do?evento=gerarFav&idMaterial=${identifier}`
    : `${PCNET_BASE_URL}/sobcustodiaman.do?evento=x&idMaterialCustodiado=${identifier}`;
};

export const logPcnetAction = async (
  vestigeId: string,
  action: PcnetAction,
  pcnetIdentifier: string,
): Promise<void> => {
  await apiRequest(`/api/vestiges/${vestigeId}/pcnet-actions`, {
    method: 'POST',
    body: JSON.stringify({ action, status: 'SOLICITADO', pcnetIdentifier }),
  });
};

export interface DuplicateAlert {
  field: 'involucro' | 'requisicao';
  value: string;
  vestigeId: string;
  material: string;
  registroFav: string | null;
}

export const checkDuplicate = async (
  involucros?: string[],
  requisicoes?: string[],
  excludeId?: string,
): Promise<DuplicateAlert[]> => {
  const params = new URLSearchParams();
  const append = (key: string, numeros?: string[]) =>
    (numeros || [])
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .forEach((numero) => params.append(key, numero));
  append('involucro', involucros);
  append('requisicao', requisicoes);
  if (excludeId) params.append('excludeId', excludeId);

  const result = await apiRequest<{ duplicates: DuplicateAlert[] }>(
    `/api/vestiges/check-duplicate?${params.toString()}`,
  );
  return result.duplicates;
};

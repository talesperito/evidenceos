import { apiRequest } from './apiClient';
import { Vestige } from '../types';

interface ApiCategory {
  id: number;
  name: string;
}

interface ApiVestige {
  id: string;
  categoryId: number;
  registroFav?: string | null;
  requisicao?: string | null;
  involucro?: string | null;
  material: string;
  municipio: string;
  dataColeta?: string | null;
  observacoes?: string | null;
  category?: ApiCategory | null;
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
  requisicao: item.requisicao || '',
  involucro: item.involucro || '',
  fav: item.registroFav || '',
  municipio: item.municipio || 'Lavras',
  data: formatDate(item.dataColeta),
  planilhaOrigem: item.category?.name || 'Sem categoria',
  observacoes: item.observacoes || '',
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

const buildPayload = async (vestige: Partial<Vestige>) => ({
  material: vestige.material,
  categoryId: await resolveCategoryId(vestige),
  registroFav: vestige.fav || undefined,
  requisicao: vestige.requisicao || undefined,
  involucro: vestige.involucro || undefined,
  municipio: vestige.municipio || 'Lavras',
  dataColeta: parseDate(vestige.data),
  observacoes: vestige.observacoes || undefined,
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

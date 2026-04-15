export type UserRole = 'ADMIN' | 'PERITO' | 'VISUALIZADOR';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isAdmin: boolean;
  active?: boolean;
  createdAt?: string;
  lastLoginAt?: string | null;
}

export interface AuthorizedUser extends User {}

export const getRoleLabel = (role: UserRole): string => {
  switch (role) {
    case 'ADMIN':
      return 'Administrador';
    case 'PERITO':
      return 'Perito';
    case 'VISUALIZADOR':
      return 'Visualizador';
  }
};

export const canCreateVestige = (user: Pick<User, 'role'>): boolean =>
  user.role === 'ADMIN' || user.role === 'PERITO';

export const canEditVestige = (user: Pick<User, 'role'>): boolean =>
  user.role === 'ADMIN' || user.role === 'PERITO';

export const canDeleteVestige = (user: Pick<User, 'role'>): boolean =>
  user.role === 'ADMIN';

export const canManageUsers = (user: Pick<User, 'role'>): boolean =>
  user.role === 'ADMIN' || user.role === 'PERITO';

export const canManageStandards = (user: Pick<User, 'role'>): boolean =>
  user.role === 'ADMIN' || user.role === 'PERITO';

export const canViewAuditLogs = (user: Pick<User, 'role'>): boolean =>
  user.role === 'ADMIN';

export interface Vestige {
  id: string;
  material: string;
  requisicao: string;
  involucro: string;
  fav: string;
  municipio: string;
  data: string;
  planilhaOrigem: string;
  categoryId?: number;
  observacoes?: string;
  // NOVOS CAMPOS
  estadoConservacao: string;
  destinacao: string;
  destinacaoObs?: string;
  destinacaoChangedBy?: string;
  destinacaoChangedAt?: string;
}

export interface CategoryStats {
  total: number;
  missingRequisition: number;
  over1Year: number;
  over2Years: number;
  missingReqOver1Year: number;
  missingReqOver2Years: number;
  missingReqOver3Years: number;
  oldestItemDate: Date | null;
  history: {
    y2022: number;
    y2023: number;
    y2024_s1: number;
    y2024_s2: number;
    y2025_s1: number;
    y2025_s2: number;
  };
}

export interface ReportData {
  generatedAt: string;
  totalGlobal: number;
  topCritical: Array<{ category: string; count: number }>;
  byCategory: Record<string, CategoryStats>;
}

export interface GroundingChunk {
  web?: {
    uri: string;
    title: string;
  };
}

export interface AuditLog {
  id: string;
  userName: string;
  userEmail: string;
  action: string;
  details: string;
  timestamp: string;
  targetType?: string | null;
  targetId?: string | null;
}

export interface SearchFilters {
  term: string;
  field: 'all' | 'fav' | 'requisicao' | 'involucro';
  municipio?: string;
  origin?: string;
  startDate?: string;
  endDate?: string;
  // NOVOS FILTROS
  estadoConservacao?: string;
  destinacao?: string;
}

// === Estado de Conservação ===
export const ESTADO_CONSERVACAO_OPTIONS = [
  { value: 'NAO_AVALIADO', label: 'Não avaliado' },
  { value: 'NOVO_LACRADO', label: 'Novo/Lacrado' },
  { value: 'SEMI_NOVO', label: 'Semi-novo' },
  { value: 'USADO_FUNCIONANDO', label: 'Usado em funcionamento' },
  { value: 'DANIFICADO', label: 'Danificado' },
  { value: 'SEM_CONDICOES', label: 'Sem condições de avaliação' },
] as const;

export type EstadoConservacao = typeof ESTADO_CONSERVACAO_OPTIONS[number]['value'];

export const getEstadoConservacaoLabel = (value: string): string =>
  ESTADO_CONSERVACAO_OPTIONS.find(o => o.value === value)?.label || value;

// === Destinação ===
export const DESTINACAO_OPTIONS = [
  { value: 'NAO_INICIADO', label: 'Não iniciado' },
  { value: 'SOLICITADO', label: 'Solicitado' },
  { value: 'FINALIZADO', label: 'Finalizado' },
] as const;

export type Destinacao = typeof DESTINACAO_OPTIONS[number]['value'];

export const getDestinacaoLabel = (value: string): string =>
  DESTINACAO_OPTIONS.find(o => o.value === value)?.label || value;

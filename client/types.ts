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
}

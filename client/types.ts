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

// Invólucro ou requisição: o item guarda só o número e o motivo da inclusão.
export interface VestigeItem {
  numero: string;
  motivo: string;
}

export interface Vestige {
  id: string;
  material: string;
  requisicoes: VestigeItem[];
  involucros: VestigeItem[];
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
// Duas situações apenas, de propósito: o que importa na listagem é saber se o vestígio
// ainda está fisicamente na URC. O detalhe de quem retirou, quando e para quê já fica
// registrado na FAV do PCNET — não faz sentido duplicar isso aqui.
export const DESTINACAO_OPTIONS = [
  { value: 'NAO_INICIADO', label: 'Na URC' },
  { value: 'RETIRADO', label: 'Retirado (ver FAV)' },
] as const;

export type Destinacao = typeof DESTINACAO_OPTIONS[number]['value'];

// Valores antigos, fora do seletor mas ainda exibíveis: registros gravados antes desta
// simplificação continuam existindo no banco e precisam de rótulo legível.
const DESTINACAO_LEGADO: Record<string, string> = {
  SOLICITADO: 'Solicitado (legado)',
  FINALIZADO: 'Finalizado (legado)',
};

export const getDestinacaoLabel = (value: string): string =>
  DESTINACAO_OPTIONS.find(o => o.value === value)?.label
  || DESTINACAO_LEGADO[value]
  || value;

// Vestígio que não está mais fisicamente na URC. Usado para o alerta visual do card.
export const estaForaDaUrc = (destinacao: string): boolean =>
  destinacao === 'RETIRADO' || destinacao === 'FINALIZADO';

// === Motivo de inclusão de invólucro / requisição ===
// No cadastro tudo entra como "Registro inicial", sem pergunta. Na edição, incluir um item
// novo exige um dos motivos abaixo. Espelha MOTIVOS_EDICAO em server/src/services/vestigeItemService.ts.
// Não há "Outro": sem campo de texto ele não diria nada. Caso novo entra na lista (aqui e lá).
export const MOTIVOS_INVOLUCRO = [
  { value: 'DIVISAO_MATERIAL', label: 'Divisão do material' },
  { value: 'ROMPIMENTO_LACRE', label: 'Rompimento de lacre para exame' },
  { value: 'EMBALAGEM_DANIFICADA', label: 'Embalagem danificada' },
  { value: 'CORRECAO_CADASTRO', label: 'Correção de cadastro' },
] as const;

export const MOTIVOS_REQUISICAO = [
  { value: 'NOVO_EXAME', label: 'Novo exame pericial' },
  { value: 'EXAME_COMPLEMENTAR', label: 'Exame complementar' },
  { value: 'REITERACAO_AUTORIDADE', label: 'Reiteração/substituição pela autoridade' },
  { value: 'CORRECAO_CADASTRO', label: 'Correção de cadastro' },
] as const;

// Gravados pelo sistema, nunca escolhidos na tela.
const MOTIVOS_AUTOMATICOS: Record<string, string> = {
  REGISTRO_INICIAL: 'Registro inicial',
  LEGADO: 'Legado',
};

export const getMotivoLabel = (value: string): string =>
  [...MOTIVOS_INVOLUCRO, ...MOTIVOS_REQUISICAO].find(o => o.value === value)?.label
  || MOTIVOS_AUTOMATICOS[value]
  || value;

export const numerosDe = (items?: VestigeItem[] | null): string[] =>
  (items || []).map((item) => item.numero);

// === Solicitação de Retirada ===
// Plano: docs/plans/2026-08-25-solicitacao-retirada.md. O banco guarda o `value` (código); a tela
// mostra o `label`. Os `value` espelham VALID_REASONS em server/src/routes/withdrawalRoutes.ts —
// mexeu aqui, mexa lá. Mesmo padrão de ESTADO_CONSERVACAO_OPTIONS e DESTINACAO_OPTIONS.
export const WITHDRAWAL_REASONS = [
  { value: 'DESTRUICAO', label: 'Destruição' },
  { value: 'RESTITUICAO', label: 'Restituição' },
  { value: 'ANALISE_INVESTIGACAO', label: 'Análise pela Investigação' },
  { value: 'SOLICITACAO_JUDICIAL', label: 'Solicitação Judicial' },
  { value: 'OUTROS', label: 'Outros' },
] as const;

export type WithdrawalReason = typeof WITHDRAWAL_REASONS[number]['value'];

export const getWithdrawalReasonLabel = (value: string): string =>
  WITHDRAWAL_REASONS.find((o) => o.value === value)?.label || value;

export const WITHDRAWAL_STATUS_OPTIONS = [
  { value: 'SOLICITADA', label: 'Agendada' },
  { value: 'CONCLUIDA', label: 'Concluída' },
  { value: 'CANCELADA', label: 'Cancelada' },
  { value: 'NAO_COMPARECEU', label: 'Não compareceu' },
] as const;

export type WithdrawalStatus = typeof WITHDRAWAL_STATUS_OPTIONS[number]['value'];

export const getWithdrawalStatusLabel = (value: string): string =>
  WITHDRAWAL_STATUS_OPTIONS.find((o) => o.value === value)?.label || value;

export interface WithdrawalRequestItem {
  id: string;                  // BigInt do banco, já convertido para string pela API
  vestigeId: string;
  reason: string;              // CÓDIGO (ex.: 'ANALISE_INVESTIGACAO'). Exibir com getWithdrawalReasonLabel().
  reasonDetail: string | null;
  material: string | null;
  fav: string;                 // ← vem de registroFav
  // Só os NÚMEROS dos itens ativos. Atenção: aqui é string[], diferente de
  // Vestige.requisicoes / Vestige.involucros, que são VestigeItem[] (número + motivo).
  requisicoes: string[];
  involucros: string[];
  municipio: string | null;
  destinacao: string | null;   // situação ATUAL do vestígio — o painel mostra quem já saiu da URC
  vestigeDeleted: boolean;
}

export interface WithdrawalRequest {
  id: string;
  scheduledFor: string;        // ISO
  status: string;
  notes: string | null;
  // Preenchido só quando um ADMIN agendou com menos de 24h: a solicitação furou o prazo.
  deadlineOverrideReason: string | null;
  requestedBy: string;
  requesterName: string | null;
  requesterEmail: string | null;
  requestedAt: string;
  statusChangedByName: string | null;
  statusChangedAt: string | null;
  statusNote: string | null;
  items: WithdrawalRequestItem[];
}

export interface OpenWithdrawalItem {
  vestigeId: string;
  requestId: string;
  scheduledFor: string;
  requesterName: string;
}

// Mudar status e registrar a retirada. Todos os perfis podem agendar e ver o painel.
export const canManageWithdrawals = (user: Pick<User, 'role'>): boolean =>
  user.role === 'ADMIN' || user.role === 'PERITO';

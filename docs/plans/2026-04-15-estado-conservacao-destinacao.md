# Feature: Estado de Conservação & Destinação de Vestígios

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Adicionar dois campos parametrizados a cada vestígio — "Estado de Conservação" (condição física) e "Destinação" (fluxo de saída) — com tabela de histórico de transições para rastreabilidade forense.

**Architecture:** Abordagem B — Colunas diretas na tabela `vestiges` para acesso rápido ao estado atual, combinadas com uma tabela `vestige_destination_logs` que registra cada transição de destinação com timestamp, usuário e observação automáticos. Os valores são controlados por constantes (enum lógico), não ENUMs de banco.

**Tech Stack:** Prisma ORM, PostgreSQL, Fastify + Zod (backend), React + TypeScript (frontend)

---

## Contexto e Decisões de Design

### Valores Controlados

**Estado de Conservação** (`estado_conservacao`):

| Valor no Banco       | Label na UI                    |
|----------------------|--------------------------------|
| `NAO_AVALIADO`       | Não avaliado                   |
| `NOVO_LACRADO`       | Novo/Lacrado                   |
| `SEMI_NOVO`          | Semi-novo                      |
| `USADO_FUNCIONANDO`  | Usado em funcionamento         |
| `DANIFICADO`         | Danificado                     |
| `SEM_CONDICOES`      | Sem condições de avaliação     |

**Destinação** (`destinacao`):

| Valor no Banco   | Label na UI   | Comportamento                                                |
|------------------|---------------|--------------------------------------------------------------|
| `NAO_INICIADO`   | Não iniciado  | Padrão. Sem campo extra.                                     |
| `SOLICITADO`     | Solicitado    | Abre campo de observação (quem solicitou, motivo). Sistema registra data/usuário automaticamente. |
| `FINALIZADO`     | Finalizado    | Abre campo de observação (dados da conclusão). Sistema registra data/usuário automaticamente.     |

### Permissões

| Ação                          | ADMIN | PERITO | VISUALIZADOR |
|-------------------------------|-------|--------|--------------|
| Alterar Estado de Conservação | ✅     | ✅      | ❌            |
| Alterar Destinação            | ✅     | ✅      | ❌            |
| Filtrar por esses campos      | ✅     | ✅      | ✅            |
| Ver histórico de transições   | ✅     | ✅      | ✅            |

### Migration de Dados Existentes

- Todos os vestígios existentes recebem `estado_conservacao = 'NAO_AVALIADO'` e `destinacao = 'NAO_INICIADO'` via `@default` do Prisma.
- Não há registros na tabela de logs para dados legados (começam vazios).

---

## Arquivos Impactados (Visão Geral)

```
server/prisma/schema.prisma          → Novos campos + nova tabela
server/src/routes/vestigeRoutes.ts   → Validação Zod + lógica de transição
client/types.ts                      → Interface Vestige + constantes de enum
client/services/dataService.ts       → Mapeamento API → Frontend
client/components/VestigeFormModal.tsx→ Campos de select para conservação
client/components/VestigeCard.tsx     → Exibição dos novos campos
client/components/SearchBar.tsx       → Filtros avançados
client/hooks/useVestiges.ts          → Lógica de filtro local
```

---

## Task 1: Atualizar o Schema Prisma

**Files:**
- Modify: `server/prisma/schema.prisma:47-78` (model Vestige)
- Modify: `server/prisma/schema.prisma:10-30` (model User — nova relação)
- Create: nova seção no schema (model VestigeDestinationLog)

**Step 1: Adicionar campos ao model Vestige**

Em `server/prisma/schema.prisma`, dentro do `model Vestige`, adicionar após o campo `observacoes`:

```prisma
  // Estado de Conservação e Destinação
  estadoConservacao   String    @default("NAO_AVALIADO") @map("estado_conservacao")
  destinacao          String    @default("NAO_INICIADO")
  destinacaoObs       String?   @map("destinacao_obs")
  destinacaoChangedBy String?   @map("destinacao_changed_by")
  destinacaoChangedAt DateTime? @map("destinacao_changed_at")
```

Adicionar na seção de Relations do Vestige:

```prisma
  destinationLogs    VestigeDestinationLog[]
  destinationChanger User? @relation("DestinationChangedBy", fields: [destinacaoChangedBy], references: [id])
```

**Step 2: Adicionar relação no model User**

No `model User`, adicionar na seção de Relations:

```prisma
  destinationChanges  VestigeDestinationLog[]
  changedDestinations Vestige[] @relation("DestinationChangedBy")
```

**Step 3: Criar model VestigeDestinationLog**

Adicionar após o model Vestige:

```prisma
model VestigeDestinationLog {
  id          BigInt   @id @default(autoincrement())
  vestigeId   String   @map("vestige_id")
  fromStatus  String?  @map("from_status")
  toStatus    String   @map("to_status")
  observation String?
  changedBy   String   @map("changed_by")
  changedAt   DateTime @default(now()) @map("changed_at")

  // Relations
  vestige     Vestige  @relation(fields: [vestigeId], references: [id])
  user        User     @relation(fields: [changedBy], references: [id])

  @@map("vestige_destination_logs")
  @@schema("public")
}
```

**Step 4: Gerar e aplicar migration**

```bash
cd server
npx prisma migrate dev --name add_conservacao_destinacao
```

Expected: Migration criada com sucesso, banco atualizado. Todos os vestígios existentes recebem os valores padrão.

**Step 5: Commit**

```bash
git add server/prisma/
git commit -m "feat(db): add estado_conservacao, destinacao fields and destination log table"
```

---

## Task 2: Criar Constantes Compartilhadas de Enum

**Files:**
- Modify: `client/types.ts`

**Step 1: Adicionar constantes e tipos**

No final de `client/types.ts`, adicionar:

```typescript
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
```

**Step 2: Atualizar interface Vestige**

Na interface `Vestige` existente (linha ~45), adicionar os novos campos:

```typescript
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
```

**Step 3: Atualizar interface SearchFilters**

Na interface `SearchFilters` existente (linha ~102), adicionar:

```typescript
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
```

**Step 4: Commit**

```bash
git add client/types.ts
git commit -m "feat(types): add conservation state and destination types and constants"
```

---

## Task 3: Atualizar o Backend — Validação e Rotas

**Files:**
- Modify: `server/src/routes/vestigeRoutes.ts`

**Step 1: Adicionar constantes de validação no topo do arquivo**

Após os imports, adicionar:

```typescript
const VALID_ESTADO_CONSERVACAO = [
  'NAO_AVALIADO', 'NOVO_LACRADO', 'SEMI_NOVO',
  'USADO_FUNCIONANDO', 'DANIFICADO', 'SEM_CONDICOES'
];

const VALID_DESTINACAO = ['NAO_INICIADO', 'SOLICITADO', 'FINALIZADO'];
```

**Step 2: Atualizar o schema de criação (POST)**

No `vestigeSchema` do `server.post('/')` (~linha 146), adicionar:

```typescript
const vestigeSchema = z.object({
  material: z.string().min(1),
  categoryId: z.number(),
  registroFav: z.string().optional(),
  requisicao: z.string().optional(),
  involucro: z.string().optional(),
  municipio: z.string().default('Lavras'),
  dataColeta: z.string().optional().transform(v => v ? new Date(v) : null),
  observacoes: z.string().optional(),
  // NOVOS CAMPOS
  estadoConservacao: z.enum(VALID_ESTADO_CONSERVACAO as [string, ...string[]]).default('NAO_AVALIADO'),
  destinacao: z.enum(VALID_DESTINACAO as [string, ...string[]]).default('NAO_INICIADO'),
});
```

**Step 3: Atualizar o schema de edição (PUT)**

No `updateSchema` do `server.put('/:id')` (~linha 186), adicionar os mesmos campos como opcionais:

```typescript
const updateSchema = z.object({
  material: z.string().optional(),
  categoryId: z.number().optional(),
  registroFav: z.string().optional(),
  requisicao: z.string().optional(),
  involucro: z.string().optional(),
  municipio: z.string().optional(),
  dataColeta: z.string().optional().transform(v => v ? new Date(v) : null),
  observacoes: z.string().optional(),
  // NOVOS CAMPOS
  estadoConservacao: z.enum(VALID_ESTADO_CONSERVACAO as [string, ...string[]]).optional(),
  destinacao: z.enum(VALID_DESTINACAO as [string, ...string[]]).optional(),
  destinacaoObs: z.string().optional(),
});
```

**Step 4: Adicionar lógica de transição de destinação no PUT**

No handler do `server.put('/:id')`, ANTES do `prisma.vestige.update(...)`, adicionar lógica para detectar mudança de destinação e criar registro no log:

```typescript
// Dentro do handler PUT, após parse do body:
const data = updateSchema.parse(request.body);

// Se houve mudança de destinação, registrar no log
if (data.destinacao) {
  const current = await prisma.vestige.findUnique({
    where: { id },
    select: { destinacao: true },
  });

  if (current && current.destinacao !== data.destinacao) {
    await prisma.vestigeDestinationLog.create({
      data: {
        vestigeId: id,
        fromStatus: current.destinacao,
        toStatus: data.destinacao,
        observation: data.destinacaoObs || null,
        changedBy: user.id,
      },
    });

    // Preencher campos automáticos de quem/quando mudou
    (data as any).destinacaoChangedBy = user.id;
    (data as any).destinacaoChangedAt = new Date();
  }
}

const vestige = await prisma.vestige.update({
  where: { id },
  data: {
    ...data,
    updatedBy: user.id,
  },
});
```

> **ATENÇÃO:** O campo `destinacaoObs` NÃO deve ser removido do spread `...data` que vai para o update — ele é salvo no vestígio como observação atual, E TAMBÉM no log como registro histórico.

**Step 5: Adicionar rota para consultar histórico de destinação**

Adicionar nova rota GET antes do DELETE:

```typescript
server.get('/:id/destination-history', async (request, reply) => {
  const { id } = request.params as { id: string };

  const logs = await prisma.vestigeDestinationLog.findMany({
    where: { vestigeId: id },
    orderBy: { changedAt: 'desc' },
    include: {
      user: { select: { name: true, email: true } },
    },
  });

  return logs.map(log => ({
    id: String(log.id),
    fromStatus: log.fromStatus,
    toStatus: log.toStatus,
    observation: log.observation,
    changedBy: log.user.name,
    changedByEmail: log.user.email,
    changedAt: log.changedAt.toISOString(),
  }));
});
```

**Step 6: Atualizar o `buildWhereClause` para suportar filtros**

Atualizar a função `buildWhereClause` (~linha 14) e o `querySchema` para aceitar os novos filtros:

```typescript
const querySchema = z.object({
  page: z.string().optional().transform(v => Number(v) || 1),
  limit: z.string().optional().transform(v => Number(v) || 50),
  category: z.string().optional(),
  search: z.string().optional(),
  // NOVOS FILTROS
  estadoConservacao: z.string().optional(),
  destinacao: z.string().optional(),
});

const buildWhereClause = (category?: string, search?: string, estadoConservacao?: string, destinacao?: string) => {
  const where: Record<string, unknown> = { deletedAt: null };
  if (category) where.categoryId = Number(category);
  if (estadoConservacao) where.estadoConservacao = estadoConservacao;
  if (destinacao) where.destinacao = destinacao;
  if (search) {
    where.OR = [
      { material: { contains: search, mode: 'insensitive' } },
      { registroFav: { contains: search, mode: 'insensitive' } },
      { requisicao: { contains: search, mode: 'insensitive' } },
      { involucro: { contains: search, mode: 'insensitive' } },
    ];
  }
  return where;
};
```

Atualizar as chamadas `buildWhereClause` nos handlers GET `/` e `/search` para passar os novos parâmetros:

```typescript
const { page, limit, category, search, estadoConservacao, destinacao } = querySchema.parse(request.query);
const where = buildWhereClause(category, search, estadoConservacao, destinacao);
```

**Step 7: Commit**

```bash
git add server/src/routes/vestigeRoutes.ts
git commit -m "feat(api): add conservation state, destination fields with transition logging"
```

---

## Task 4: Atualizar o Data Service (Frontend → API)

**Files:**
- Modify: `client/services/dataService.ts`

**Step 1: Atualizar interface `ApiVestige`**

Adicionar os novos campos (~linha 9):

```typescript
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
  // NOVOS CAMPOS
  estadoConservacao: string;
  destinacao: string;
  destinacaoObs?: string | null;
  destinacaoChangedBy?: string | null;
  destinacaoChangedAt?: string | null;
}
```

**Step 2: Atualizar função `mapVestige`**

Adicionar mapeamento dos novos campos (~linha 37):

```typescript
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
  // NOVOS CAMPOS
  estadoConservacao: item.estadoConservacao || 'NAO_AVALIADO',
  destinacao: item.destinacao || 'NAO_INICIADO',
  destinacaoObs: item.destinacaoObs || undefined,
  destinacaoChangedBy: item.destinacaoChangedBy || undefined,
  destinacaoChangedAt: item.destinacaoChangedAt || undefined,
});
```

**Step 3: Atualizar função `buildPayload`**

Adicionar campos ao payload (~linha 68):

```typescript
const buildPayload = async (vestige: Partial<Vestige>) => ({
  material: vestige.material,
  categoryId: await resolveCategoryId(vestige),
  registroFav: vestige.fav || undefined,
  requisicao: vestige.requisicao || undefined,
  involucro: vestige.involucro || undefined,
  municipio: vestige.municipio || 'Lavras',
  dataColeta: parseDate(vestige.data),
  observacoes: vestige.observacoes || undefined,
  // NOVOS CAMPOS
  estadoConservacao: vestige.estadoConservacao || undefined,
  destinacao: vestige.destinacao || undefined,
  destinacaoObs: vestige.destinacaoObs || undefined,
});
```

**Step 4: Adicionar função para buscar histórico de destinação**

```typescript
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
```

**Step 5: Commit**

```bash
git add client/services/dataService.ts
git commit -m "feat(service): map new conservation and destination fields in data service"
```

---

## Task 5: Atualizar o Formulário de Vestígio

**Files:**
- Modify: `client/components/VestigeFormModal.tsx`

**Step 1: Importar constantes**

No topo, adicionar aos imports de `../types`:

```typescript
import { Vestige, ESTADO_CONSERVACAO_OPTIONS, DESTINACAO_OPTIONS } from '../types';
```

**Step 2: Adicionar campos ao estado inicial do form**

No `useState` (~linha 17), adicionar:

```typescript
const [formData, setFormData] = useState<Partial<Vestige>>({
  material: '',
  requisicao: '',
  involucro: '',
  fav: '',
  municipio: 'Lavras',
  data: new Date().toLocaleDateString('pt-BR'),
  planilhaOrigem: 'Geral',
  // NOVOS CAMPOS
  estadoConservacao: 'NAO_AVALIADO',
  destinacao: 'NAO_INICIADO',
  destinacaoObs: '',
});
```

**Step 3: Adicionar campos de select ao formulário**

Após a "Linha 4" (Município + Origem), adicionar nova linha ao grid dentro do `<form>`:

```tsx
{/* Linha 5 — Novos Campos */}
<div>
  <label className="block text-xs font-semibold text-slate-400 mb-1">ESTADO DE CONSERVAÇÃO</label>
  <select
    required
    value={formData.estadoConservacao}
    onChange={e => handleChange('estadoConservacao' as keyof Vestige, e.target.value)}
    className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none appearance-none"
  >
    {ESTADO_CONSERVACAO_OPTIONS.map(opt => (
      <option key={opt.value} value={opt.value}>{opt.label}</option>
    ))}
  </select>
</div>
<div>
  <label className="block text-xs font-semibold text-slate-400 mb-1">DESTINAÇÃO</label>
  <select
    required
    value={formData.destinacao}
    onChange={e => handleChange('destinacao' as keyof Vestige, e.target.value)}
    className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none appearance-none"
  >
    {DESTINACAO_OPTIONS.map(opt => (
      <option key={opt.value} value={opt.value}>{opt.label}</option>
    ))}
  </select>
</div>

{/* Campo condicional de observação da destinação */}
{(formData.destinacao === 'SOLICITADO' || formData.destinacao === 'FINALIZADO') && (
  <div className="md:col-span-2">
    <label className="block text-xs font-semibold text-slate-400 mb-1">
      {formData.destinacao === 'SOLICITADO'
        ? 'OBSERVAÇÃO DA SOLICITAÇÃO (Quem solicitou e motivo)'
        : 'DADOS DA FINALIZAÇÃO'}
    </label>
    <textarea
      required
      value={formData.destinacaoObs || ''}
      onChange={e => handleChange('destinacaoObs' as keyof Vestige, e.target.value)}
      className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none h-20 resize-none"
      placeholder={formData.destinacao === 'SOLICITADO'
        ? 'Ex: Solicitado por Del. João Silva - Ofício 123/2026 - Restituição ao proprietário'
        : 'Ex: Entregue ao requisitante em 15/04/2026 - Protocolo 456/2026'}
    />
  </div>
)}
```

**Step 4: Commit**

```bash
git add client/components/VestigeFormModal.tsx
git commit -m "feat(ui): add conservation state and destination fields to vestige form"
```

---

## Task 6: Atualizar o Card de Vestígio

**Files:**
- Modify: `client/components/VestigeCard.tsx`

**Step 1: Importar helpers de label**

Adicionar ao import de `../types`:

```typescript
import { Vestige, User, canDeleteVestige, canEditVestige, getEstadoConservacaoLabel, getDestinacaoLabel } from '../types';
```

**Step 2: Adicionar badges visuais ao card**

Dentro do grid de detalhes (~linha 72), após o campo "Tempo de Custódia", adicionar:

```tsx
{/* Estado de Conservação */}
<div>
  <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-0.5">Conservação</p>
  <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
    vestige.estadoConservacao === 'NAO_AVALIADO' ? 'bg-zinc-700 text-zinc-300' :
    vestige.estadoConservacao === 'NOVO_LACRADO' ? 'bg-emerald-500/20 text-emerald-400' :
    vestige.estadoConservacao === 'SEMI_NOVO' ? 'bg-blue-500/20 text-blue-400' :
    vestige.estadoConservacao === 'USADO_FUNCIONANDO' ? 'bg-amber-500/20 text-amber-400' :
    vestige.estadoConservacao === 'DANIFICADO' ? 'bg-red-500/20 text-red-400' :
    'bg-orange-500/20 text-orange-400'
  }`}>
    {getEstadoConservacaoLabel(vestige.estadoConservacao)}
  </span>
</div>

{/* Destinação */}
<div>
  <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-0.5">Destinação</p>
  <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
    vestige.destinacao === 'NAO_INICIADO' ? 'bg-zinc-700 text-zinc-300' :
    vestige.destinacao === 'SOLICITADO' ? 'bg-yellow-500/20 text-yellow-400' :
    'bg-green-500/20 text-green-400'
  }`}>
    {getDestinacaoLabel(vestige.destinacao)}
  </span>
  {vestige.destinacaoObs && (
    <p className="text-[10px] text-zinc-400 mt-1 italic truncate max-w-[200px]" title={vestige.destinacaoObs}>
      {vestige.destinacaoObs}
    </p>
  )}
</div>
```

**Step 3: Commit**

```bash
git add client/components/VestigeCard.tsx
git commit -m "feat(ui): display conservation state and destination badges on vestige card"
```

---

## Task 7: Atualizar a Busca Avançada (SearchBar)

**Files:**
- Modify: `client/components/SearchBar.tsx`

**Step 1: Importar constantes**

Adicionar ao import:

```typescript
import { SearchFilters, ESTADO_CONSERVACAO_OPTIONS, DESTINACAO_OPTIONS } from '../types';
```

**Step 2: Adicionar estados locais**

No componente, junto aos outros estados (~linha 23):

```typescript
const [selectedConservacao, setSelectedConservacao] = useState('');
const [selectedDestinacao, setSelectedDestinacao] = useState('');
```

**Step 3: Atualizar `handleSearch` para passar novos filtros**

```typescript
const handleSearch = (e: React.FormEvent) => {
  e.preventDefault();
  onSearch({
    term: query,
    field: 'all',
    municipio: selectedMunicipio,
    origin: selectedOrigin,
    startDate,
    endDate,
    // NOVOS FILTROS
    estadoConservacao: selectedConservacao,
    destinacao: selectedDestinacao,
  });
};
```

**Step 4: Atualizar `clearFilters`**

```typescript
const clearFilters = () => {
  setStartDate('');
  setEndDate('');
  setSelectedMunicipio('');
  setSelectedOrigin('');
  setSelectedConservacao('');
  setSelectedDestinacao('');
  setQuery('');
};
```

**Step 5: Adicionar selects ao painel de filtros avançados**

Dentro do grid de filtros avançados (~linha 91), adicionar 2 novos blocos:

```tsx
{/* Filtro: Estado de Conservação */}
<div>
  <label className="block text-xs font-semibold text-slate-400 mb-1">CONSERVAÇÃO</label>
  <select
    value={selectedConservacao}
    onChange={(e) => setSelectedConservacao(e.target.value)}
    disabled={isLoading}
    className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none disabled:opacity-50"
  >
    <option value="">Todos os estados</option>
    {ESTADO_CONSERVACAO_OPTIONS.map(opt => (
      <option key={opt.value} value={opt.value}>{opt.label}</option>
    ))}
  </select>
</div>

{/* Filtro: Destinação */}
<div>
  <label className="block text-xs font-semibold text-slate-400 mb-1">DESTINAÇÃO</label>
  <select
    value={selectedDestinacao}
    onChange={(e) => setSelectedDestinacao(e.target.value)}
    disabled={isLoading}
    className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none disabled:opacity-50"
  >
    <option value="">Todas</option>
    {DESTINACAO_OPTIONS.map(opt => (
      <option key={opt.value} value={opt.value}>{opt.label}</option>
    ))}
  </select>
</div>
```

> **NOTA:** O grid atual é `lg:grid-cols-4`. Com 6 filtros agora (Tipo/Origem, Município, Data De, Data Até, Conservação, Destinação), considerar mudar para `lg:grid-cols-3` com 2 linhas, ou manter 4 colunas e os 2 novos ficam na segunda linha automaticamente.

**Step 6: Commit**

```bash
git add client/components/SearchBar.tsx
git commit -m "feat(ui): add conservation and destination filters to advanced search"
```

---

## Task 8: Atualizar o Hook de Busca Local

**Files:**
- Modify: `client/hooks/useVestiges.ts`

**Step 1: Atualizar lógica de filtro no `searchVestiges`**

Na função `searchVestiges` (~linha 81), após os filtros de data (~linha 148), adicionar ANTES do return:

```typescript
// Filtro por Estado de Conservação
let matchesConservacao = true;
if (filters.estadoConservacao) {
  matchesConservacao = vestige.estadoConservacao === filters.estadoConservacao;
}

// Filtro por Destinação
let matchesDestinacao = true;
if (filters.destinacao) {
  matchesDestinacao = vestige.destinacao === filters.destinacao;
}

return matchesTerm && matchesMunicipio && matchesOrigin && matchesDate && matchesConservacao && matchesDestinacao;
```

**Step 2: Commit**

```bash
git add client/hooks/useVestiges.ts
git commit -m "feat(hook): add conservation and destination to local search filtering"
```

---

## Task 9: Teste Manual End-to-End

**Step 1: Subir o ambiente**

```bash
docker compose up -d    # PostgreSQL
cd server && npm run dev   # Backend (terminal 1)
cd client && npm run dev   # Frontend (terminal 2)
```

**Step 2: Checklist de validação**

- [ ] A migration rodou sem erros
- [ ] Vestígios existentes aparecem com "Não avaliado" e "Não iniciado"
- [ ] Criar novo vestígio → campos de Conservação e Destinação aparecem no form
- [ ] Ao selecionar "Solicitado" ou "Finalizado" → campo de observação aparece e é obrigatório
- [ ] Salvar vestígio com destinação "Solicitado" → verificar no banco que `destinacao_changed_by`, `destinacao_changed_at` foram preenchidos automaticamente
- [ ] Verificar tabela `vestige_destination_logs` → registro da transição existe
- [ ] Card do vestígio exibe badges coloridos corretos
- [ ] Busca avançada filtra por Conservação e Destinação
- [ ] Perfil VISUALIZADOR **consegue** filtrar mas **NÃO consegue** editar os campos
- [ ] Perfil PERITO consegue editar ambos os campos

**Step 3: Commit final**

```bash
git add -A
git commit -m "feat: complete conservation state and destination feature"
```

---

## Resumo de Impacto

| Camada     | Arquivos Modificados | Arquivos Criados |
|------------|---------------------|------------------|
| Database   | `schema.prisma`     | 1 migration      |
| Backend    | `vestigeRoutes.ts`  | —                |
| Frontend   | `types.ts`, `dataService.ts`, `VestigeFormModal.tsx`, `VestigeCard.tsx`, `SearchBar.tsx`, `useVestiges.ts` | — |

**Total: ~8 arquivos modificados, 1 migration nova, 0 arquivos criados (exceto migration automática).**

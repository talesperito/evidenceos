# PLANO ESTRATÉGICO: MIGRAÇÃO EVIDENCEOS 2.0 — VPS HOSTINGER + EASYPANEL

> **Versão**: 2.0 — Revisado em 06/04/2026
> **Infraestrutura-alvo**: Hostinger VPS + EasyPanel + PostgreSQL + GitHub CI/CD
> **Autor da revisão técnica**: Assistente Especialista em Infraestrutura e Banco de Dados

---

## 1. Diagnóstico do Estado Atual

### 1.1 Arquitetura Presente (Problemas Identificados)

| Camada         | Tecnologia Atual          | Risco/Problema                                                                 |
|:---------------|:--------------------------|:-------------------------------------------------------------------------------|
| **Front-end**  | React + Vite (SPA)        | Expõe lógica de negócio no navegador                                           |
| **Auth**       | `localStorage` em texto   | Senhas armazenadas em plaintext no browser — vulnerabilidade crítica           |
| **Dados**      | Google Sheets via Apps Script | Dependência externa, latência alta, sem transações, sem integridade referencial |
| **Auditoria**  | `localStorage` (500 logs) | Limite de 5MB do browser, logs perdidos ao limpar cache — imprestável para fins forenses |
| **Usuários**   | `localStorage`            | Qualquer pessoa com DevTools acessa/edita todas as credenciais                 |
| **IDs**        | `Math.random()`           | Risco de colisão — inaceitável para cadeia de custódia                         |

### 1.2 Volume de Dados a Migrar

| Fonte                     | Quantidade | Descrição                                             |
|:--------------------------|:-----------|:------------------------------------------------------|
| Planilhas Google Sheets   | 29         | Cada uma representando uma categoria de vestígios forenses |
| Usuários (localStorage)   | ~5-10      | Cadastros com senha em texto puro                     |
| Logs de Auditoria         | Até 500    | Truncados pelo limite do localStorage                 |

---

## 2. Arquitetura-Alvo (EvidenceOS 2.0)

### 2.1 Visão Macro

```
┌─────────────────────────────────────────────────────────────┐
│                    HOSTINGER VPS (KVM)                       │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                    EASYPANEL                           │  │
│  │                                                       │  │
│  │  ┌─────────────────────┐   ┌───────────────────────┐  │  │
│  │  │   APP: evidenceos   │   │  SERVICE: PostgreSQL  │  │  │
│  │  │                     │   │                       │  │  │
│  │  │  ┌───────────────┐  │   │  • Porta: 5432        │  │  │
│  │  │  │  Front (React) │  │   │  • Volume persistente │  │  │
│  │  │  │  Vite Build    │  │   │  • Backup automático  │  │  │
│  │  │  │  /static       │  │   │                       │  │  │
│  │  │  └───────┬───────┘  │   │  Tabelas:             │  │  │
│  │  │          │          │   │  • users               │  │  │
│  │  │  ┌───────▼───────┐  │   │  • custody_standards   │  │  │
│  │  │  │   Back (API)  │──│───│─▶• audit_logs          │  │  │
│  │  │  │  Node.js      │  │   │  • vestiges            │  │  │
│  │  │  │  Fastify      │  │   │  • vestige_categories  │  │  │
│  │  │  └───────────────┘  │   │  • sessions            │  │  │
│  │  └─────────────────────┘   └───────────────────────┘  │  │
│  │                                                       │  │
│  │  SSL/HTTPS automático via EasyPanel (Let's Encrypt)   │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Por que EasyPanel (e não Docker Compose manual)?

| Critério           | Docker Compose Manual       | EasyPanel                                        |
|:-------------------|:----------------------------|:-------------------------------------------------|
| Deploy             | SSH + scripts manuais       | Push no GitHub → build automático                |
| SSL                | Certbot/Traefik manual      | Let's Encrypt com 1 clique                       |
| Monitoramento      | Precisa instalar Grafana    | Dashboard integrado (CPU, RAM, Logs)             |
| Banco de dados     | Gerenciamento manual        | Serviço PostgreSQL gerenciado com backups         |
| Complexidade       | Alta (manutenção do host)   | Baixa (PaaS self-hosted)                         |
| Custo              | $0 (já pago pela VPS)       | $0 (open-source, roda na mesma VPS)              |

**Decisão**: EasyPanel é a escolha correta. Ele abstrai toda a orquestração Docker, dá deploy via GitHub webhook e oferece SSL automático — eliminando a necessidade de scripts de CI/CD complexos.

---

## 3. Estrutura do Repositório

Manteremos **monorepo** no GitHub atual com separação clara:

```
/ evidenceos (repositório atual)
│
├── /client                    # Front-end React (código atual migrado)
│   ├── /src
│   │   ├── /components        # Componentes React existentes
│   │   ├── /hooks             # Custom hooks
│   │   ├── /services          # API client (substitui chamadas Google Sheets)
│   │   ├── /types             # TypeScript interfaces
│   │   └── App.tsx
│   ├── package.json
│   ├── vite.config.ts
│   └── Dockerfile             # Multi-stage: build + Nginx
│
├── /server                    # Back-end API (NOVO)
│   ├── /src
│   │   ├── /routes            # Rotas HTTP (Fastify)
│   │   ├── /services          # Lógica de negócio
│   │   ├── /middleware        # Auth JWT, rate limiter, CORS
│   │   ├── /db
│   │   │   ├── /migrations    # SQL versionado (up/down)
│   │   │   ├── /seeds         # Dados iniciais + import das planilhas
│   │   │   └── connection.ts  # Pool de conexões PostgreSQL
│   │   └── server.ts          # Entrypoint
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
│
├── /database                  # Documentação e scripts auxiliares
│   ├── schema.sql             # DDL completo para referência
│   ├── seed-from-sheets.ts    # Script de migração Google Sheets → PostgreSQL
│   └── backup.sh              # Script de backup periódico
│
├── /scripts                   # Utilitários de migração
│   └── export-sheets.ts       # Exporta todas as 29 planilhas para JSON
│
├── docker-compose.yml         # Para desenvolvimento local
├── .env.example               # Template de variáveis de ambiente
└── README.md
```

---

## 4. Modelo de Dados PostgreSQL (Completo)

### 4.1 Tabela: `users` — Usuários do Sistema

```sql
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,           -- Argon2id (NUNCA plaintext)
    role            VARCHAR(20) NOT NULL DEFAULT 'PERITO'
                    CHECK (role IN ('ADMIN', 'PERITO', 'VISUALIZADOR')),
    active          BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at   TIMESTAMPTZ,
    deleted_at      TIMESTAMPTZ                      -- Soft delete
);

-- Índices
CREATE INDEX idx_users_email ON users (email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_role  ON users (role)  WHERE deleted_at IS NULL;
```

**Mudanças vs. plano anterior**:
- `Argon2id` em vez de bcrypt (mais resistente a ataques GPU/ASIC)
- Campo `updated_at` para rastrear última alteração do perfil
- Campo `last_login_at` para auditoria de acessos
- Índice parcial excluindo soft-deleted (performance)

---

### 4.2 Tabela: `vestige_categories` — As 29 Categorias de Planilha

```sql
CREATE TABLE vestige_categories (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(255) NOT NULL UNIQUE,     -- Ex: "Armas", "Drogas", "Documentos"
    original_sheet  VARCHAR(255),                     -- Nome original da planilha Google
    description     TEXT,
    active          BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

> **Por que uma tabela separada?** Atualmente `planilhaOrigem` é uma string livre no campo do vestígio. Normalizando em tabela própria, ganhamos: filtros rápidos por índice, consistência (sem "Armas" vs "armas" vs "ARMAS"), e possibilidade de agregar estatísticas por categoria sem scan completo.

---

### 4.3 Tabela: `vestiges` — Vestígios Forenses (29 planilhas unificadas)

```sql
CREATE TABLE vestiges (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_id       VARCHAR(255),                     -- ID antigo (v-FAV123...) para rastreabilidade
    category_id     INTEGER NOT NULL REFERENCES vestige_categories(id),
    registro_fav    VARCHAR(100),
    requisicao      VARCHAR(100),
    involucro       VARCHAR(255),
    material        TEXT NOT NULL,
    tipo_material   VARCHAR(100),
    municipio       VARCHAR(100) NOT NULL DEFAULT 'Lavras',
    data_coleta     DATE,
    observacoes     TEXT,                              -- Campo livre para anotações do perito
    
    -- Metadados de controle
    created_by      UUID REFERENCES users(id),
    updated_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,                      -- Soft delete (NUNCA apaga)

    -- Controle de importação
    imported_from   VARCHAR(50) DEFAULT 'google_sheets', -- Origem: 'google_sheets', 'manual', 'api'
    imported_at     TIMESTAMPTZ                        -- Quando foi importado
);

-- Índices para queries frequentes do Dashboard
CREATE INDEX idx_vestiges_fav          ON vestiges (registro_fav)  WHERE deleted_at IS NULL;
CREATE INDEX idx_vestiges_requisicao   ON vestiges (requisicao)    WHERE deleted_at IS NULL;
CREATE INDEX idx_vestiges_involucro    ON vestiges (involucro)     WHERE deleted_at IS NULL;
CREATE INDEX idx_vestiges_municipio    ON vestiges (municipio)     WHERE deleted_at IS NULL;
CREATE INDEX idx_vestiges_category     ON vestiges (category_id)   WHERE deleted_at IS NULL;
CREATE INDEX idx_vestiges_data_coleta  ON vestiges (data_coleta)   WHERE deleted_at IS NULL;
CREATE INDEX idx_vestiges_created_at   ON vestiges (created_at)    WHERE deleted_at IS NULL;

-- Busca textual full-text (substitui o filtro client-side atual)
CREATE INDEX idx_vestiges_material_fts ON vestiges
    USING GIN (to_tsvector('portuguese', material));
```

**Decisões técnicas importantes**:
1. **UUID em vez de ID concatenado**: O sistema atual gera IDs como `v-FAV123-REQ01...` via string manipulation — isso causa colisão. UUID v4 garante unicidade criptográfica.
2. **`legacy_id`**: Mantemos o ID antigo para rastreabilidade durante a transição.
3. **Full-Text Search nativo**: O PostgreSQL tem FTS em português embutido — elimina a necessidade de Elasticsearch para o volume atual.
4. **Índices parciais (`WHERE deleted_at IS NULL`)**: Queries só buscam registros ativos, então o índice exclui os inativos, economizando espaço e acelerando buscas.

---

### 4.4 Tabela: `custody_standards` — Normas de Custódia

```sql
CREATE TABLE custody_standards (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(50) NOT NULL UNIQUE,       -- Ex: "NBR-ISO-17025", "LEI-13.964/2019"
    title           VARCHAR(500) NOT NULL,
    category        VARCHAR(100),                      -- 'legislacao', 'norma_tecnica', 'procedimento_interno'
    description     TEXT,
    full_text       TEXT,                               -- Texto integral da norma (se aplicável)
    source_url      VARCHAR(500),                       -- Link oficial
    effective_date  DATE,                               -- Data de vigência
    version         VARCHAR(50),                        -- Versão da norma
    active          BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Busca textual no conteúdo das normas
CREATE INDEX idx_custody_standards_fts ON custody_standards
    USING GIN (to_tsvector('portuguese', title || ' ' || COALESCE(description, '')));
```

> **Propósito**: Centralizar as normas que regem a cadeia de custódia (Lei 13.964/2019 — Pacote Anticrime, NBR ISO/IEC 17025, SENASP, etc.). Permite que o sistema referencie automaticamente qual norma um procedimento atende, em vez de depender de texto estático.

---

### 4.5 Tabela: `audit_logs` — Trilha de Auditoria Imutável

```sql
CREATE TABLE audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID REFERENCES users(id),
    user_email      VARCHAR(255) NOT NULL,             -- Desnormalizado: preserva email mesmo se user for deletado
    user_name       VARCHAR(255) NOT NULL,             -- Idem
    action          VARCHAR(50) NOT NULL
                    CHECK (action IN (
                        'LOGIN', 'LOGOUT', 'LOGIN_FAILED',
                        'SEARCH', 'VIEW_DETAIL',
                        'CREATE', 'UPDATE', 'DELETE', 'RESTORE',
                        'REPORT_GENERATE', 'REPORT_EXPORT',
                        'USER_CREATE', 'USER_UPDATE', 'USER_DEACTIVATE',
                        'DATA_IMPORT', 'DATA_EXPORT',
                        'SYSTEM_CONFIG'
                    )),
    target_type     VARCHAR(50),                       -- 'vestige', 'user', 'report', 'category'
    target_id       VARCHAR(255),                      -- ID do objeto afetado
    details         JSONB NOT NULL DEFAULT '{}',       -- Detalhes flexíveis
    ip_address      INET,                              -- IP do cliente
    user_agent      TEXT,                               -- Browser/dispositivo
    session_id      UUID,                               -- Correlação de sessão
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    -- NOTA: Sem updated_at nem deleted_at — logs são IMUTÁVEIS
);

-- Índices para consultas de auditoria
CREATE INDEX idx_audit_user_id     ON audit_logs (user_id);
CREATE INDEX idx_audit_action      ON audit_logs (action);
CREATE INDEX idx_audit_created_at  ON audit_logs (created_at);
CREATE INDEX idx_audit_target      ON audit_logs (target_type, target_id);

-- Particionamento por mês (para performance em longo prazo)
-- Implementar quando volume ultrapassar 100k registros
```

**Melhorias vs. plano anterior**:
1. **Sem limite de 500 registros**: PostgreSQL armazena bilhões. Sem truncamento.
2. **Imutabilidade**: Sem `UPDATE` nem `DELETE` — a API jamais expõe endpoints para alterar logs.
3. **IP e User-Agent**: Fundamentais para perícia forense — rastrear de onde veio cada ação.
4. **Desnormalização intencional de email/name**: Se um usuário for excluído, o log preserva quem foi.
5. **Actions granulares**: Cada tipo de ação é explícito, facilitando filtragem e relatórios.

---

### 4.6 Tabela: `sessions` — Controle de Sessões Ativas

```sql
CREATE TABLE sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      VARCHAR(255) NOT NULL,             -- Hash do JWT (nunca armazena o token cru)
    ip_address      INET,
    user_agent      TEXT,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at      TIMESTAMPTZ                        -- NULL = ativa
);

CREATE INDEX idx_sessions_user    ON sessions (user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_sessions_expires ON sessions (expires_at);
```

> **Por que gerenciar sessões no banco?** Permite: (1) revogar todas as sessões de um usuário imediatamente; (2) ver dispositivos conectados; (3) detectar sessões concorrentes anômalas.

---

## 5. Estratégia de Segurança

### 5.1 Autenticação e Autorização

| Aspecto               | Implementação                                                      |
|:-----------------------|:-------------------------------------------------------------------|
| Hash de senha          | `Argon2id` (vencedor da PHC — Password Hashing Competition)        |
| Token de sessão        | JWT com `RS256` (chave assimétrica), expiração de 8h               |
| Refresh Token          | Token opaco armazenado em HttpOnly cookie + hash no banco          |
| Rate Limiting          | 5 tentativas de login / minuto por IP (`fastify-rate-limit`)       |
| CORS                   | Apenas domínio próprio (`https://evidenceos.seu-dominio.com`)      |
| Headers de segurança   | Helmet (CSP, X-Frame-Options, HSTS)                               |

### 5.2 Proteção do Banco

| Aspecto               | Implementação                                                      |
|:-----------------------|:-------------------------------------------------------------------|
| Acesso                 | PostgreSQL acessível APENAS via rede interna do EasyPanel          |
| Porta exposta          | Nenhuma — porta 5432 NÃO exposta externamente                      |
| Backups                | Automáticos diários via EasyPanel + pg_dump semanal para storage   |
| Queries parametrizadas | Todas via Prisma ORM — zero concatenação SQL                       |
| SSL interno            | Conexão API→DB via SSL dentro do cluster Docker                    |

---

## 6. Deploy via GitHub + EasyPanel

### 6.1 Fluxo de CI/CD

```
┌──────────┐     ┌───────────┐     ┌─────────────────────────────┐
│ Dev push │────▶│  GitHub   │────▶│      EasyPanel (VPS)        │
│ na main  │     │  Webhook  │     │                             │
└──────────┘     └───────────┘     │  1. Puxa código do GitHub   │
                                   │  2. Executa docker build    │
                                   │  3. Roda migrations (DB)    │
                                   │  4. Reinicia containers     │
                                   │  5. Health check            │
                                   └─────────────────────────────┘
```

### 6.2 Configuração no EasyPanel

#### Serviço 1: **App (evidenceos)**
| Campo                | Valor                                          |
|:---------------------|:-----------------------------------------------|
| Tipo                 | App (Docker)                                   |
| Fonte                | GitHub → `seu-usuario/evidenceos` → Branch `main` |
| Dockerfile Path      | `./server/Dockerfile` (serve API + front buildado)|
| Domínio              | `evidenceos.seu-dominio.com`                   |
| SSL                  | Automático (Let's Encrypt)                     |
| Variáveis de Ambiente| `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV=production` |
| Health Check         | `GET /api/health` → 200                        |

#### Serviço 2: **PostgreSQL**
| Campo                | Valor                                          |
|:---------------------|:-----------------------------------------------|
| Tipo                 | Database (PostgreSQL 16)                       |
| Versão               | 16-alpine                                      |
| Volume               | `/var/lib/postgresql/data` (persistente)       |
| Porta interna        | 5432 (não expor publicamente)                  |
| Usuário              | `evidenceos_app`                               |
| Banco                | `evidenceos_prod`                               |
| Backup               | Ativar backup automático diário no EasyPanel   |

### 6.3 Dockerfile Unificado (API + Front)

A estratégia recomendada é um **Dockerfile multi-stage** que:
1. Compila o front-end React (Vite build)
2. Compila o back-end TypeScript
3. Serve tudo via Node.js (o Fastify serve os assets estáticos do React)

```dockerfile
# --- Stage 1: Build do Front-end ---
FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# --- Stage 2: Build do Back-end ---
FROM node:20-alpine AS server-build
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

# --- Stage 3: Produção ---
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

COPY --from=server-build /app/server/dist ./dist
COPY --from=server-build /app/server/node_modules ./node_modules
COPY --from=server-build /app/server/package.json ./
COPY --from=client-build /app/client/dist ./public

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "dist/server.js"]
```

> **Por que Fastify serve o front?** Eliminamos a necessidade de um container Nginx separado. O Fastify com `@fastify/static` serve os assets do React e faz proxy reverso para a API — um único container, menor superfície de ataque, deploy mais simples no EasyPanel.

---

## 7. Stack Tecnológica Definida

### 7.1 Back-end

| Tecnologia       | Versão | Motivo                                                        |
|:-----------------|:-------|:--------------------------------------------------------------|
| **Node.js**      | 20 LTS | Suporte de longo prazo, compatível com EasyPanel               |
| **Fastify**      | 5.x    | 3x mais rápido que Express, validação de schema nativa (Ajv)  |
| **Prisma ORM**   | 6.x    | Type-safe queries, migrations automáticas, excelente DX       |
| **Argon2**       | 0.41+  | Hash de senhas — padrão ouro de segurança                     |
| **jsonwebtoken** | 9.x    | Geração/verificação de JWT                                     |
| **zod**          | 3.x    | Validação de input na API (schema-first)                      |

### 7.2 Front-end (Adaptações)

| Mudança                            | Descrição                                                  |
|:-----------------------------------|:-----------------------------------------------------------|
| `dataService.ts` **→ reescrever**  | Substituir chamadas Google Apps Script por `fetch('/api/vestiges')` |
| `userService.ts` **→ reescrever**  | Substituir localStorage por `fetch('/api/auth/login')`     |
| `auditService.ts` **→ reescrever** | Substituir localStorage por `fetch('/api/audit')`          |
| **Novo**: `apiClient.ts`           | Client HTTP centralizado com interceptor JWT               |

---

## 8. Migração das 29 Planilhas Google Sheets

**ATENÇÃO: Você NÃO precisará copiar e colar nada manualmente.**
O processo foi desenhado para ser 100% automatizado através de scripts. Como já existe um Google Apps Script que lê as 29 planilhas e devolve tudo em um único JSON (usado atualmente pelo front-end), usaremos esse mesmo mecanismo a nosso favor para puxar todos os dados de uma vez.

### 8.1 Estratégia de Extração

```
Google Sheets (29 planilhas)
        │
        ▼
Apps Script existente (já funciona)
        │
        ▼
JSON intermediário (export-sheets.ts)
        │
        ▼
Script de seed (seed-from-sheets.ts)
        │
        ▼
PostgreSQL (tabela vestiges + vestige_categories)
```

### 8.2 Passo a Passo da Migração de Dados

#### Etapa A — Exportação (uma única vez)

```typescript
// scripts/export-sheets.ts
// Chama o Apps Script URL atual e salva resposta como JSON
// Já temos o endpoint funcionando: APPS_SCRIPT_URL no dataService.ts

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycb...exec';

async function exportSheets() {
    const response = await fetch(APPS_SCRIPT_URL);
    const data = await response.json();
    
    // Salva snapshot completo
    fs.writeFileSync('database/sheets-snapshot.json', JSON.stringify(data, null, 2));
    console.log(`Exportados ${data.length} vestígios de 29 planilhas`);
}
```

#### Etapa B — Mapeamento e Inserção

```typescript
// database/seed-from-sheets.ts
// Lê o JSON e insere no PostgreSQL via Prisma

async function seedFromSheets() {
    const raw = JSON.parse(fs.readFileSync('database/sheets-snapshot.json', 'utf-8'));
    
    // 1. Extrair categorias únicas (planilhaOrigem → vestige_categories)
    const categories = [...new Set(raw.map(v => v.planilhaOrigem))];
    for (const cat of categories) {
        await prisma.vestigeCategory.upsert({
            where: { name: cat },
            create: { name: cat, originalSheet: cat },
            update: {}
        });
    }
    
    // 2. Inserir vestígios em lotes de 500 (batch insert)
    const BATCH_SIZE = 500;
    for (let i = 0; i < raw.length; i += BATCH_SIZE) {
        const batch = raw.slice(i, i + BATCH_SIZE);
        await prisma.vestige.createMany({
            data: batch.map(item => ({
                legacyId: generateLegacyId(item),
                categoryId: categoryMap[item.planilhaOrigem],
                registroFav: item.fav || null,
                requisicao: item.requisicao || null,
                involucro: item.involucro || null,
                material: item.material || 'N/I',
                municipio: item.municipio || 'Lavras',
                dataColeta: parseDate(item.data),
                importedFrom: 'google_sheets',
                importedAt: new Date()
            }))
        });
        console.log(`Inseridos ${Math.min(i + BATCH_SIZE, raw.length)}/${raw.length}`);
    }
}
```

### 8.3 Validação Pós-Migração

| Verificação                                  | Query SQL                                                           |
|:---------------------------------------------|:--------------------------------------------------------------------|
| Total de registros bate com planilhas         | `SELECT COUNT(*) FROM vestiges WHERE imported_from = 'google_sheets'` |
| Todas as 29 categorias foram criadas         | `SELECT COUNT(*) FROM vestige_categories`                           |
| Nenhum registro com material vazio           | `SELECT COUNT(*) FROM vestiges WHERE material IS NULL OR material = ''` |
| Distribuição por categoria faz sentido       | `SELECT vc.name, COUNT(v.id) FROM vestiges v JOIN vestige_categories vc ON v.category_id = vc.id GROUP BY vc.name ORDER BY COUNT DESC` |
| Datas foram parseadas corretamente           | `SELECT COUNT(*) FROM vestiges WHERE data_coleta IS NULL AND imported_from = 'google_sheets'` |

---

## 9. Endpoints da API

### 9.1 Autenticação

| Método | Rota                   | Descrição                 | Auth  |
|:-------|:-----------------------|:--------------------------|:------|
| POST   | `/api/auth/login`      | Login (email + senha)     | Não   |
| POST   | `/api/auth/logout`     | Logout (revoga sessão)    | Sim   |
| GET    | `/api/auth/me`         | Dados do usuário logado   | Sim   |
| POST   | `/api/auth/refresh`    | Renovar token JWT         | Cookie|

### 9.2 Vestígios

| Método | Rota                          | Descrição                        | Auth  |
|:-------|:------------------------------|:---------------------------------|:------|
| GET    | `/api/vestiges`               | Listar (paginado, filtros)       | Sim   |
| GET    | `/api/vestiges/:id`           | Detalhe de um vestígio           | Sim   |
| POST   | `/api/vestiges`               | Criar novo vestígio              | Admin |
| PUT    | `/api/vestiges/:id`           | Atualizar vestígio               | Admin |
| DELETE | `/api/vestiges/:id`           | Soft delete                      | Admin |
| GET    | `/api/vestiges/search`        | Busca full-text                  | Sim   |
| GET    | `/api/vestiges/stats`         | Estatísticas (Dashboard)         | Sim   |

### 9.3 Categorias

| Método | Rota                          | Descrição                        | Auth  |
|:-------|:------------------------------|:---------------------------------|:------|
| GET    | `/api/categories`             | Listar todas as categorias       | Sim   |
| GET    | `/api/categories/:id/vestiges`| Vestígios de uma categoria       | Sim   |

### 9.4 Auditoria

| Método | Rota                          | Descrição                        | Auth     |
|:-------|:------------------------------|:---------------------------------|:---------|
| GET    | `/api/audit`                  | Consultar logs (paginado)        | Admin    |
| GET    | `/api/audit/export`           | Exportar logs (CSV/JSON)         | Admin    |

### 9.5 Administração

| Método | Rota                          | Descrição                        | Auth     |
|:-------|:------------------------------|:---------------------------------|:---------|
| GET    | `/api/admin/users`            | Listar usuários                  | Admin    |
| POST   | `/api/admin/users`            | Criar usuário                    | Admin    |
| PUT    | `/api/admin/users/:id`        | Editar usuário                   | Admin    |
| DELETE | `/api/admin/users/:id`        | Desativar usuário (soft)         | Admin    |

### 9.6 Sistema

| Método | Rota                  | Descrição                        | Auth  |
|:-------|:----------------------|:---------------------------------|:------|
| GET    | `/api/health`         | Health check (EasyPanel)         | Não   |

---

## 10. Roteiro de Execução (6 Fases)

### FASE 1 — Fundação (Estimativa: 2-3 dias)

**Objetivo**: Servidor funcional conectando ao banco, rodando local.

- [x] Criar pasta `/server` com Fastify + TypeScript
- [x] Configurar Prisma com schema do PostgreSQL
- [x] Rodar PostgreSQL local e isolar o EvidenceOS no schema `evidenceos`
- [x] Criar e executar migrations iniciais (todas as tabelas)
- [x] Implementar health check (`/api/health`)
- [x] Testar conexão API → banco local

**Critério de saída**: `curl http://localhost:3000/api/health` retorna `{ "status": "ok" }`

---

### FASE 2 — Migração de Dados (Estimativa: 1-2 dias)

**Objetivo**: Todas as 29 planilhas migradas e validadas no PostgreSQL.

- [x] Executar script de exportação das planilhas via Apps Script URL
- [x] Salvar snapshot JSON (backup do estado original)
- [x] Criar script de seed com mapeamento de campos
- [x] Executar seed e validar contagens
- [x] Verificar integridade dos dados (queries de validação)
- [x] Documentar mapeamento `planilhaOrigem` → `vestige_categories`

**Critério de saída**: `SELECT COUNT(*) FROM vestiges` retorna o mesmo total que o Apps Script.

**Status atual**:
- Snapshot exportado com 4600 registros em `database/sheets-snapshot.json`
- Seed concluído em ambiente local temporário de validação
- Validação concluída em `database/import-validation.json`
- Contagens válidas: 4600 vestígios importados e 29 categorias
- Observações de qualidade do dado original: 1 registro com material placeholder (`N/I`) e 375 registros sem data parseável

**Importante**:
- A importação executada nesta fase foi apenas local, para validar o mapeamento e o processo de seed
- Produção deve usar banco, usuário e credenciais dedicados do EvidenceOS, em infraestrutura separada do Metascope
- Antes de seguir para deploy, a `DATABASE_URL` deve apontar para o PostgreSQL próprio do EvidenceOS

---

### FASE 3 — API Core (Estimativa: 3-4 dias)

**Objetivo**: Todas as rotas funcionando com autenticação.

- [x] Implementar auth (login, logout, JWT)
- [x] Implementar CRUD de vestígios com validação Zod
- [x] Implementar busca de vestígios via query `search` em `GET /api/vestiges`
- [x] Implementar endpoint de estatísticas (Dashboard)
- [x] Implementar gestão de usuários (admin)
- [x] Implementar logging automático de auditoria (middleware)
- [x] Implementar rotas de auditoria separadas
- [x] Implementar refresh token / sessão persistente
- [ ] Testes manuais com Insomnia/Bruno

**Status atual**:
- Rotas de auditoria implementadas em `/api/audit` e `/api/audit/export`
- Refresh token com sessão persistente implementado via cookie HttpOnly + tabela `sessions`
- Endpoints adicionais alinhados ao plano: `GET /api/vestiges/:id`, `GET /api/vestiges/search` e `PUT /api/admin/users/:id`
- Build do servidor validado com sucesso após as mudanças
- Teste manual de API ficou pendente até apontar a aplicação para o PostgreSQL próprio do EvidenceOS

**Critério de saída**: Todas as rotas essenciais respondem corretamente; auditoria registra cada ação.

---

### FASE 4 — Adaptação do Front-end (Estimativa: 2-3 dias)

**Objetivo**: React consumindo API em vez de Google Sheets/localStorage.

- [x] Criar `apiClient.ts` (fetch wrapper com JWT interceptor e refresh automÃ¡tico)
- [ ] Reescrever `dataService.ts` → chamadas à API REST
- [ ] Reescrever `userService.ts` → autenticação via API
- [ ] Reescrever `auditService.ts` → consulta via API
- [ ] Atualizar componentes que dependem de localStorage
- [ ] Testar fluxo completo local (front + back + banco real do EvidenceOS)

**Status atual**:
- Front-end agora autentica via `/api/auth/login`, restaura sessÃ£o com refresh token e usa `apiClient.ts`
- Camadas legadas de Google Sheets e `localStorage` foram removidas do caminho principal da aplicaÃ§Ã£o
- CRUD de vestÃ­gios, auditoria, usuÃ¡rios e normas foi ligado Ã  API REST
- Build do cliente validado com sucesso (`npm run build`)
- Ainda falta smoke test funcional com o PostgreSQL prÃ³prio do EvidenceOS apontado no `.env`

**Critério de saída**: Aplicação funciona 100% local sem Google Sheets e sem localStorage para dados.

---

### FASE 5 — Deploy no EasyPanel (Estimativa: 1 dia)

**Objetivo**: Aplicação rodando em produção na VPS Hostinger.

- [ ] Criar Dockerfile multi-stage (conforme seção 6.3)
- [ ] Configurar EasyPanel:
  - [ ] Serviço PostgreSQL 16 com volume persistente
  - [ ] Serviço App conectado ao GitHub (auto-deploy na `main`)
  - [ ] Variáveis de ambiente de produção
  - [ ] Domínio + SSL automático
- [ ] Push na `main` → verificar build automático
- [ ] Rodar migrations em produção (`npx prisma migrate deploy`)
- [ ] Executar seed dos dados das planilhas
- [ ] Verificar health check: `https://evidenceos.dominio.com/api/health`

**Critério de saída**: Aplicação acessível via HTTPS, dados carregados, login funcional.

---

### FASE 6 — Endurecimento e Virada (Estimativa: 1-2 dias)

**Objetivo**: Validação final, segurança e desligamento do sistema antigo.

- [ ] Configurar backup automático do PostgreSQL (diário)
- [ ] Testar restore de backup
- [ ] Configurar rate limiting em produção
- [ ] Verificar headers de segurança (teste com securityheaders.com)
- [ ] Migrar usuários reais (com senhas novas — forçar redefinição)
- [ ] Teste de fumaça com usuários reais
- [ ] **Desativar Google Apps Script** (read-only por 30 dias, depois remove)
- [ ] Remover referências ao localStorage e Google Sheets do código
- [ ] Documentar runbook de operação

**Critério de saída**: Sistema em produção, Apps Script desativado, backup validado.

---

## 11. Checklist de Variáveis de Ambiente

```bash
# .env.example — Copiar para .env e preencher

# === Banco de Dados ===
DATABASE_URL=postgresql://evidenceos_app:SENHA_FORTE@db:5432/evidenceos_prod

# === JWT ===
JWT_SECRET=gerar-com-openssl-rand-base64-64
JWT_EXPIRES_IN=8h
JWT_REFRESH_EXPIRES_IN=7d

# === Servidor ===
NODE_ENV=production
PORT=3000
CORS_ORIGIN=https://evidenceos.seu-dominio.com

# === Segurança ===
RATE_LIMIT_MAX=100          # Requests por minuto (geral)
RATE_LIMIT_LOGIN_MAX=5      # Tentativas de login por minuto
ARGON2_TIME_COST=3
ARGON2_MEMORY_COST=65536    # 64MB

# === Logs ===
LOG_LEVEL=info              # debug em dev, info em prod
```

---

## 12. Riscos e Mitigações

| Risco                                   | Impacto | Mitigação                                                    |
|:----------------------------------------|:--------|:-------------------------------------------------------------|
| Perda de dados na migração              | Alto    | Snapshot JSON antes, validação por contagem, dry-run         |
| VPS sem recurso suficiente              | Médio   | Monitorar via EasyPanel; escalar plano se necessário         |
| Google Apps Script para de funcionar     | Alto    | Exportar snapshot JSON ANTES de qualquer mudança             |
| Senha do banco vazar                    | Crítico | Variáveis de ambiente no EasyPanel (nunca no código)         |
| Falha no deploy automático              | Baixo   | Dockerfile com health check; rollback automático do EasyPanel|
| Volume de dados maior que esperado      | Baixo   | PostgreSQL lida tranquilamente com milhões; monitorar disco  |

---

## 13. Resumo Executivo

| Aspecto               | Antes (v1)                    | Depois (v2)                              |
|:-----------------------|:------------------------------|:-----------------------------------------|
| **Hospedagem**         | Firebase/Estático             | VPS Hostinger + EasyPanel                |
| **Banco de dados**     | Google Sheets (29 planilhas)  | PostgreSQL 16 (tabela unificada)         |
| **Autenticação**       | localStorage (plaintext)      | JWT + Argon2id + HttpOnly cookies        |
| **Auditoria**          | localStorage (500 logs max)   | PostgreSQL (ilimitado, imutável)         |
| **Deploy**             | Manual                        | Git push → auto-deploy via EasyPanel     |
| **SSL**                | Depende do hosting            | Let's Encrypt automático                 |
| **Busca**              | Client-side filter (JS)       | Full-Text Search PostgreSQL (server)     |
| **Backup**             | Nenhum                        | Diário automático + semanal manual       |
| **Segurança**          | Inexistente                   | CORS, Helmet, Rate Limit, JWT, Argon2    |
| **Tempo estimado**     | —                             | **10-15 dias úteis**                     |


# EvidenceOS – Sistema de Controle de Vestígios (URC Lavras/MG)

O **EvidenceOS** é uma aplicação web full stack desenvolvida para modernizar e agilizar a gestão da cadeia de custódia na Unidade Regional de Custódia (URC) de Lavras/MG. O sistema conta com backend próprio (Fastify + PostgreSQL) responsável por autenticação, auditoria e integridade da cadeia de custódia, e frontend em React com sincronização a partir da planilha do Google Drive.

---

## 🚀 Funcionalidades Principais

### 1. 🔍 Busca e Localização Avançada
*   **Busca Inteligente:** algoritmo híbrido que diferencia buscas numéricas exatas (FAV, Requisição) de buscas textuais parciais (descrição de materiais).
*   **Filtros Combinados:** termo livre (Material, FAV, Invólucro, Requisição), município de origem, categoria/tipo de vestígio e intervalo de datas.
*   **Feedback Visual:** indicadores de carregamento e estados de "Nenhum resultado".

### 2. 📦 Gestão de Custódia
*   **Cálculo Automático de Tempo:** cada card exibe há quanto tempo o item está custodiado.
*   **Estado de Conservação e Destinação:** cada vestígio tem status de destinação (`NAO_INICIADO`, etc.) com observações, e toda mudança gera um registro em `vestige_destination_logs` (autor, timestamp, status anterior e novo) — a cadeia de custódia é auditável e inquebrável.
*   **Invólucros:** um vestígio pode ter múltiplos invólucros vinculados.
*   **Seleção em Lote ("Carrinho"):** seleção de múltiplos itens para ações em massa (agendamento de retirada).

### 3. 📅 Agendamento de Retirada (Google Agenda)
*   **Integração Direct Link:** gera links dinâmicos para criar eventos no Google Calendar oficial da unidade.
*   **Controle de Motivos:** seleção obrigatória do motivo de saída por item, com opção de aplicar em massa, e justificativa obrigatória para "Outros".
*   **Regra de Negócio (24h):** bloqueio automático de agendamentos com menos de 24 horas de antecedência.

### 4. 🔗 Integração com o PCNET
*   **Acesso Direto por FAV:** abre a tela do PCNET a partir do número de registro FAV do vestígio.
*   **Registro de Solicitação:** cada acesso (visualização de FAV ou movimentação) é logado em `pcnet_action_logs`, com status `SOLICITADO` — o EvidenceOS registra a intenção de acesso, mas não confirma alterações feitas diretamente no PCNET.

### 5. 🔄 Sincronização com a Planilha do Drive
*   Importação/atualização dos vestígios a partir da planilha oficial do Google Drive, com diagnóstico prévio e relatório de divergências antes de qualquer gravação (ver skill `sincronizador-drive`).

### 6. 📊 Painel Administrativo e Relatórios
*   **Relatório Analítico de Custódia:** passivo crítico (itens sem requisição parados há 1, 2 ou 3+ anos), evolução temporal (sparklines por semestre/ano), top categorias por volume.
*   **Exportação em PDF:** geração de relatório em PDF a partir da visualização do painel.
*   **Gestão de Normas (FAQ):** CRUD de dúvidas frequentes e procedimentos operacionais padrão (`custody_standards`).
*   **Logs de Auditoria:** trilha de ações sensíveis (login, buscas, alterações de dados, geração de relatórios) persistida em `audit_logs`, com usuário, IP, user agent e sessão.
*   **Gestão de Usuários:** cadastro de operadores/administradores com controle de acesso baseado em função (RBAC: `ADMIN`, `PERITO`, `VISUALIZADOR`).

### 7. 🎨 Interface e UX
*   **Dark Mode Nativo:** interface construída em tons de `Slate-900`.
*   **Responsividade:** layout adaptável para desktop, tablet e smartphone.
*   **Acessibilidade:** ícones claros, contrastes adequados e feedbacks de ação (toasts/alertas).

---

## 🛠 Tecnologias Utilizadas

*   **Backend:** Node.js 20+, Fastify 5, TypeScript, Prisma ORM 7.
*   **Banco de Dados:** PostgreSQL 16 (via Docker Compose em desenvolvimento).
*   **Autenticação:** JWT (`@fastify/jwt`) + cookies HttpOnly (`@fastify/cookie`), hash de senha com Argon2.
*   **E-mail:** Nodemailer (ex.: recuperação de senha).
*   **Frontend:** React 18, TypeScript 5.5, Vite 5.
*   **Estilização:** Tailwind CSS.
*   **Validação:** Zod (schemas compartilhados de entrada, back e front).

---

## 📁 Estrutura do Projeto

```
evidenceos/
├── server/                    # Fastify backend + Prisma ORM
│   ├── src/
│   │   ├── server.ts
│   │   ├── routes/            # auth, users, vestiges, categories, audit, custody-standards, pcnet
│   │   └── middleware/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   └── scripts/                # bootstrap admin, importação/exportação (Fase 2), validação
├── client/                    # React frontend + Vite
│   ├── src/
│   │   ├── main.tsx
│   │   ├── components/
│   │   └── pages/
│   └── index.html
├── .claude/                   # Contexto e convenções para o agente de IA
└── docker-compose.yml         # PostgreSQL (desenvolvimento)
```

---

## 🔒 Perfis de Acesso (RBAC)

1.  **VISUALIZADOR:**
    *   Pode realizar buscas e selecionar itens.
    *   Pode agendar retiradas e gerar relatórios de visualização.
    *   Pode consultar Normas/FAQ.

2.  **PERITO:**
    *   Todas as funções do Visualizador.
    *   Pode registrar movimentações relacionadas à custódia dos vestígios sob sua responsabilidade.

3.  **ADMIN:**
    *   Todas as funções anteriores.
    *   **Inserir/Editar/Excluir** vestígios e categorias.
    *   Gerenciar usuários do sistema.
    *   Visualizar Logs de Auditoria.
    *   Gerenciar Normas/FAQ e rodar a sincronização com a planilha do Drive.

---

## ⚙️ Comandos do Dia a Dia

```bash
npm run dev:full               # backend + frontend em paralelo, sobe o DB se necessário
npm run dev                    # apenas frontend + backend (DB já deve estar up)
npm run db:up                  # inicia PostgreSQL em Docker
npm run db:up:optional         # inicia DB se não estiver rodando
npm run build                  # build completo (client + server)
npm run prisma:migrate         # nova migration em dev (rodar dentro de server/)
npm run bootstrap:admin        # cria usuário admin inicial
```

---

## ⚠️ Notas Técnicas

*   **Validação de 24h:** a lógica de bloqueio de agendamento compara o timestamp do navegador com a data selecionada; qualquer alteração nessa regra exige aprovação explícita (regra de negócio crítica da cadeia de custódia).
*   **Segurança:** autenticação via JWT + cookies HttpOnly, com sessões e hash de senha (Argon2) persistidos no PostgreSQL — não há mais dependência de LocalStorage para autenticação.
*   **Auditoria:** falha de gravação em log de auditoria é silenciosa por decisão de projeto — a tela segue funcionando normalmente mesmo que o registro não seja persistido; convém conferir os Logs de Auditoria após operações críticas.
*   **Deploy:** produção roda em VPS Hostinger via Easypanel, com três serviços independentes (`api`, `web`, `db`), cada um com deploy próprio — ver `.claude/` para o passo a passo.
*   **Impressão/PDF:** o relatório de custódia possui estilos dedicados para impressão e exportação em PDF.

---

**Desenvolvido para a Polícia Civil de Minas Gerais - URC Lavras**
*Coordenação de Perícias do 6º Departamento*

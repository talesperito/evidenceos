
# EvidenceOS – Sistema de Controle de Vestígios (URC Lavras/MG)

O **EvidenceOS** é uma aplicação web full stack desenvolvida para modernizar e agilizar a gestão da cadeia de custódia na Unidade Regional de Custódia (URC) de Lavras/MG. O sistema conta com backend próprio (Fastify + PostgreSQL) responsável por autenticação, auditoria e integridade da cadeia de custódia, e frontend em React.

> ### 🚩 Marco inicial — 10/09/2026
>
> **O EvidenceOS é a fonte de verdade da cadeia de custódia.** Desde 10 de setembro de 2026, todos os lançamentos e edições de vestígios são feitos **diretamente no sistema**.
>
> A planilha do Google Drive, que era a base operacional até então, **deixou de ser alimentada** e passou a ser arquivo histórico. Os 5.216 vestígios que ela continha foram migrados para o banco.
>
> Consequência para quem for mexer no código: a sincronização a partir da planilha (seção 5) é **operação histórica**. Ela não deve mais ser executada com exclusões — um vestígio que está no banco e não está na planilha é hoje um lançamento normal da equipe, não um resíduo. Ver `docs/plans/2026-07-26-reimportacao-planilha-google.md`, Parte 7.

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

### 3. 📅 Solicitação de Retirada
*   **Registro no EvidenceOS:** toda solicitação de retirada, individual ou em lote, é gravada no sistema (`withdrawal_requests`) com solicitante, data e hora, e o motivo de cada item. O acompanhamento é feito pelo painel "Retiradas Agendadas" (a integração com o Google Agenda foi retirada em 10/09/2026).
*   **Controle de Motivos:** seleção obrigatória do motivo de saída por item, com opção de aplicar em massa, e justificativa obrigatória para "Outros".
*   **Regra de Negócio (24h):** validada também no servidor. Só o ADMIN pode agendar com menos de 24h, com justificativa escrita que fica registrada e destacada no painel.
*   **Painel "Retiradas Agendadas":** lista as demandas por status e data, marcando atrasadas e urgentes. ADMIN e PERITO registram a retirada item a item (retirada parcial permitida), cancelam ou marcam "Não compareceu". Registrar a retirada move os vestígios marcados para "Retirado" e grava o histórico de destinação.
*   **Selo no card:** vestígio com retirada agendada exibe o selo âmbar "Retirada agendada".

### 4. 🔗 Integração com o PCNET
*   **Acesso Direto por FAV:** abre a tela do PCNET a partir do número de registro FAV do vestígio.
*   **Registro de Solicitação:** cada acesso (visualização de FAV ou movimentação) é logado em `pcnet_action_logs`, com status `SOLICITADO` — o EvidenceOS registra a intenção de acesso, mas não confirma alterações feitas diretamente no PCNET.

### 5. 🔄 Sincronização com a Planilha do Drive *(histórica — encerrada em 10/09/2026)*
*   Importação/atualização dos vestígios a partir da planilha oficial do Google Drive, com diagnóstico prévio e relatório de divergências antes de qualquer gravação (agente `sincronizador-drive`).
*   **Foi o mecanismo de migração, não é mais operação de rotina.** Com o marco inicial, o banco virou a fonte de verdade e a planilha parou de ser alimentada. Executar a sincronização com exclusões hoje apagaria lançamentos da equipe — o agente tem instrução explícita de recusar isso.

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
    *   Pode consultar o painel de Retiradas Agendadas (sem ações).
    *   Pode consultar Normas/FAQ.

2.  **PERITO:**
    *   Todas as funções do Visualizador.
    *   Pode registrar movimentações relacionadas à custódia dos vestígios sob sua responsabilidade.
    *   No painel de Retiradas Agendadas: registra a retirada, cancela a solicitação ou marca "Não compareceu".

3.  **ADMIN:**
    *   Todas as funções anteriores.
    *   **Inserir/Editar/Excluir** vestígios e categorias.
    *   Gerenciar usuários do sistema.
    *   Visualizar Logs de Auditoria.
    *   Gerenciar Normas/FAQ.

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

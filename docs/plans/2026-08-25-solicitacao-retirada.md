# Plano — Registro de Solicitação de Retirada de Vestígio

**Data:** 2026-08-25
**Status:** 📋 **PLANO ESCRITO, NADA IMPLEMENTADO.** Nenhuma etapa iniciada. Nenhum arquivo de código foi criado ou alterado por este plano.
**Escopo:** fazer o EvidenceOS **registrar** as solicitações de retirada de vestígios, que hoje existem apenas como um link para o Google Agenda e não deixam nenhum rastro no sistema.

> ## 📍 Para o agente que for executar este plano
>
> Vá para a **Parte 6 — Plano de Execução**. Cada etapa tem um bloco `**Status:**` — é a primeira coisa a checar ao retomar e a primeira a atualizar antes de sair, mesmo que a etapa não tenha terminado.
>
> **Leia a Parte 2 antes de escrever qualquer linha.** Ela contém decisões de arquitetura já discutidas e aprovadas com o usuário em 2026-08-25. Reabrir qualquer uma delas por conta própria é retrabalho garantido.
>
> **Gates de aprovação (Regra de Ouro do CLAUDE.md).** O usuário aprovou explicitamente **a direção geral** em 2026-08-25 ("precisamos registrar todas essas retiradas. Concordo"). Isso **não** é aprovação em branco para o que estiver marcado com 🚦 neste documento. Dois gates continuam abertos e exigem aprovação explícita antes de codar:
> - 🚦 **ETAPA 3, item 5** — validar a regra das 24h também no servidor (muda uma regra de negócio da cadeia de custódia).
> - 🚦 **Parte 9, Fase 3** — acoplar a conclusão da retirada à mudança de `destinacao`.
>
> **Armadilha conhecida do ambiente (herdada do plano do PCNET):** `npx prisma migrate dev` falha com `P3014` neste projeto — o usuário `evidenceos_app` do Postgres local não tem permissão para criar shadow database. **Escreva o SQL da migration à mão** e aplique com `npx prisma migrate deploy`. O SQL pronto está na Parte 3.4.
>
> **Não use menus de perguntas prontas (AskUserQuestion).** Regra registrada no CLAUDE.md em 2026-08-25. Explique em texto corrido e espere.

---

## Parte 1 — Diagnóstico: como funciona hoje

### 1.1 O fluxo existente

Dois pontos de entrada, ambos abrindo o mesmo componente:

| Origem | Arquivo | Linha |
|---|---|---|
| Botão "Agendar (Individual)" no card do vestígio | `client/components/VestigeCard.tsx` | 266-273 |
| Botão "Agendar Lote" na barra flutuante de selecionados | `client/components/Dashboard.tsx` | 248 |
| Componente do modal | `client/components/ScheduleModal.tsx` | — |

O modal pede, **por item**, o motivo da saída (`Destruição`, `Restituição`, `Análise pela Investigação`, `Solicitação Judicial`, `Outros`), e globalmente uma data, um horário e observações gerais.

### 1.2 O que já funciona corretamente (não regredir)

Verificado linha a linha em 2026-08-25. **Preservar tudo isto:**

- **Bloqueio de antecedência < 24h** (`ScheduleModal.tsx:58-68`).
- **Motivo obrigatório em todos os itens** e **justificativa obrigatória** quando o motivo é "Outros" (`ScheduleModal.tsx:70-80`).
- **A conversão de horário para o Google está correta.** `formatGCalDate` usa `toISOString()` e o regex `/-|:|\.\d\d\d/g` **preserva o sufixo `Z`**, gerando `20260826T143000Z`. O Google interpreta como UTC e exibe no fuso do usuário. **Não "conserte" isso** — está certo.
- **`min` no input de data**, que impede escolher dia passado no seletor.
- **Aplicar motivo em massa** no modo lote (`handleApplyToAll`).

### 1.3 O buraco (motivo deste plano)

1. **Zero rastro no EvidenceOS.** `ScheduleModal.tsx` não importa `auditService` nem chama nenhuma rota. Compare com os botões do PCNET no mesmo card, que chamam `logPcnetAction` — o agendamento não chama nada.
2. **Nada no backend.** Busca por `retirada`, `agendamento`, `schedule` e `withdraw` em `server/src` e `schema.prisma`: **nenhuma ocorrência**. Não existe tabela, rota ou modelo.
3. **O vestígio não muda de estado.** A `destinacao` continua `NAO_INICIADO`; olhando a listagem é impossível saber que há retirada marcada.
4. **O evento nasce na agenda pessoal de quem clicou.** O link usa `action=TEMPLATE` com `add=pericia.lavras@gmail.com` — cria na conta Google logada no navegador e *convida* a URC. Se o usuário fechar a aba sem salvar, **nada aconteceu em lugar nenhum**.

Consequência prática: o sistema não responde "quais retiradas estão agendadas para esta semana?" nem "quem pediu a retirada da FAV X e por quê?".

### 1.4 Defeitos menores a corrigir de carona

| Defeito | Arquivo | Correção |
|---|---|---|
| Justificativa de "Outros" limitada a 20 caracteres | `ScheduleModal.tsx:212` (`maxLength={20}`) | subir para 200, espelhado no Zod do backend |
| `window.open` sem `noopener` | `ScheduleModal.tsx:130` | `window.open(url, '_blank', 'noopener,noreferrer')`, como já faz o `VestigeCard.tsx` |

---

## Parte 2 — Decisões de arquitetura (já tomadas — não renegociar)

### 2.1 Registrar **intenção**, nunca fato consumado

O EvidenceOS registra que **alguém pediu** a retirada de tais itens, para tal dia e hora, por tal motivo. O ato oficial da saída continua sendo a movimentação na FAV do PCNET.

É o mesmo princípio já adotado no `PcnetActionLog`, cujo comentário no `schema.prisma` diz textualmente que o status é sempre `SOLICITADO` porque "o EvidenceOS só abre a tela do PCNET, não confirma se o usuário salvou algo lá". **A retirada segue essa mesma honestidade:** nada de status preenchido automaticamente, porque o sistema não tem como saber se a pessoa apareceu.

### 2.2 Uma solicitação com N itens, não N linhas soltas

Um agendamento em lote de 12 itens é **um** evento, em **um** horário. Modelar como uma `WithdrawalRequest` com 12 `WithdrawalRequestItem` preserva isso — permite listar "26/08, 14h, 12 itens, solicitante Fulano" em vez de doze linhas que ninguém reagrupa. Cada item mantém seu próprio motivo, que é exatamente o formato do modal atual.

### 2.3 O agendamento **NÃO** toca na `destinacao` ⚠️

Este é o ponto mais fácil de errar. Leia com atenção.

A `destinacao` hoje tem dois valores e o `client/types.ts` documenta o porquê: `NAO_INICIADO` = está na URC, `RETIRADO` = saiu. Uma retirada **agendada** não é nenhum dos dois — o item ainda está fisicamente na prateleira.

Marcar `RETIRADO` no agendamento faria o card exibir a faixa vermelha "Não está na URC" (`VestigeCard.tsx`, função `estaForaDaUrc`) para um vestígio que está lá. Isso **corrompe o sinal visual** que existe hoje e é confiável.

Portanto: o agendamento cria a solicitação e **não escreve nada em `Vestige`**. O card ganha um selo próprio, âmbar, derivado da existência de solicitação em aberto. A mudança de `destinacao` para `RETIRADO` fica para a Fase 3 (fora do escopo deste plano, gate 🚦 na Parte 9).

### 2.4 Gravar primeiro, abrir o Google depois — em dois cliques

**Armadilha técnica real.** Hoje o `window.open` acontece direto no clique. Colocar um `await` do POST antes dele faz o **navegador bloquear o popup**: o gesto do usuário se perde durante a chamada assíncrona.

Solução, que também é a ordem correta de prioridades:

1. Usuário clica em "Confirmar Solicitação" → `await POST /api/withdrawal-requests`.
2. **Se falhar:** mostra o erro no modal e **não abre nada**. (Hoje é o inverso: o evento vai para o Google e o sistema nunca fica sabendo.)
3. **Se gravar:** o modal troca para um estado de sucesso, com o resumo do que foi registrado e um botão "Abrir no Google Agenda".
4. O clique nesse botão é um **gesto novo** → `window.open` síncrono, sem bloqueio de popup. Dispara também, em background, `POST /:id/calendar-opened`.

Efeito colateral desejado: **o registro passa a ser o ato principal e a agenda vira conveniência.**

### 2.5 Não bloquear duplicidade, apenas avisar

Se o vestígio já tem solicitação em aberto, ou se já está com `destinacao = RETIRADO`, a UI **avisa** mas **não impede**. Bloquear atrapalharia remarcações legítimas e correções de dado defasado. O backend não valida isso; quem avisa é o front, usando o índice de solicitações abertas que ele já vai ter carregado para o selo do card.

### 2.6 Cancelamento é status, não exclusão

Não existe `deletedAt` em `withdrawal_requests`. Uma solicitação cancelada vira `status = CANCELADA` e permanece na tabela. Registro de custódia não se apaga.

---

## Parte 3 — Modelo de dados

### 3.1 Visão geral

Duas tabelas novas. **Nenhuma tabela existente é alterada.** Migration puramente aditiva, sem backfill, sem risco para os dados atuais.

### 3.2 Valores válidos (fonte única de verdade)

```
status da solicitação:  SOLICITADA | CONCLUIDA | CANCELADA | NAO_COMPARECEU
motivo do item:         Destruição | Restituição | Análise pela Investigação | Solicitação Judicial | Outros
```

`SOLICITADA` é o único status atribuído pelo sistema. Os outros três são **sempre** definidos manualmente por um operador.

> ⚠️ Os motivos precisam bater **exatamente** (acentos inclusive) entre `REASONS` no client e `VALID_REASONS` no backend. O projeto já tem esse padrão de espelhamento em `VALID_ESTADO_CONSERVACAO` (`vestigeRoutes.ts`) vs. `ESTADO_CONSERVACAO_OPTIONS` (`types.ts`). Deixe um comentário em cada lado apontando para o outro.

### 3.3 Models do Prisma

Acrescentar em `server/prisma/schema.prisma`. **Todo model neste projeto precisa de `@@schema("public")`** — não esqueça, o datasource usa `schemas = ["public"]`.

```prisma
model WithdrawalRequest {
  id               String    @id @default(uuid())
  scheduledFor     DateTime  @map("scheduled_for")
  status           String    @default("SOLICITADA")
  notes            String?
  requestedBy      String    @map("requested_by")
  requestedAt      DateTime  @default(now()) @map("requested_at")
  // Sabemos que a aba do Google foi aberta; nunca que o evento foi salvo lá.
  // Mesma honestidade do PcnetActionLog.
  calendarOpenedAt DateTime? @map("calendar_opened_at")
  statusChangedBy  String?   @map("status_changed_by")
  statusChangedAt  DateTime? @map("status_changed_at")
  statusNote       String?   @map("status_note")

  requester        User      @relation("WithdrawalRequestedBy", fields: [requestedBy], references: [id])
  statusChanger    User?     @relation("WithdrawalStatusChangedBy", fields: [statusChangedBy], references: [id])
  items            WithdrawalRequestItem[]

  @@index([scheduledFor])
  @@index([status])
  @@map("withdrawal_requests")
  @@schema("public")
}

model WithdrawalRequestItem {
  id           BigInt  @id @default(autoincrement())
  requestId    String  @map("request_id")
  vestigeId    String  @map("vestige_id")
  reason       String
  reasonDetail String? @map("reason_detail")

  request      WithdrawalRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
  vestige      Vestige           @relation(fields: [vestigeId], references: [id])

  @@index([requestId])
  @@index([vestigeId])
  @@map("withdrawal_request_items")
  @@schema("public")
}
```

**Relações inversas obrigatórias** (o `prisma generate` falha sem elas):

- No model `User`, junto das demais relações:
  ```prisma
  withdrawalRequests      WithdrawalRequest[] @relation("WithdrawalRequestedBy")
  withdrawalStatusChanges WithdrawalRequest[] @relation("WithdrawalStatusChangedBy")
  ```
- No model `Vestige`:
  ```prisma
  withdrawalItems WithdrawalRequestItem[]
  ```

### 3.4 SQL da migration (escrever à mão — ver armadilha P3014)

Criar `server/prisma/migrations/<AAAAMMDD>_0001_add_withdrawal_requests/migration.sql`, seguindo o padrão de nome das existentes (ex.: `20260825_0001_add_withdrawal_requests`). Use a data do dia em que a migration for escrita.

```sql
-- CreateTable
CREATE TABLE "withdrawal_requests" (
    "id" TEXT NOT NULL,
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SOLICITADA',
    "notes" TEXT,
    "requested_by" TEXT NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "calendar_opened_at" TIMESTAMP(3),
    "status_changed_by" TEXT,
    "status_changed_at" TIMESTAMP(3),
    "status_note" TEXT,

    CONSTRAINT "withdrawal_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawal_request_items" (
    "id" BIGSERIAL NOT NULL,
    "request_id" TEXT NOT NULL,
    "vestige_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "reason_detail" TEXT,

    CONSTRAINT "withdrawal_request_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "withdrawal_requests_scheduled_for_idx" ON "withdrawal_requests"("scheduled_for");

-- CreateIndex
CREATE INDEX "withdrawal_requests_status_idx" ON "withdrawal_requests"("status");

-- CreateIndex
CREATE INDEX "withdrawal_request_items_request_id_idx" ON "withdrawal_request_items"("request_id");

-- CreateIndex
CREATE INDEX "withdrawal_request_items_vestige_id_idx" ON "withdrawal_request_items"("vestige_id");

-- AddForeignKey
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_status_changed_by_fkey" FOREIGN KEY ("status_changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_request_items" ADD CONSTRAINT "withdrawal_request_items_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "withdrawal_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_request_items" ADD CONSTRAINT "withdrawal_request_items_vestige_id_fkey" FOREIGN KEY ("vestige_id") REFERENCES "vestiges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

Aplicar com:

```bash
cd server
npx prisma migrate deploy
npx prisma generate
```

---

## Parte 4 — Contrato da API

Arquivo novo: `server/src/routes/withdrawalRoutes.ts`. Registrar em `server/src/server.ts`:

```ts
server.register(withdrawalRoutes, { prefix: '/api/withdrawal-requests' });
```

Use `server/src/routes/pcnetRoutes.ts` como modelo — ele é o exemplo mais próximo em espírito (registro de intenção + auditoria dupla). Copie de lá o `addHook('onRequest', ...)` com `jwtVerify`.

### 4.1 `POST /api/withdrawal-requests` — criar solicitação

**Permissão:** qualquer usuário autenticado. O README define que VISUALIZADOR pode agendar retiradas; não restrinja aqui.

**Body:**
```jsonc
{
  "scheduledFor": "2026-08-27T17:00:00.000Z",  // instante ISO (o client manda toISOString())
  "notes": "Observações gerais, opcional",
  "items": [
    { "vestigeId": "uuid", "reason": "Destruição" },
    { "vestigeId": "uuid", "reason": "Outros", "reasonDetail": "Texto livre" }
  ]
}
```

**Validações Zod (todas obrigatórias):**

1. `items` com no mínimo 1 e no máximo 200 elementos.
2. `reason` dentro de `VALID_REASONS`.
3. **`reasonDetail` obrigatório e não-vazio quando `reason === 'Outros'`** — use `.superRefine()`, não dá para expressar com schema plano.
4. `reasonDetail` com `.max(200)`; `notes` com `.max(1000)`.
5. 🚦 **Regra das 24h no servidor** — rejeitar `scheduledFor < now + 24h` com **400**. **GATE DE APROVAÇÃO.** Hoje a regra existe só no navegador e é contornável mudando o relógio da máquina. Trazê-la para o servidor a torna real, mas **muda uma regra de negócio da cadeia de custódia** e o CLAUDE.md exige aprovação explícita. Ponto adicional a levantar com o usuário na mesma conversa: se ADMIN deve poder furar o prazo mediante justificativa obrigatória, ou se o bloqueio vale para todos sem exceção. **Não implemente nenhuma das duas versões sem resposta.**
6. `vestigeId` duplicado dentro do mesmo `items` → **400** (é erro de montagem do payload, não caso de uso).

**Validação de existência:** buscar todos os `vestigeId` com `deletedAt: null` numa consulta só. Se algum não existir, responder **400** listando os ids faltantes. Não crie a solicitação parcialmente.

**Gravação:** criar `WithdrawalRequest` + itens em **uma única** `prisma.$transaction` (ou `create` com `items: { create: [...] }`, que já é atômico). Uma solicitação sem itens é um registro corrompido.

**Auditoria:** após gravar, chamar `auditService.log` — igual ao `pcnetRoutes.ts`:
```ts
action:     'WITHDRAWAL_REQUESTED'
targetType: 'withdrawal_request'
targetId:   request.id
details:    { scheduledFor, itemCount, vestigeIds, reasons }
```
Lembre que `auditService.log` engole exceções por decisão de projeto — a falha de auditoria é silenciosa e **não** deve derrubar a criação.

**Resposta:** `201` com a solicitação criada, itens incluídos, cada item já com `material`, `registroFav` e `municipio` do vestígio (o modal usa para montar o resumo e o corpo do evento do Google).

### 4.2 `GET /api/withdrawal-requests` — listar

**Permissão:** qualquer usuário autenticado (o front precisa disso para o selo do card).

**Query params:** `status`, `from`, `to` (filtram `scheduledFor`), `vestigeId`, `page`, `limit` (default 50, teto 200).

Siga o formato de paginação já usado no projeto: `{ items, meta: { total, page, limit, totalPages } }`.

Cada item traz a solicitação com `items` (incluindo dados do vestígio) e o `requester` (`name`, `email`).

### 4.3 `GET /api/withdrawal-requests/:id` — detalhe

Solicitação completa com itens, solicitante e quem alterou o status. **404** se não existir.

### 4.4 `PATCH /api/withdrawal-requests/:id/status` — mudar status

**Permissão:** apenas `ADMIN` e `PERITO` (copie o padrão do `requireEditorAccess` de `vestigeRoutes.ts`).

**Body:** `{ "status": "CONCLUIDA" | "CANCELADA" | "NAO_COMPARECEU", "statusNote": "opcional" }`.

**Transições válidas — apenas a partir de `SOLICITADA`.** Status terminal não muda mais: se a solicitação já não estiver `SOLICITADA`, responder **409** com mensagem clara. Isso preserva a integridade do registro; correção de erro se faz criando nova solicitação, não reescrevendo o histórico.

Preencher `statusChangedBy`, `statusChangedAt` e `statusNote`. Auditar com `action: 'WITHDRAWAL_STATUS_CHANGED'` e `details: { fromStatus, toStatus, statusNote }`.

**Nesta fase, não escrever nada em `Vestige`** — ver Parte 2.3.

### 4.5 `POST /api/withdrawal-requests/:id/calendar-opened`

Preenche `calendarOpenedAt` com `now()` — só se ainda estiver nulo (primeira abertura é a que importa). Responde **204**. Chamada em background pelo front; falha aqui **nunca** deve atrapalhar a UI.

---

## Parte 5 — Mudanças no front

### 5.1 `client/types.ts` — tipos e rótulos

Acrescentar, seguindo o padrão já usado por `DESTINACAO_OPTIONS` (array `as const` + função `get...Label`):

- `WITHDRAWAL_REASONS` — mover para cá a constante `REASONS` que hoje está solta em `ScheduleModal.tsx:13-19`, para virar fonte única compartilhada.
- `WITHDRAWAL_STATUS_OPTIONS` + `getWithdrawalStatusLabel`. Rótulos sugeridos: `SOLICITADA` → "Agendada", `CONCLUIDA` → "Concluída", `CANCELADA` → "Cancelada", `NAO_COMPARECEU` → "Não compareceu".
- Interfaces `WithdrawalRequest` e `WithdrawalRequestItem`.

### 5.2 `client/services/withdrawalService.ts` — arquivo novo

Espelhe o estilo de `dataService.ts` (mapper de resposta da API para o tipo do front, `apiRequest` do `apiClient`):

- `createWithdrawalRequest(payload)`
- `listWithdrawalRequests(filters)`
- `updateWithdrawalStatus(id, status, statusNote?)`
- `markCalendarOpened(id)` — chamada "fire and forget", com `.catch()` que só loga no console (mesmo padrão do `logPcnetAction` no `VestigeCard.tsx`)
- `buildGoogleCalendarUrl(request)` — **mover para cá** toda a montagem da URL que hoje está dentro do `handleConfirm` (`ScheduleModal.tsx:85-128`), incluindo `formatGCalDate`. Passa a receber a solicitação já gravada, então o corpo do evento pode citar o número/ID da solicitação.

### 5.3 `client/components/ScheduleModal.tsx` — reescrita do submit

**Preservar integralmente:** as validações de 1.2, o layout, o seletor de motivo por item e o "aplicar a todos".

**Mudar:** o componente passa a ter duas fases, controladas por um estado `createdRequest: WithdrawalRequest | null`.

**Fase formulário** (o que já existe). No submit, depois das validações locais:
```
setSubmitting(true)
try {
  const created = await createWithdrawalRequest({ scheduledFor, notes, items })
  setCreatedRequest(created)          // vai para a fase sucesso
} catch (err) {
  setError(mensagem)                   // NÃO abre o Google
} finally {
  setSubmitting(false)
}
```
Desabilite o botão enquanto `submitting` — sem isso, duplo clique cria duas solicitações.

**Fase sucesso** (nova). Mostra: confirmação de que ficou registrado, data/hora, lista de itens com motivos, e dois botões — "Abrir no Google Agenda" (primário) e "Fechar". O primeiro faz, **de forma síncrona**:
```ts
window.open(buildGoogleCalendarUrl(createdRequest), '_blank', 'noopener,noreferrer');
markCalendarOpened(createdRequest.id).catch(console.error);
```
Deixe claro no texto da tela que **o registro já está salvo** e que abrir a agenda é opcional. É isso que impede o usuário de achar que perdeu o trabalho ao fechar sem abrir o Google.

**Aviso de duplicidade** (Parte 2.5): se algum item já tiver solicitação em aberto, mostrar um alerta amarelo não-bloqueante na fase formulário.

**Correções de carona:** `maxLength={20}` → `maxLength={200}` no input de justificativa; `noopener,noreferrer` no `window.open`.

### 5.4 `client/hooks/useVestiges.ts` — índice de solicitações abertas

Em `loadData()`, junto do `Promise.all` que já busca vestígios e categorias, buscar `listWithdrawalRequests({ status: 'SOLICITADA' })` e montar um `Map<vestigeId, WithdrawalRequest>`. Expor como `openWithdrawals` no retorno do hook.

**Não** mexa na query de vestígios nem no `fetchAllVestiges` — a busca é o caminho crítico da tela e não deve ganhar peso por causa disto.

Se essa chamada falhar, **degrade em silêncio** (map vazio, selo não aparece): a listagem de vestígios não pode quebrar por causa de um enfeite.

### 5.5 `client/components/VestigeCard.tsx` — selo "Retirada agendada"

Nova prop opcional `withdrawal?: WithdrawalRequest`. Quando presente, exibir um selo âmbar `Retirada agendada — 26/08 14h` perto do badge "Situação".

**Âmbar, não vermelho.** O vermelho já significa "não está na URC" (`estaForaDaUrc`) e não pode passar a significar duas coisas.

Encadear a prop por `SearchResults.tsx` a partir do `Dashboard.tsx`.

### 5.6 `client/components/WithdrawalRequestsModal.tsx` — arquivo novo

Modal de gestão, no padrão de `AuditLogModal.tsx` / `FAQManagementModal.tsx`:

- Filtro por status (default: `SOLICITADA`) e por período.
- Lista agrupada por solicitação: data/hora, solicitante, nº de itens, status; expandindo, mostra os itens com material, FAV e motivo.
- Ações "Concluir", "Cancelar" e "Não compareceu" — **visíveis apenas para ADMIN e PERITO** (`user.role`), com campo opcional de observação. Após a ação, recarregar a lista.

### 5.7 `client/components/AdminPanel.tsx` — botão de acesso

Acrescentar "Retiradas Agendadas" ao Painel Operacional. A grade hoje é `lg:grid-cols-5` com 5 botões — passará a 6, então ajuste para `lg:grid-cols-3` (duas linhas de 3) para não espremer.

Em `hasPermission`, tratar como `'RETIRADAS'` retornando `true` (todos veem a lista; só ADMIN/PERITO mudam status, controle que fica dentro do modal). Passar pelo `handleAction`, que já registra auditoria de acesso ao recurso.

---

## Parte 6 — Plano de Execução

> Ordem obrigatória. As etapas de escrita dependem da infraestrutura das anteriores. Atualize o `**Status:**` de cada etapa antes de encerrar a sessão.

### ETAPA 0 — Preparação
**Status:** ⬜ não iniciada

1. Confirmar que a `main` está limpa (`git status`) e criar branch de trabalho.
2. Subir o ambiente: `npm run dev:full` na raiz.
3. Reler a Parte 2 deste documento.
4. Conferir se os dois gates 🚦 já foram respondidos pelo usuário. Se não, **pergunte antes de chegar na ETAPA 3**.

### ETAPA 1 — Banco de dados
**Status:** ⬜ não iniciada

1. Acrescentar os dois models e as três relações inversas em `server/prisma/schema.prisma` (Parte 3.3).
2. Criar a pasta e o `migration.sql` à mão (Parte 3.4). **Não use `migrate dev`** — ver P3014.
3. `npx prisma migrate deploy` e `npx prisma generate` dentro de `server/`.
4. **Verificar de fato:** conectar no banco e confirmar que as duas tabelas, os quatro índices e os quatro FKs existem. Não confie na ausência de erro no terminal.

### ETAPA 2 — Rotas de leitura
**Status:** ⬜ não iniciada

Criar `withdrawalRoutes.ts` com `GET /` e `GET /:id`, registrar no `server.ts`, e testar com dado inserido à mão no banco. Ler antes de escrever mantém a superfície de risco baixa enquanto o contrato é validado.

### ETAPA 3 — Rota de criação 🚦
**Status:** ⬜ não iniciada — **depende do gate das 24h (Parte 4.1, item 5)**

1. Implementar `POST /` com todas as validações da Parte 4.1.
2. Transação atômica: solicitação + itens.
3. `auditService.log` com `WITHDRAWAL_REQUESTED`.
4. Testar com `curl`: caso feliz, item inexistente, "Outros" sem justificativa, lista vazia, `vestigeId` repetido.
5. 🚦 A validação das 24h no servidor só entra **depois** da aprovação explícita.

### ETAPA 4 — Rotas de status e calendário
**Status:** ⬜ não iniciada

`PATCH /:id/status` (com a trava de status terminal → 409) e `POST /:id/calendar-opened`. Testar transição inválida e dupla marcação de calendário.

### ETAPA 5 — Camada de serviço no front
**Status:** ⬜ não iniciada

`types.ts` (5.1) e `withdrawalService.ts` (5.2), incluindo a mudança do `buildGoogleCalendarUrl` para lá. Nenhuma tela muda ainda; ao fim, `npx tsc --noEmit` em `client/` deve passar.

### ETAPA 6 — ScheduleModal em duas fases
**Status:** ⬜ não iniciada

O coração da mudança (5.3). **Teste o bloqueio de popup de verdade**, com o bloqueador do navegador ativo — é a razão de existir do desenho em duas fases.

### ETAPA 7 — Selo no card
**Status:** ⬜ não iniciada

`useVestiges.ts` (5.4), `VestigeCard.tsx` (5.5) e o encadeamento de props. Confirmar que a listagem continua funcionando com a rota de retiradas fora do ar (degradação silenciosa).

### ETAPA 8 — Tela de gestão
**Status:** ⬜ não iniciada

`WithdrawalRequestsModal.tsx` (5.6) e o botão no `AdminPanel.tsx` (5.7). Testar com os três perfis.

### ETAPA 9 — Verificação ponta a ponta
**Status:** ⬜ não iniciada

Executar a Parte 7 inteira. **Não marque nada como concluído sem rodar os testes** — o CLAUDE.md tem uma skill `verification-before-completion` justamente para isso.

### ETAPA 10 — Commit e implantação
**Status:** ⬜ não iniciada

Só depois da ETAPA 9 passar por completo. Ver Parte 8.

---

## Parte 7 — Roteiro de testes

### 7.1 Backend (curl)

| # | Cenário | Esperado |
|---|---|---|
| 1 | POST válido, 1 item | 201, solicitação com 1 item |
| 2 | POST válido, 12 itens em lote | 201, uma solicitação com 12 itens |
| 3 | POST com `items: []` | 400 |
| 4 | POST com `vestigeId` inexistente | 400 citando o id; **nada gravado** |
| 5 | POST com `reason: "Outros"` sem `reasonDetail` | 400 |
| 6 | POST com `reasonDetail` de 300 caracteres | 400 |
| 7 | POST com o mesmo `vestigeId` duas vezes | 400 |
| 8 | POST sem JWT | 401 |
| 9 | PATCH status como VISUALIZADOR | 403 |
| 10 | PATCH `SOLICITADA` → `CONCLUIDA` como PERITO | 200 |
| 11 | PATCH de novo na já concluída | 409 |
| 12 | POST `/calendar-opened` duas vezes | 204 nas duas; `calendar_opened_at` mantém o **primeiro** instante |
| 13 | 🚦 POST com `scheduledFor` daqui a 2h | 400 (só se o gate das 24h tiver sido aprovado) |

### 7.2 Banco — o teste que realmente importa

Após o cenário 2, rodar:

```sql
SELECT wr.id, wr.scheduled_for, wr.status, u.name AS solicitante, COUNT(wri.id) AS itens
FROM withdrawal_requests wr
JOIN users u ON u.id = wr.requested_by
LEFT JOIN withdrawal_request_items wri ON wri.request_id = wr.id
GROUP BY wr.id, u.name
ORDER BY wr.requested_at DESC;

SELECT action, user_name, target_id, details, created_at
FROM audit_logs
WHERE action LIKE 'WITHDRAWAL%'
ORDER BY created_at DESC LIMIT 10;
```

A segunda query é obrigatória: o CLAUDE.md avisa que **falha de gravação de auditoria é silenciosa por decisão de projeto** — a tela funciona normalmente mesmo sem o log ter sido gravado. Sem olhar a tabela, você não sabe se a auditoria funcionou.

### 7.3 Interface

1. Agendar individual pelo card → confirmar → **fechar o modal sem abrir o Google** → reabrir a tela de retiradas e ver que a solicitação está lá. *(Este é o cenário que hoje perde tudo.)*
2. Agendar em lote com 3 itens e motivos diferentes → conferir os 3 motivos no registro.
3. **Com bloqueador de popup ativo**, clicar em "Abrir no Google Agenda" → a aba precisa abrir.
4. Conferir no evento do Google que data, hora e fuso batem com o solicitado.
5. Derrubar o backend (`Ctrl+C` no server) e tentar confirmar → erro no modal, **nenhuma aba do Google aberta**.
6. Tentar agendar com menos de 24h → bloqueio, mensagem clara.
7. Vestígio com solicitação em aberto → selo âmbar no card, sem faixa vermelha.
8. Agendar duas vezes o mesmo vestígio → aviso amarelo, mas permite.
9. Login como VISUALIZADOR: consegue criar solicitação; **não** vê os botões de mudar status.
10. Concluir uma solicitação e confirmar que a `destinacao` do vestígio **não** mudou (Parte 2.3).

### 7.4 Type-check

```bash
cd client && npx tsc --noEmit
cd ../server && npx tsc --noEmit
```

---

## Parte 8 — Implantação

Mudança **full-stack**: `server/` **e** `client/`, com migration nova.

| Serviço | Ação | Detalhe |
|---|---|---|
| **api** | Implantar **+ migration à mão** | Após o build, no console do serviço `api`: `cd /app && npx prisma@<versão do projeto> migrate deploy`. **O deploy não roda migrations sozinho.** A versão do Prisma no projeto hoje é `7.7.0`. |
| **web** | Implantar | Depois do build, **`Ctrl+Shift+R`** no navegador — o nginx serve estático com cache e um F5 comum entrega o bundle antigo. |
| **db** | **Nenhuma ação** | Não rodar a migration aqui via `psql`: o Prisma não registraria como aplicada e quebraria a próxima. |

**Ordem:** `api` (com a migration) **antes** do `web`. Se o `web` novo subir primeiro, ele chama rotas que ainda não existem e o modal quebra em produção.

**Confirmação pós-deploy:** criar uma solicitação real e conferir em Logs de Auditoria que o `WITHDRAWAL_REQUESTED` apareceu. Não confie no "o botão funcionou".

---

## Parte 9 — Fora de escopo (fases futuras)

### Fase 3 — Acoplar conclusão à `destinacao` 🚦
**GATE DE APROVAÇÃO EXPLÍCITA.** Ao marcar uma solicitação como `CONCLUIDA`, oferecer (nunca fazer em silêncio) a mudança de `destinacao` para `RETIRADO` nos itens, gravando pelo `VestigeDestinationLog` já existente — que registra de-para, autor e timestamp. Deve ser ação explícita do operador, com checkbox, jamais efeito colateral automático.

### Fase 4 — Encadear com "Movimentar FAV"
Na tela de retiradas, botão que abre direto a movimentação no PCNET para cada FAV, reaproveitando `buildPcnetUrl` e `logPcnetAction`. Fecha o ciclo: intenção registrada aqui → ato oficial lá.

### Fase 5 — Agenda oficial da unidade
Hoje o evento nasce na conta Google de quem clicou (Parte 1.3, item 4). Gravar direto na agenda oficial exigiria OAuth com a conta da URC e é um projeto próprio, com implicações de credencial que este plano não cobre.

### Não fazer
- **Notificação por e-mail da solicitação.** O `emailService.ts` existe e seria fácil, mas ninguém pediu. Não invente escopo.
- **Aprovação/workflow de duas etapas** (solicita → chefia aprova). Não foi pedido e mudaria o modelo de status inteiro.

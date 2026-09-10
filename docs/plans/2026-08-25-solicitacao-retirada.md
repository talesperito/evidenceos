# Plano — Registro de Solicitação de Retirada de Vestígio

**Data:** 2026-08-25
**Revisão:** 2026-08-25 — revisão de engenharia sênior sobre o código real (ver **Parte 12 — Log de Revisão**)
**Atualização:** 2026-09-10 — plano realinhado ao código depois das **múltiplas requisições por vestígio** (commit `9c8efb7`): formato de requisição/invólucro, nome da migration e todas as referências `arquivo:linha` reconferidos. Ver **Parte 12, complemento de 2026-09-10**.
**Status:** ✅ **IMPLEMENTADO EM 2026-09-10 — backend testado por roteiro, principais cenários de interface testados pelo usuário, sem commit.** Status por etapa na Parte 6; desvios e resultados na Parte 12, complemento "Execução de 2026-09-10".
**⚠️ Google Agenda retirado em 2026-09-10 por decisão do usuário (R-48):** o acompanhamento é só pelo painel. Ficam **sem efeito** as partes do plano sobre o evento do Google — 2.4 (vale apenas o "gravar primeiro"), 2.7, 4.7, `buildGoogleCalendarUrl`/`markCalendarOpened` na 5.3, o botão da fase 2 na 5.4, a coluna `calendar_opened_at`, T-04, os itens 3, 4 e 11 da 7.3 e a Fase 5 da Parte 9.
**Escopo:** fazer o EvidenceOS **registrar** as solicitações de retirada de vestígios, que hoje existem apenas como um link para o Google Agenda e não deixam nenhum rastro no sistema.

---

> # 📍 Para o agente que for executar este plano
>
> ## Como usar este documento
>
> 1. **Leia a Parte 0** — mapa do repositório e fatos já verificados. Economiza horas de exploração e evita cinco enganos comuns.
> 2. **Leia a Parte 2** — decisões de arquitetura já discutidas e aprovadas com o usuário. Reabrir qualquer uma por conta própria é retrabalho garantido.
> 3. **Leia a Parte 11** — as armadilhas verificadas na revisão. Duas delas foram **reproduzidas em execução** e derrubariam a implementação em silêncio.
> 4. **Execute pela Parte 6.** Cada etapa tem um bloco `**Status:**` e um bloco `**Pronto quando:**` (critério objetivo de conclusão). Atualize o `**Status:**` antes de encerrar a sessão, mesmo que a etapa não tenha terminado.
>
> ## Gates de aprovação (Regra de Ouro do CLAUDE.md)
>
> O usuário aprovou explicitamente **a direção geral** em 2026-08-25 ("precisamos registrar todas essas retiradas. Concordo"). Isso **não** é aprovação em branco para o que estiver marcado com 🚦.
>
> - ✅ **GATE 1 — LIBERADO pelo usuário em 2026-08-25.** A regra das 24h passa a valer **também no servidor**, com **exceção exclusiva do ADMIN mediante justificativa obrigatória e registrada**. Ver **Parte 4.2 item 5** (regra e código), **Parte 2.11** (por que a exceção existe) e **Parte 5.4** (tela). Ninguém além de ADMIN fura o prazo — nem PERITO.
> - ✅ **GATE 2 — LIBERADO pelo usuário em 2026-08-25.** Registrar a retirada no painel e mudar a `destinacao` para `RETIRADO` deixou de ser fase futura: foi **pedido explicitamente** pelo usuário e entrou no escopo deste plano. Ver **Parte 2.9** (por que isso não contradiz a Parte 2.1), **Parte 4.8** (rota) e **Parte 5.9** (tela). O que o gate protegia continua valendo: **a mudança é sempre comando explícito de um operador, item a item, nunca efeito colateral automático.**
>
> A questão **R-03** (gravar rótulo ou código no campo `reason`) foi **decidida pelo usuário em 2026-08-25: grava-se o código**. Não é mais um gate — está incorporada ao plano. Ver Parte 3.3.
>
> ## Armadilhas do ambiente — leia antes do primeiro comando
>
> | # | Armadilha | O que fazer |
> |---|---|---|
> | **A1** | `npx prisma migrate dev` falha com **P3014** neste projeto: o usuário `evidenceos_app` do Postgres local não tem permissão para criar shadow database. | **Escreva o SQL da migration à mão** e aplique com `npx prisma migrate deploy`. SQL pronto na Parte 3.5. |
> | **A2** | `npx prisma` executado **fora de `server/`** baixa da internet o **prisma@8.0.0-rc.10** (verificado em 2026-08-25: nessa versão o comando `validate` nem existe) e ignora o `prisma.config.ts`. | **Sempre `cd server` antes de qualquer comando Prisma.** A versão do projeto é **7.7.0** (CLI e client). |
> | **A3** | O bloco `datasource db` do `schema.prisma` **não tem `url`**. A URL vem do `server/prisma.config.ts`, que lê `server/.env`. | Comandos Prisma só resolvem a conexão com o **cwd em `server/`**, onde o `prisma.config.ts` mora. |
> | **A4** | No PowerShell do Windows, `curl` é apelido de `Invoke-WebRequest` e **não aceita as flags do curl real**. | Use a ferramenta **Bash** (Git Bash traz o curl de verdade) ou chame `curl.exe` explicitamente. |
> | **A5** | O Tailwind vem por **CDN** (`client/index.html:7`), sem config e sem plugins. As classes `animate-in`, `fade-in`, `slide-in-from-*`, `zoom-in` e `custom-scrollbar` usadas no código **não existem** — são no-ops decorativos. | Use-as para manter o padrão do arquivo vizinho, mas **não conte com elas** para nada funcional e não perca tempo "consertando". |
> | **A6** | Não existe framework de teste no repositório (sem jest, vitest ou playwright). | Os testes deste plano são **manuais**: `curl`, SQL e checklist de tela (Parte 7). **Não instale framework de teste** — está fora do escopo. |
>
> ## Regras de conduta neste projeto
>
> - **Não use menus de perguntas prontas (AskUserQuestion).** Regra registrada no CLAUDE.md. Explique em texto corrido, recomende e espere.
> - **Não invente escopo.** A Parte 9 lista o que é deliberadamente "não fazer".
> - **Não marque etapa como concluída sem rodar a verificação.** Existe a skill `verification-before-completion` para isso.
> - **Responda em PT-BR**; código, comandos e nomes técnicos em inglês.

---

## Parte 0 — Mapa do repositório e fatos verificados

> Tudo nesta parte foi conferido no código em 2026-08-25 e **reconferido em 2026-09-10**. É a base factual do plano. Se algo aqui divergir do que você encontrar, **pare e investigue** antes de continuar: significa que o repositório mudou desde a revisão.

### 0.1 Onde as coisas ficam de verdade

O `CLAUDE.md` descreve `client/src/`. **No `client/` não existe `src/`** — os componentes ficam direto em `client/components/`. Os caminhos abaixo são os reais:

```
evidenceos/
├── client/
│   ├── types.ts                 ← tipos, rótulos e helpers de permissão (SEM src/)
│   ├── index.html               ← Tailwind por CDN + CSS de impressão
│   ├── components/
│   │   ├── Dashboard.tsx        ← orquestra tudo; renderiza o ScheduleModal do LOTE
│   │   ├── SearchResults.tsx    ← lista os cards (só repassa props)
│   │   ├── VestigeCard.tsx      ← card; renderiza o ScheduleModal INDIVIDUAL
│   │   ├── ScheduleModal.tsx    ← alvo principal deste plano
│   │   ├── AdminPanel.tsx       ← Painel Operacional (5 botões hoje)
│   │   ├── AuditLogModal.tsx    ← padrão de modal de listagem (usa createPortal)
│   │   └── icons/               ← 15 ícones; CalendarIcon e XIcon já existem
│   ├── hooks/useVestiges.ts     ← carga de dados e busca
│   └── services/
│       ├── apiClient.ts         ← apiRequest + refresh automático de token
│       ├── dataService.ts       ← mapper API→front, PCNET, checagem de duplicidade
│       └── auditService.ts      ← logAction (auditoria de evento de UI)
├── server/
│   ├── prisma.config.ts         ← ⚠️ é ele que fornece a DATABASE_URL ao CLI
│   ├── prisma/schema.prisma
│   ├── prisma/migrations/       ← 5 migrations; padrão AAAAMMDD_000N_descricao (última: 20260910_0001_add_vestige_requisicoes_e_motivo)
│   └── src/
│       ├── server.ts            ← registro de rotas; SEM setErrorHandler global
│       ├── routes/              ← auth, vestige, pcnet, category, user, audit, custodyStandard
│       ├── services/auditService.ts
│       ├── services/vestigeItemService.ts ← regras de invólucro/requisição (número + motivo), desde 2026-09-10
│       └── db/connection.ts     ← PrismaClient com adapter pg
└── docs/plans/                  ← este documento
```

### 0.2 Versões (verificadas)

| Item | Versão | Consequência prática |
|---|---|---|
| Prisma CLI e `@prisma/client` | **7.7.0** | Em produção: `npx prisma@7.7.0 migrate deploy`. |
| Zod | **4.3.6** | `z.iso.datetime()` existe e funciona. `z.prettifyError(err)` existe e produz mensagem legível em uma linha. |
| Fastify | 5.x | O roteador prioriza rota estática sobre paramétrica — `/open-items` não conflita com `/:id`. |
| React | 18.3.1 | — |
| TypeScript | client 5.5 · server 6.0 | — |
| Tailwind | **CDN, sem config** | Ver armadilha A5. |

### 0.3 Baseline de type-check — **ambos limpos em 2026-08-25, reconferido em 2026-09-10**

```bash
cd client && npx tsc --noEmit   # exit 0, zero erros
cd server && npx tsc --noEmit   # exit 0, zero erros
```

Qualquer erro que aparecer depois **é seu**. Não existe dívida de tipos herdada para confundir o diagnóstico.

### 0.4 Nomes de campo: banco ≠ front (tabela de tradução obrigatória)

Maior gerador de bug bobo neste projeto. O `client/services/dataService.ts:43-60` faz esta tradução hoje; o `withdrawalService.ts` novo terá de fazer a mesma:

| Prisma / API (`Vestige`) | Front (`client/types.ts` → `Vestige`) | Observação |
|---|---|---|
| `registroFav` (`String?`, **anulável**) | `fav` (`string`, nunca nulo) | mapeado com `item.registroFav ?? ''` |
| `dataColeta` (`DateTime?`) | `data` (`string` `dd/mm/aaaa`) | formatado com `toLocaleDateString('pt-BR')` |
| `involucros: { numero, motivo }[]` | `involucros: VestigeItem[]` (`{ numero, motivo }`) | **só itens ativos** — ver aviso abaixo |
| `category.name` | `planilhaOrigem` | — |
| `requisicoes: { numero, motivo }[]` | `requisicoes: VestigeItem[]` (`{ numero, motivo }`) | **lista (1:N) desde 2026-09-10**; só itens ativos |
| `material`, `municipio` | iguais | — |

> ⚠️ **Mudou em 2026-09-10 (commit `9c8efb7`).** Até então a requisição era um texto único (`vestiges.requisicao`) e o invólucro chegava ao front achatado em `string[]`. Agora:
>
> - Requisição e invólucro são tabelas 1:N (`vestige_requisicoes`, `vestige_involucros`), cada linha com `numero`, `motivo` e `removedAt`. **Item com `removedAt` preenchido foi removido pela tela e nunca deve aparecer**: todo `select` precisa de `where: { removedAt: null }`, com `orderBy: { id: 'asc' }` (o primeiro é o registro inicial, o último é o mais recente). O padrão pronto é o `activeItems`, no topo de `server/src/routes/vestigeRoutes.ts`.
> - A coluna `vestiges.requisicao` **ainda existe no banco, congelada**, mapeada no Prisma como `requisicaoLegado`. **Não leia nem grave esse campo**: ele não enxerga requisições incluídas depois de 2026-09-10 e será removido em migration futura.
> - No front, `Vestige.requisicoes` e `Vestige.involucros` são `VestigeItem[]`; o helper `numerosDe(items)` (`client/types.ts`) devolve só os números.
> - **Para a retirada, o motivo de inclusão não interessa**: a API de retiradas devolve só os números (`string[]`). Ver 4.0b.

**Consequência direta:** a API de retiradas devolve `registroFav`; o corpo do evento do Google e a tela de gestão mostram **FAV**. Não confunda os dois lados.

### 0.5 Contrato de erro que o front entende

`client/services/apiClient.ts:32-46` (`parseResponse`):

```ts
const message = payload?.message || payload?.error || `HTTP ${response.status}`;
throw new Error(message);
```

**Portanto:** todo erro do backend precisa responder `{ "message": "texto legível em PT-BR" }`. Sem isso o usuário vê literalmente `HTTP 400` na tela. `204` já é tratado (retorna `undefined`), então rota sem corpo funciona sem ajuste no client.

### 0.6 Payload do JWT

`server/src/services/authService.ts:20-31` assina `{ id, email, name, role }`. Dentro das rotas:

```ts
const user = request.user as { id: string; email: string; name: string; role: string };
```

### 0.7 Perfis e permissões vigentes

`client/types.ts:1` — `ADMIN | PERITO | VISUALIZADOR`.

| Ação | ADMIN | PERITO | VISUALIZADOR |
|---|---|---|---|
| Criar/editar vestígio | ✅ | ✅ | ❌ |
| Excluir vestígio | ✅ | ❌ | ❌ |
| Ver logs de auditoria | ✅ | ❌ | ❌ |
| **Agendar retirada** | ✅ | ✅ | ✅ (README linha 97) |
| **Mudar status da retirada** (novo) | ✅ | ✅ | ❌ |

No servidor o padrão é o `preHandler` `requireEditorAccess` de `server/src/routes/vestigeRoutes.ts:102-107`.

### 0.8 Auditoria falha em silêncio — por decisão de projeto

`server/src/services/auditService.ts:31-34` engole a exceção e só faz `console.error`. **A tela continua funcionando normalmente mesmo com a auditoria falhando.** Por isso a Parte 7.2 exige conferir a tabela `audit_logs` no banco: "não deu erro na tela" não prova nada.

---

## Parte 1 — Diagnóstico: como funciona hoje

### 1.1 O fluxo existente

Dois pontos de entrada, ambos abrindo o mesmo componente:

| Origem | Arquivo | Linha |
|---|---|---|
| Botão "Agendar (Individual)" no card do vestígio | `client/components/VestigeCard.tsx` | 277-284 |
| Renderização do modal individual | `client/components/VestigeCard.tsx` | 318-323 |
| Botão "Agendar Lote" na barra flutuante de selecionados | `client/components/Dashboard.tsx` | 247-253 |
| Renderização do modal em lote | `client/components/Dashboard.tsx` | 266-271 |
| Componente do modal | `client/components/ScheduleModal.tsx` | arquivo inteiro |

O modal pede, **por item**, o motivo da saída (`Destruição`, `Restituição`, `Análise pela Investigação`, `Solicitação Judicial`, `Outros`), e globalmente uma data, um horário e observações gerais.

### 1.2 O que já funciona corretamente (não regredir)

Verificado linha a linha em 2026-08-25. **Preservar tudo isto:**

- **Bloqueio de antecedência < 24h** — `ScheduleModal.tsx:57-67`. Compara ``new Date(`${date}T${time}`)`` (horário **local**, correto) com `now + 24h`.
- **Motivo obrigatório em todos os itens** e **justificativa obrigatória** quando o motivo é "Outros" — `ScheduleModal.tsx:69-81`.
- **A conversão de horário para o Google está correta.** `formatGCalDate` usa `toISOString()` e o regex `/-|:|\.\d\d\d/g` **preserva o sufixo `Z`**, gerando `20260826T143000Z`. O Google interpreta como UTC e exibe no fuso do usuário. **Não "conserte" isso** — está certo.
- **`min` no input de data** (`ScheduleModal.tsx:237`), que impede escolher dia passado no seletor.
- **Aplicar motivo em massa** no modo lote — `handleApplyToAll`, `ScheduleModal.tsx:34-46`.
- **Bolinha vermelha pulsante** no item sem motivo escolhido — bom sinal de pendência, manter.
- **O modal funciona apesar de estar dentro de um card com `overflow-hidden`** — `position: fixed` escapa do clipping porque não há ancestral com `transform`/`filter`. Não introduza um.

### 1.3 O buraco (motivo deste plano)

1. **Zero rastro no EvidenceOS.** `ScheduleModal.tsx` não importa `auditService` nem chama nenhuma rota. Compare com os botões do PCNET no mesmo card, que chamam `logPcnetAction` — o agendamento não chama nada.
2. **Nada no backend.** Busca por `retirada`, `agendamento`, `schedule` e `withdraw` em `server/src` e `schema.prisma`: **nenhuma ocorrência**. Não existe tabela, rota ou modelo.
3. **O vestígio não muda de estado.** A `destinacao` continua `NAO_INICIADO`; olhando a listagem é impossível saber que há retirada marcada.
4. **O evento nasce na agenda pessoal de quem clicou.** O link usa `action=TEMPLATE` com `add=pericia.lavras@gmail.com` — cria na conta Google logada no navegador e *convida* a URC. Se o usuário fechar a aba sem salvar, **nada aconteceu em lugar nenhum**.

Consequência prática: o sistema não responde "quais retiradas estão agendadas para esta semana?" nem "quem pediu a retirada da FAV X e por quê?".

### 1.4 Defeitos menores a corrigir de carona

| Defeito | Arquivo:linha | Correção |
|---|---|---|
| Justificativa de "Outros" limitada a 20 caracteres | `ScheduleModal.tsx:212` (`maxLength={20}`) e `:214` (placeholder "máx 20") | subir para **200**, espelhado no Zod do backend, e trocar o placeholder |
| `window.open` sem `noopener` | `ScheduleModal.tsx:130` | resolvido pelo redesenho: a fase de sucesso usa `<a target="_blank" rel="noopener noreferrer">` (Parte 5.4) |
| `import { ExclamationCircleIcon }` nunca usado | `ScheduleModal.tsx:6` | remover o import morto |
| `min` do input de data usa **hoje**, mas a regra é **+24h** | `ScheduleModal.tsx:237` | passar `min` para **amanhã** — o seletor deixa de oferecer uma data que a validação vai recusar |

---

## Parte 2 — Decisões de arquitetura (já tomadas — não renegociar)

### 2.1 Registrar **intenção**, nunca fato consumado

O EvidenceOS registra que **alguém pediu** a retirada de tais itens, para tal dia e hora, por tal motivo. O ato oficial da saída continua sendo a movimentação na FAV do PCNET.

É o mesmo princípio já adotado no `PcnetActionLog`, cujo comentário no `schema.prisma` diz textualmente que o status é sempre `SOLICITADO` porque "o EvidenceOS só abre a tela do PCNET, não confirma se o usuário salvou algo lá". **A retirada segue essa mesma honestidade:** nada de status preenchido automaticamente, porque o sistema não tem como saber se a pessoa apareceu.

### 2.2 Uma solicitação com N itens, não N linhas soltas

Um agendamento em lote de 12 itens é **um** evento, em **um** horário. Modelar como uma `WithdrawalRequest` com 12 `WithdrawalRequestItem` preserva isso — permite listar "26/08, 14h, 12 itens, solicitante Fulano" em vez de doze linhas que ninguém reagrupa. Cada item mantém seu próprio motivo, que é exatamente o formato do modal atual.

### 2.3 O agendamento **NÃO** toca na `destinacao` ⚠️

Este é o ponto mais fácil de errar. Leia com atenção.

A `destinacao` hoje tem dois valores e o `client/types.ts:141-148` documenta o porquê: `NAO_INICIADO` = está na URC, `RETIRADO` = saiu. Uma retirada **agendada** não é nenhum dos dois — o item ainda está fisicamente na prateleira.

Marcar `RETIRADO` no agendamento faria o card exibir a faixa vermelha "Material não se encontra a URC" (`VestigeCard.tsx:125-138`, condição vinda de `estaForaDaUrc` em `client/types.ts:164-166`) para um vestígio que está lá. Isso **corrompe o sinal visual** que existe hoje e é confiável.

Portanto: **o agendamento** cria a solicitação e **não escreve nada em `Vestige`**. O card ganha um selo próprio, âmbar, derivado da existência de solicitação em aberto.

A `destinacao` só muda depois, **no momento da retirada de fato**, por comando explícito de um perito no painel — ver Parte 2.9 e 4.8. Agendar nunca mexe em `Vestige`; registrar a retirada, sim.

### 2.4 Gravar primeiro, abrir o Google depois — em dois cliques *(⚠️ Google Agenda retirado em 2026-09-10 — vale só o "gravar primeiro"; ver R-48)*

**Armadilha técnica real.** Hoje o `window.open` acontece direto no clique (`ScheduleModal.tsx:130`). Colocar um `await` do POST antes dele faz o **navegador bloquear o popup**: o gesto do usuário se perde durante a chamada assíncrona.

Solução, que também é a ordem correta de prioridades:

1. Usuário clica em "Confirmar Solicitação" → `await POST /api/withdrawal-requests`.
2. **Se falhar:** mostra o erro no modal e **não abre nada**. (Hoje é o inverso: o evento vai para o Google e o sistema nunca fica sabendo.)
3. **Se gravar:** o modal troca para um estado de sucesso, com o resumo do que foi registrado e um botão "Abrir no Google Agenda".
4. Esse botão é um **`<a target="_blank" rel="noopener noreferrer">`**, não um `window.open` — âncora com `target="_blank"` é navegação do usuário e **nunca** é tratada como popup por bloqueador nenhum. O `onClick` dispara, em background, `POST /:id/calendar-opened`.

Efeito colateral desejado: **o registro passa a ser o ato principal e a agenda vira conveniência.**

### 2.5 Não bloquear duplicidade, apenas avisar

Se o vestígio já tem solicitação em aberto, ou se já está com `destinacao = RETIRADO`, a UI **avisa** mas **não impede**. Bloquear atrapalharia remarcações legítimas e correções de dado defasado. O backend não valida isso; quem avisa é o front, usando o índice de solicitações abertas que ele já vai ter carregado para o selo do card (Parte 5.5).

### 2.6 Cancelamento é status, não exclusão

Não existe `deletedAt` em `withdrawal_requests`. Uma solicitação cancelada vira `status = CANCELADA` e permanece na tabela. Registro de custódia não se apaga.

### 2.7 O registro é completo; o evento do Google é resumido *(❌ sem efeito desde 2026-09-10 — ver R-48)*

**Decisão da revisão (R-05).** O corpo do evento do Google vai na querystring da URL, e isso tem limite prático. Medição real com um item típico da URC (material + FAV + requisição + 2 invólucros + motivo):

| Itens no lote | Corpo do evento | **URL final** |
|---|---|---|
| 1 | 369 chars | 683 chars |
| 12 | 2.344 chars | 3.747 chars |
| 25 | 4.710 chars | **7.400 chars** |
| 50 | 9.260 chars | **14.425 chars** |
| 200 | 36.860 chars | **56.875 chars** |

Acima de ~8.000 caracteres a URL entra na zona onde servidores e navegadores começam a truncar ou recusar; acima de ~32.000 o Chrome não navega. Um lote de 200 itens — que o backend aceita e deve aceitar — geraria uma URL inutilizável.

**Portanto:** o **registro no EvidenceOS guarda todos os itens, sempre**. O **corpo do evento do Google** lista no máximo **20 itens** e, havendo mais, acrescenta uma linha `... e mais N item(ns). Lista completa na solicitação <id> do EvidenceOS.` Isso mantém o Google como conveniência e o EvidenceOS como fonte da verdade — exatamente o princípio da 2.4.

### 2.8 Gravou → a tela precisa refletir

**Decisão da revisão (R-06).** Depois de gravar, o selo âmbar só aparece no card se a lista de solicitações abertas for recarregada. O `ScheduleModal` não tem acesso ao `refreshData`. Portanto o modal ganha uma prop `onCreated?: (request: WithdrawalRequest) => void`, encadeada a partir do `Dashboard` pelos **dois** pontos de renderização (lote e individual). Sem isso o usuário grava, fecha e não vê nada mudar — e conclui que não funcionou.

A seleção do "carrinho" **não** é limpa automaticamente após o agendamento em lote: limpar sem perguntar destrói trabalho do usuário. Ele fecha o modal, vê os selos âmbar aparecerem nos cards e limpa quando quiser, no botão que já existe.

### 2.9 Registrar a retirada **é** afirmar um fato — e tudo bem (pedido do usuário, 2026-08-25)

Esta seção existe para uma pessoa que leia a 2.1 e a 4.8 no mesmo dia não achar que o plano se contradiz. **Não se contradiz, e a diferença é o ponto inteiro.**

A 2.1 diz que o EvidenceOS **nunca afirma fato consumado**. Isso vale para o que o sistema **não tem como saber**: se o usuário salvou o evento no Google, se ele salvou a movimentação no PCNET, se a pessoa apareceu. Nesses casos o sistema estaria **adivinhando**, e adivinhação não entra em cadeia de custódia.

Registrar a retirada é outra coisa. Quem clica é **um perito que está ali, na URC, entregando o material em mãos**. Ele não está deixando o sistema deduzir nada — está **declarando o que presenciou**, com nome, matrícula implícita no login, e carimbo de data e hora. É o equivalente digital de assinar o livro de saída. Isso é exatamente o tipo de afirmação que um sistema de custódia **deve** guardar.

Daí as três regras que o antigo 🚦 GATE 2 protegia e que continuam de pé:

1. **Nunca automático.** Nenhuma mudança de `destinacao` acontece como consequência lateral de outra ação. Sempre há um clique deliberado, num botão que diz o que faz.
2. **Item a item.** O perito confirma **quais** materiais saíram, com caixinha de seleção. Ver 2.10.
3. **Sempre auditado, com o mecanismo que já existe.** A escrita usa a mesma `VestigeDestinationLog` que a tela de edição já usa (`vestigeRoutes.ts:369-382`), gravando de-para, autor e timestamp. O histórico de destinação do vestígio continua sendo um só, contínuo, sem uma trilha paralela que ninguém consulta.

### 2.10 Retirada parcial é o caso normal, não a exceção

**Decisão de desenho (R-15).** Uma solicitação de 12 itens raramente vira 12 retiradas. A pessoa chega, leva 8, e 4 continuam na prateleira — porque faltou documento, porque o material não foi localizado, porque mudou de ideia.

Se o painel só soubesse concluir a solicitação **inteira**, o perito teria duas saídas ruins: marcar os 12 como retirados (**mentira gravada em registro de custódia**, com 4 vestígios sumindo da URC no sistema e continuando na prateleira na vida real) ou não marcar nada (e o registro não serve para nada). As duas corrompem exatamente o dado que este plano existe para proteger.

Portanto o comando de retirada trabalha **por item**, com caixinha marcada por padrão:

- Itens **marcados** → `destinacao = RETIRADO`, com log de destinação.
- Itens **desmarcados** → continuam `NAO_INICIADO`, intocados. Seguem na URC, e o card deles continua sem faixa vermelha.
- A solicitação vira `CONCLUIDA` de qualquer forma, com uma observação gravada automaticamente quando for parcial: `Retirada parcial: 8 de 12 itens.`
- Precisar remarcar os 4 que sobraram? **Cria-se nova solicitação.** Não se reabre a antiga (coerente com a 2.6).

O caso "levou tudo" continua sendo um clique: as caixinhas já vêm todas marcadas.

### 2.11 A regra das 24h vira real — e a exceção passa a deixar rastro (decidido em 2026-08-25)

**Duas decisões do usuário, tomadas juntas.**

**Primeira: a regra sai do navegador e vai para o servidor.** Hoje o bloqueio das 24h existe só no `ScheduleModal.tsx:57-67`. Isso significa que ele **não é uma regra**, é uma sugestão: basta mudar o relógio da máquina, ou chamar a API por fora, para passar por cima sem que nada registre. Validar no servidor torna a regra real.

**Segunda: só o ADMIN pode furar o prazo, e só justificando por escrito.** Nem PERITO, nem VISUALIZADOR.

O raciocínio da exceção é o mesmo que sustenta o plano inteiro, e vale escrever para ninguém achar que é uma frouxidão:

> Hoje não existe furo nenhum na tela. Se aparece uma retirada urgente — ordem judicial com prazo curto, diligência que não pode esperar — o sistema simplesmente não deixa agendar. Aí a retirada **acontece fora do sistema**, combinada por telefone, e não fica registrada em lugar nenhum.
>
> Endurecer o servidor sem saída de emergência **pioraria** isso: o caso excepcional, que é justamente o que mais merece um registro, seria o único a ficar invisível.
>
> Com a exceção, o caminho urgente continua existindo mas **passa por dentro do sistema**: só o ADMIN consegue, precisa escrever o porquê, e fica tudo gravado com nome e hora. A regra continua sendo regra para todo mundo — a diferença é que a exceção deixa rastro em vez de virar conversa de corredor.

Consequências de desenho, que aparecem em vários pontos da implementação:

- A justificativa vai para uma **coluna própria** (`deadline_override_reason`), não para a observação geral. Ela precisa ser consultável: "quais retiradas furaram o prazo neste semestre, e por quê?" tem que ser uma consulta, não uma leitura de texto livre.
- A justificativa **só é gravada quando a exceção de fato se aplicou**. Mandada num agendamento normal, é ignorada — senão a coluna vira lixo e a consulta acima para de significar alguma coisa.
- O painel de retiradas **destaca** essas solicitações. O perito que vai receber a pessoa precisa saber que aquela retirada entrou fora do prazo e por quê.
- **Tolerância de relógio de 5 minutos.** O navegador compara com o relógio dele e o servidor com o dele. Sem folga, um agendamento marcado para 24h01 pode passar na tela e ser recusado pelo servidor por segundos de defasagem — erro incompreensível para quem está usando.
- **Data no passado não precisa de regra separada:** se o mínimo é `agora + 24h`, uma data passada já é recusada por consequência.

---

## Parte 3 — Modelo de dados

### 3.1 Visão geral

Duas tabelas novas. **Nenhuma tabela existente é alterada.** Migration puramente aditiva, sem backfill, sem risco para os dados atuais. Rollback = redeploy da versão anterior; as tabelas ficam órfãs e inofensivas.

### 3.2 Valores válidos (fonte única de verdade)

```
status da solicitação:  SOLICITADA | CONCLUIDA | CANCELADA | NAO_COMPARECEU
motivo do item:         DESTRUICAO | RESTITUICAO | ANALISE_INVESTIGACAO | SOLICITACAO_JUDICIAL | OUTROS
```

`SOLICITADA` é o único status atribuído pelo sistema. Os outros três são **sempre** definidos manualmente por um operador.

**O banco guarda o código; a tela mostra o rótulo.** A tradução é esta e vive em um lugar só, o `client/types.ts`:

| Gravado em `reason` | Exibido ao usuário |
|---|---|
| `DESTRUICAO` | Destruição |
| `RESTITUICAO` | Restituição |
| `ANALISE_INVESTIGACAO` | Análise pela Investigação |
| `SOLICITACAO_JUDICIAL` | Solicitação Judicial |
| `OUTROS` | Outros |

> ⚠️ Os **códigos** precisam bater entre `WITHDRAWAL_REASONS` no client e `VALID_REASONS` no backend. Como são ASCII puro, sem acento e sem espaço, não há o risco de divergência por cedilha ou til. Ainda assim, deixe um comentário em cada lado apontando para o outro — é o padrão do projeto em `VALID_ESTADO_CONSERVACAO` (`vestigeRoutes.ts:13-16`) vs. `ESTADO_CONSERVACAO_OPTIONS` (`types.ts:127-134`).

### 3.3 ✅ R-03 — código no banco, rótulo na tela (**decidido pelo usuário em 2026-08-25**)

**Decisão tomada. Não reabrir.** O campo `reason` grava o **código** (`ANALISE_INVESTIGACAO`), nunca a frase exibida (`"Análise pela Investigação"`).

**Os dois motivos que sustentam a decisão:**

1. **Mudar a redação não pode quebrar o histórico.** Se um dia o rótulo virar "Análise pela autoridade policial", registros antigos gravados com a frase velha passariam a conviver com a nova, e qualquer contagem por motivo se partiria em duas. Com código, muda-se só a tradução na tela e todo o histórico continua íntegro — sem tocar em registro de cadeia de custódia, que é justamente o que não se reescreve.
2. **Elimina a divergência por acento.** A lista de motivos existe em dois arquivos (client e server). Com rótulos, os dois precisariam bater cedilha por cedilha; um `Destruicao` sem cedilha em um dos lados começaria a recusar o motivo com erro incompreensível. Com código ASCII, o problema não existe.

**Além disso, é a convenção do próprio projeto:** `ESTADO_CONSERVACAO_OPTIONS` e `DESTINACAO_OPTIONS` já são arrays de `{ value, label }` (`types.ts:127-148`) e o banco já guarda `USADO_FUNCIONANDO`, não "Usado em funcionamento". O plano original era o único ponto do sistema fazendo diferente.

**Onde isso aparece na implementação** — confira os cinco pontos ao codar:

| Lugar | O que usar |
|---|---|
| `VALID_REASONS` no backend (4.0d) | códigos |
| `WITHDRAWAL_REASONS` no `types.ts` (5.2) | pares `{ value, label }` + `getWithdrawalReasonLabel()` |
| `<select>` do `ScheduleModal` (5.4) | `value={o.value}`, texto `{o.label}` |
| Comparação de "Outros" (5.4) | `=== 'OUTROS'`, **nunca** `=== 'Outros'` |
| Corpo do evento do Google (5.3), tela de gestão (5.9) | `getWithdrawalReasonLabel(item.reason)` — **o usuário nunca deve ver o código** |

**Custo de ter decidido agora:** zero em dados. A tabela ainda não existe.

### 3.4 Models do Prisma

Acrescentar em `server/prisma/schema.prisma`. **Todo model neste projeto precisa de `@@schema("public")`** — não esqueça, o datasource usa `schemas = ["public"]`.

```prisma
model WithdrawalRequest {
  id               String    @id @default(uuid())
  scheduledFor     DateTime  @map("scheduled_for")
  status           String    @default("SOLICITADA")
  notes            String?
  // Preenchido SÓ quando um ADMIN agenda com menos de 24h de antecedência (Parte 2.11).
  // Nulo = agendamento dentro do prazo. Coluna própria, e não dentro de `notes`,
  // porque "quais retiradas furaram o prazo e por quê" precisa ser consulta, não leitura.
  deadlineOverrideReason String? @map("deadline_override_reason")
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
  // ⚠️ BigInt: NUNCA devolva este id cru na resposta JSON. Ver armadilha T-01 (Parte 11).
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

- No model `User` (`schema.prisma:22-30`), junto das demais relações:
  ```prisma
  withdrawalRequests      WithdrawalRequest[] @relation("WithdrawalRequestedBy")
  withdrawalStatusChanges WithdrawalRequest[] @relation("WithdrawalStatusChangedBy")
  ```
- No model `Vestige` (`schema.prisma:84-92`):
  ```prisma
  withdrawalItems WithdrawalRequestItem[]
  ```

**Sobre o `onDelete` do item para `Vestige`:** fica em `RESTRICT` (o default do Prisma), igual ao `PcnetActionLog`. O projeto usa **soft delete** (`deletedAt`), então isso nunca dispara na prática — é rede de segurança contra um `DELETE` direto no banco apagar registro de custódia.

### 3.5 SQL da migration (escrever à mão — ver armadilha A1)

Criar `server/prisma/migrations/AAAAMMDD_0001_add_withdrawal_requests/migration.sql`, com a **data do dia em que a migration for escrita**, seguindo o padrão das existentes (`20260724_0001_add_pcnet_action_log`).

> ⚠️ **O nome da pasta precisa ordenar depois de `20260910_0001_add_vestige_requisicoes_e_motivo`**, a última já aplicada em produção. O Prisma trata as migrations em ordem alfabética de pasta: uma pasta `20260825_...` criada agora ficaria "antes" de uma migration já aplicada, desalinhando o histórico entre o repositório e o `_prisma_migrations` de produção. Com a data real do dia (setembro de 2026 ou depois), o problema não existe.

```sql
-- CreateTable
CREATE TABLE "withdrawal_requests" (
    "id" TEXT NOT NULL,
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SOLICITADA',
    "notes" TEXT,
    "deadline_override_reason" TEXT,
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

Aplicar (**cwd em `server/`** — armadilhas A2 e A3):

```bash
cd server
npx prisma migrate deploy
npx prisma generate
```

### 3.6 Verificação da migration no banco (obrigatória)

Não confie na ausência de erro no terminal. Rode:

```sql
-- 2 tabelas
SELECT table_name FROM information_schema.tables
 WHERE table_schema = 'public' AND table_name LIKE 'withdrawal%';

-- a coluna da exceção das 24h existe (Parte 2.11) — fácil de esquecer no SQL escrito à mão
SELECT column_name, data_type, is_nullable FROM information_schema.columns
 WHERE table_name = 'withdrawal_requests' AND column_name = 'deadline_override_reason';

-- 4 índices (+ os 2 de PK)
SELECT indexname FROM pg_indexes
 WHERE schemaname = 'public' AND tablename LIKE 'withdrawal%';

-- 4 foreign keys
SELECT conname, conrelid::regclass AS tabela FROM pg_constraint
 WHERE contype = 'f' AND conrelid::regclass::text LIKE 'withdrawal%';

-- a migration precisa constar como aplicada
SELECT migration_name, finished_at FROM "_prisma_migrations"
 ORDER BY finished_at DESC LIMIT 3;
```

---

## Parte 4 — Contrato da API

Arquivo novo: `server/src/routes/withdrawalRoutes.ts`. Registrar em `server/src/server.ts`, junto dos demais (`server.ts:39-45`):

```ts
import { withdrawalRoutes } from './routes/withdrawalRoutes';
// ...
server.register(withdrawalRoutes, { prefix: '/api/withdrawal-requests' });
```

Use `server/src/routes/pcnetRoutes.ts` como modelo — é o exemplo mais próximo em espírito (registro de intenção + auditoria dupla). Copie de lá o `addHook('onRequest', ...)` com `jwtVerify`.

### 4.0 Infraestrutura do arquivo (escrever isto primeiro)

#### a) Validação: `safeParse` + 400 explícito — **nunca `.parse()`**

> ⚠️ **T-02, verificado em execução:** o `server.ts` **não tem `setErrorHandler`**. Um `ZodError` vazando de `.parse()` chega ao handler padrão do Fastify sem `statusCode` e vira **HTTP 500** com o JSON bruto do Zod no `message`. Todos os "400" prometidos neste plano viram 500 se você seguir o padrão das rotas antigas.

```ts
const parsed = bodySchema.safeParse(request.body);
if (!parsed.success) {
  return reply.status(400).send({ message: z.prettifyError(parsed.error) });
}
const body = parsed.data;
```

`z.prettifyError` (Zod 4.3.6, verificado) devolve algo como `✖ Justificativa obrigatória → at items[0].reasonDetail` — legível e já no formato que o `apiClient` sabe exibir (Parte 0.5).

#### b) Serialização: BigInt e Date — **nunca devolva o objeto do Prisma cru**

> ⚠️ **T-01, verificado em execução:** devolver um objeto com campo `BigInt` faz o Fastify responder **HTTP 500 — "Do not know how to serialize a BigInt"**. Todas as rotas existentes com BigInt convertem à mão (`auditRoutes.ts:5-8`, `pcnetRoutes.ts:67`). A `WithdrawalRequestItem.id` é BigInt.

Escreva **um** serializador e use em todas as respostas:

```ts
const REQUEST_INCLUDE = {
  requester:     { select: { id: true, name: true, email: true } },
  statusChanger: { select: { id: true, name: true, email: true } },
  items: {
    orderBy: { id: 'asc' as const },
    include: {
      vestige: {
        select: {
          id: true, material: true, registroFav: true,
          municipio: true, deletedAt: true,
          // Só itens ativos, na ordem de inclusão — mesmo padrão do activeItems de vestigeRoutes.ts.
          // NUNCA selecione `requisicaoLegado`: é a coluna antiga, congelada (Parte 0.4).
          requisicoes: { where: { removedAt: null }, select: { numero: true }, orderBy: { id: 'asc' as const } },
          involucros:  { where: { removedAt: null }, select: { numero: true }, orderBy: { id: 'asc' as const } },
        },
      },
    },
  },
};

const serializeRequest = (r: any) => ({
  id:                 r.id,
  scheduledFor:       r.scheduledFor.toISOString(),
  status:             r.status,
  notes:              r.notes,
  deadlineOverrideReason: r.deadlineOverrideReason,   // null = agendado dentro do prazo
  requestedBy:        r.requestedBy,
  requesterName:      r.requester?.name  ?? null,
  requesterEmail:     r.requester?.email ?? null,
  requestedAt:        r.requestedAt.toISOString(),
  calendarOpenedAt:   r.calendarOpenedAt?.toISOString() ?? null,
  statusChangedBy:    r.statusChangedBy,
  statusChangedByName: r.statusChanger?.name ?? null,
  statusChangedAt:    r.statusChangedAt?.toISOString() ?? null,
  statusNote:         r.statusNote,
  items: (r.items ?? []).map((it: any) => ({
    id:            String(it.id),            // ← BigInt → string. OBRIGATÓRIO.
    vestigeId:     it.vestigeId,
    reason:        it.reason,
    reasonDetail:  it.reasonDetail,
    material:      it.vestige?.material    ?? null,
    registroFav:   it.vestige?.registroFav ?? null,
    requisicoes:   (it.vestige?.requisicoes ?? []).map((r: any) => r.numero),   // só números
    municipio:     it.vestige?.municipio   ?? null,
    involucros:    (it.vestige?.involucros  ?? []).map((i: any) => i.numero),   // só números
    vestigeDeleted: Boolean(it.vestige?.deletedAt),
  })),
});
```

> 💡 **Por que `requisicoes` e `involucros` estão aí (R-04):** o corpo do evento do Google hoje mostra `MATERIAL / FAV / REQUISIÇÃO(ÕES) / INVÓLUCRO(S) / MOTIVO` (`ScheduleModal.tsx:98-109`). Se a API devolver só `material`, `registroFav` e `municipio`, o evento gerado a partir da solicitação gravada **perde informação em relação ao que o sistema faz hoje** — regressão silenciosa. Os cinco campos precisam vir. **Desde 2026-09-10 requisição e invólucro são listas** — um vestígio pode ter várias de cada, e o evento lista todas (R-35).

#### c) Permissão de edição (cópia local do padrão)

```ts
const requireEditorAccess = async (request: any, reply: any) => {
  const user = request.user as { role?: string };
  if (user.role !== 'ADMIN' && user.role !== 'PERITO') {
    return reply.status(403).send({ message: 'Acesso negado: Requer perfil com permissão de edição' });
  }
};
```

#### d) Constantes espelhadas

```ts
// Espelho dos `value` de WITHDRAWAL_REASONS em client/types.ts. Mexeu aqui, mexa lá.
// Guardamos o CÓDIGO, nunca o rótulo exibido — ver Parte 3.3 do plano. O texto
// "Análise pela Investigação" existe só no client, na hora de desenhar a tela.
const VALID_REASONS = [
  'DESTRUICAO', 'RESTITUICAO', 'ANALISE_INVESTIGACAO', 'SOLICITACAO_JUDICIAL', 'OUTROS',
] as const;

const VALID_STATUSES = ['SOLICITADA', 'CONCLUIDA', 'CANCELADA', 'NAO_COMPARECEU'] as const;
const TERMINAL_STATUSES = ['CONCLUIDA', 'CANCELADA', 'NAO_COMPARECEU'] as const;
const MAX_ITEMS_PER_REQUEST = 200;
```

### 4.1 Tabela-resumo das rotas

| Método | Rota | Permissão | Sucesso | Erros previstos |
|---|---|---|---|---|
| `POST` | `/api/withdrawal-requests` | autenticado (inclui VISUALIZADOR) | **201** + solicitação serializada | 400 validação · 401 sem JWT |
| `GET` | `/api/withdrawal-requests` | autenticado | **200** `{ items, meta }` | 400 filtro inválido · 401 |
| `GET` | `/api/withdrawal-requests/open-items` | autenticado | **200** array plano | 401 |
| `GET` | `/api/withdrawal-requests/:id` | autenticado | **200** solicitação | 401 · 404 |
| `PATCH` | `/api/withdrawal-requests/:id/status` | **ADMIN ou PERITO** | **200** solicitação atualizada | 400 · 401 · 403 · 404 · **409 status terminal** |
| **`POST`** | **`/api/withdrawal-requests/:id/complete`** | **ADMIN ou PERITO** | **200** solicitação concluída + vestígios movimentados | 400 · 401 · 403 · 404 · **409 status terminal** |
| `POST` | `/api/withdrawal-requests/:id/calendar-opened` | autenticado | **204** sem corpo | 401 · 404 |

> **Por que `/complete` é rota separada e não um campo a mais no `PATCH /status`:** o `PATCH` mexe só na própria solicitação; o `/complete` escreve em **outras duas tabelas** (`vestiges` e `vestige_destination_logs`). Misturar as duas coisas numa rota só significaria que um `PATCH` inocente para "Cancelada" passa pelo mesmo código que movimenta vestígio. Separar mantém o `PATCH` simples para `CANCELADA` e `NAO_COMPARECEU`, e concentra a lógica sensível num lugar com validação, transação e auditoria próprias.

### 4.2 `POST /api/withdrawal-requests` — criar solicitação

**Permissão:** qualquer usuário autenticado. O README (linha 97) define que VISUALIZADOR pode agendar retiradas; **não restrinja aqui**.

**Body:**
```jsonc
{
  "scheduledFor": "2026-08-27T17:00:00.000Z",  // instante ISO com Z (o client manda toISOString())
  "notes": "Observações gerais, opcional",
  "items": [
    { "vestigeId": "uuid", "reason": "DESTRUICAO" },
    { "vestigeId": "uuid", "reason": "OUTROS", "reasonDetail": "Texto livre" }
  ]
}
```

**Schema Zod (Zod 4 — sintaxe verificada):**

```ts
const bodySchema = z.object({
  scheduledFor: z.iso.datetime({ offset: true }),   // aceita ...Z e ...-03:00
  notes: z.string().max(1000).optional(),
  items: z.array(z.object({
    vestigeId: z.string().uuid(),
    reason: z.enum(VALID_REASONS),
    reasonDetail: z.string().max(200).optional(),
  })).min(1, 'Informe ao menos um vestígio.').max(MAX_ITEMS_PER_REQUEST),
}).superRefine((data, ctx) => {
  data.items.forEach((item, i) => {
    if (item.reason === 'OUTROS' && !item.reasonDetail?.trim()) {   // código, não rótulo (3.3)
      ctx.addIssue({
        code: 'custom',
        path: ['items', i, 'reasonDetail'],
        message: 'Justificativa obrigatória quando o motivo é "Outros".',
      });
    }
  });
  const ids = data.items.map((i) => i.vestigeId);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: 'custom', path: ['items'], message: 'O mesmo vestígio aparece mais de uma vez na solicitação.' });
  }
});
```

> Nota: `z.iso.datetime()` **sem** `{ offset: true }` recusa `2026-08-27T14:00:00-03:00` (verificado). Como o client manda `toISOString()` (sempre `Z`), qualquer um dos dois funciona — `offset: true` é a escolha tolerante, para o caso de alguém chamar a API de fora.

**Item 5 — ✅ Regra das 24h no servidor, com exceção só para ADMIN.** Aprovado pelo usuário em 2026-08-25. Ler a Parte 2.11 antes de codar.

Acrescente ao schema:

```ts
deadlineOverrideReason: z.string().max(500).optional(),
```

E, **depois** do parse e **antes** de qualquer escrita:

```ts
// Regra de negócio da URC: retirada exige 24h de antecedência (Parte 2.11).
// A folga de 5 min existe porque o navegador compara com o relógio DELE e o
// servidor com o dele; sem ela, um agendamento de 24h01 passa na tela e é
// recusado aqui por segundos de defasagem — erro incompreensível para o usuário.
const ANTECEDENCIA_MINIMA_MS = 24 * 60 * 60 * 1000;
const TOLERANCIA_RELOGIO_MS  =  5 * 60 * 1000;

const limite = new Date(Date.now() + ANTECEDENCIA_MINIMA_MS - TOLERANCIA_RELOGIO_MS);
const foraDoPrazo = new Date(body.scheduledFor) < limite;

// `overrideAplicado` é o que decide se a justificativa vai para o banco.
// Justificativa enviada num agendamento dentro do prazo é IGNORADA — senão a
// coluna vira lixo e a consulta "quem furou o prazo" para de significar algo.
let overrideAplicado = false;

if (foraDoPrazo) {
  if (user.role !== 'ADMIN') {
    return reply.status(400).send({
      message: 'Agendamento bloqueado: é necessária antecedência mínima de 24h. Para urgências, contate a administração da URC.',
    });
  }
  if (!body.deadlineOverrideReason?.trim()) {
    return reply.status(400).send({
      message: 'Agendamento com menos de 24h de antecedência exige justificativa. Descreva o motivo da urgência.',
    });
  }
  overrideAplicado = true;
}
```

Pontos que o revisor vai conferir:

- **Só `ADMIN`.** PERITO e VISUALIZADOR levam 400 igual, sem campo de escape. Checagem no **servidor** — esconder o campo no front não é controle de acesso.
- **Data no passado cai aqui por consequência**, sem regra separada: é menor que `agora + 24h`.
- **A justificativa só é gravada se `overrideAplicado`**, nunca só porque veio no corpo.
- A mensagem para quem não é ADMIN é **a mesma frase que o modal já usa hoje** (`ScheduleModal.tsx:64`), para o usuário não receber dois textos diferentes para a mesma regra.

**Validação de existência (fora do Zod):** buscar todos os `vestigeId` em **uma consulta só**, com `deletedAt: null`. Se algum não existir, **400** listando os ids faltantes. Não crie a solicitação parcialmente.

```ts
const vestigeIds = body.items.map((i) => i.vestigeId);
const found = await prisma.vestige.findMany({
  where: { id: { in: vestigeIds }, deletedAt: null },
  select: { id: true },
});
const missing = vestigeIds.filter((id) => !found.some((f) => f.id === id));
if (missing.length > 0) {
  return reply.status(400).send({
    message: `Vestígio(s) não encontrado(s) ou excluído(s): ${missing.join(', ')}`,
  });
}
```

**Gravação atômica:** `create` aninhado já é uma transação — solicitação sem itens é registro corrompido e não pode existir.

```ts
const created = await prisma.withdrawalRequest.create({
  data: {
    scheduledFor: new Date(body.scheduledFor),
    notes: body.notes ?? null,
    // Só grava se a exceção realmente se aplicou — ver item 5.
    deadlineOverrideReason: overrideAplicado ? body.deadlineOverrideReason!.trim() : null,
    requestedBy: user.id,
    items: { create: body.items.map((i) => ({
      vestigeId: i.vestigeId,
      reason: i.reason,
      reasonDetail: i.reasonDetail?.trim() || null,
    })) },
  },
  include: REQUEST_INCLUDE,
});
```

**Auditoria:** após gravar, `auditService.log` — igual ao `pcnetRoutes.ts:54-64`:

```ts
action:     'WITHDRAWAL_REQUESTED'
targetType: 'withdrawal_request'
targetId:   created.id
details:    { scheduledFor, itemCount, vestigeIds, reasons,
              deadlineOverride: overrideAplicado,          // ← rastro da exceção
              deadlineOverrideReason: overrideAplicado ? body.deadlineOverrideReason : undefined }
```

> **Um registro só, não dois.** A exceção das 24h não gera entrada de auditoria própria: ela aparece no `details` deste `WITHDRAWAL_REQUESTED` **e** na coluna `deadline_override_reason`, que é a fonte consultável (Parte 2.11). Duplicar em duas linhas de log só tornaria a trilha mais difícil de ler.

Lembre que `auditService.log` engole exceções por decisão de projeto — a falha de auditoria é silenciosa e **não** deve derrubar a criação.

**Resposta:** `201` com `serializeRequest(created)`.

### 4.3 `GET /api/withdrawal-requests` — listar

**Permissão:** qualquer usuário autenticado.

**Query params:** `status`, `from`, `to` (filtram `scheduledFor`), `vestigeId`, `page`, `limit` (default 50, teto 200).

```ts
const querySchema = z.object({
  status: z.enum(VALID_STATUSES).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to:   z.iso.datetime({ offset: true }).optional(),
  vestigeId: z.string().uuid().optional(),
  page:  z.string().optional().transform((v) => Number(v) || 1),
  limit: z.string().optional().transform((v) => Math.min(Number(v) || 50, 200)),
});
```

**Ordenação:** `orderBy: { scheduledFor: 'asc' }`. O filtro padrão da tela é `SOLICITADA`, e para retirada agendada o que interessa é **a próxima primeiro**.

**Filtro por vestígio:** `where.items = { some: { vestigeId } }`.

**Formato de paginação** — o mesmo já usado em `vestigeRoutes.ts:132-140` e `auditRoutes.ts`:

```jsonc
{ "items": [ /* serializeRequest */ ], "meta": { "total": 0, "page": 1, "limit": 50, "totalPages": 0 } }
```

**Vestígio excluído:** o item **continua aparecendo**, marcado com `vestigeDeleted: true`. Registro de custódia não some porque o cadastro foi apagado depois.

### 4.4 `GET /api/withdrawal-requests/open-items` — índice leve para o selo do card

**Por que existe (R-07).** O front precisa saber, para cada vestígio da tela, se há solicitação em aberto. Usar `GET /` para isso tem dois problemas: (a) o teto de 200 por página faz o selo **sumir em silêncio** a partir da 201ª solicitação aberta; (b) traz payload pesado para desenhar um selo. Esta rota devolve só o par que interessa, sem paginação:

```ts
server.get('/open-items', async () => {
  const items = await prisma.withdrawalRequestItem.findMany({
    where: { request: { status: 'SOLICITADA' } },
    select: {
      vestigeId: true,
      request: { select: { id: true, scheduledFor: true, requester: { select: { name: true } } } },
    },
    orderBy: { request: { scheduledFor: 'asc' } },
  });

  return items.map((it) => ({
    vestigeId:     it.vestigeId,
    requestId:     it.request.id,
    scheduledFor:  it.request.scheduledFor.toISOString(),
    requesterName: it.request.requester.name,
  }));
});
```

Sem BigInt na resposta — o `id` do item não é selecionado de propósito.

Um vestígio com **duas** solicitações abertas aparece duas vezes; ordenado por `scheduledFor asc`, o front pode montar o mapa com "a primeira vence" e o selo mostra a **retirada mais próxima**.

> **Ordem de registro:** declare `/open-items` **antes** de `/:id` no arquivo. O roteador do Fastify já prioriza rota estática sobre paramétrica, então funciona nos dois casos — mas declarar na ordem certa evita que a próxima pessoa a ler o arquivo precise saber disso.

### 4.5 `GET /api/withdrawal-requests/:id` — detalhe

Solicitação completa com itens, solicitante e quem alterou o status. **404** se não existir.

**Nota de segurança (decisão consciente):** qualquer usuário autenticado lê qualquer solicitação. Não há IDOR aqui porque **não há segregação por usuário neste sistema** — todo perfil já enxerga todos os vestígios. Introduzir escopo por usuário só nesta tela criaria uma inconsistência sem ganho. Se algum dia houver multi-unidade, isto muda junto com o resto.

### 4.6 `PATCH /api/withdrawal-requests/:id/status` — mudar status

**Permissão:** `preHandler: requireEditorAccess` (ADMIN e PERITO).

**Body:** `{ "status": "CONCLUIDA" | "CANCELADA" | "NAO_COMPARECEU", "statusNote": "opcional, max 500" }`.

**Transições válidas — apenas a partir de `SOLICITADA`.** Status terminal não muda mais: **409** com mensagem clara. Isso preserva a integridade do registro; correção de erro se faz criando nova solicitação, não reescrevendo o histórico.

**Faça a transição de forma atômica** (evita a corrida entre dois operadores clicando ao mesmo tempo, que num `findUnique` + `update` deixaria o último sobrescrever o primeiro):

```ts
const { count } = await prisma.withdrawalRequest.updateMany({
  where: { id, status: 'SOLICITADA' },
  data: {
    status: body.status,
    statusNote: body.statusNote?.trim() || null,
    statusChangedBy: user.id,
    statusChangedAt: new Date(),
  },
});

if (count === 0) {
  const existing = await prisma.withdrawalRequest.findUnique({ where: { id }, select: { status: true } });
  if (!existing) return reply.status(404).send({ message: 'Solicitação não encontrada.' });
  return reply.status(409).send({
    message: `Esta solicitação já está como "${existing.status}" e não pode mais ser alterada. Para corrigir, registre uma nova solicitação.`,
  });
}
```

Auditar com `action: 'WITHDRAWAL_STATUS_CHANGED'`, `targetType: 'withdrawal_request'`, `details: { fromStatus: 'SOLICITADA', toStatus, statusNote }`.

> ⚠️ **Esta rota NÃO escreve em `Vestige`, nunca.** Ela serve para `CANCELADA` e `NAO_COMPARECEU` — dois desfechos em que **nada saiu da URC**. Quem movimenta vestígio é exclusivamente a `POST /:id/complete` (4.8). Se você se pegar acrescentando `prisma.vestige.update` aqui, parou no lugar errado.

**Restrinja o `status` aceito** a `CANCELADA` e `NAO_COMPARECEU`. `CONCLUIDA` só pode entrar pela `/complete`, porque concluir sem dizer o que foi retirado é o registro incompleto que a 2.10 existe para impedir. Se vier `CONCLUIDA` aqui, responda **400** com: `Para concluir uma retirada, use a ação "Registrar retirada", que exige informar quais materiais saíram.`

**Resposta:** `200` com a solicitação recarregada e serializada.

### 4.8 `POST /api/withdrawal-requests/:id/complete` — registrar a retirada e movimentar os vestígios ✅

> Rota nascida do pedido do usuário em 2026-08-25 (antigo 🚦 GATE 2, liberado). É **a única** rota deste plano que escreve fora das tabelas de retirada. Leia as Partes 2.9 e 2.10 antes de codar.

**Permissão:** `preHandler: requireEditorAccess` (ADMIN e PERITO). É o mesmo nível já exigido hoje para mudar `destinacao` pelo `PUT /api/vestiges/:id` — **não há escalada de privilégio**: quem pode fazer isso pela tela de edição passa a poder fazer também pelo painel, com menos cliques e mais contexto.

**Body:**
```jsonc
{
  "withdrawnVestigeIds": ["uuid-1", "uuid-2"],   // quais SAÍRAM de fato
  "statusNote": "observação livre, opcional"
}
```

**Validações, nesta ordem:**

```ts
const bodySchema = z.object({
  withdrawnVestigeIds: z.array(z.string().uuid())
    .min(1, 'Marque ao menos um material como retirado. Se ninguém compareceu, use a ação "Não compareceu".'),
  statusNote: z.string().max(500).optional(),
});
```

1. **Solicitação existe** → senão **404**.
2. **Está `SOLICITADA`** → senão **409**, mesma trava e mesma mensagem da 4.6.
3. 🔒 **Todo id enviado pertence a esta solicitação** → senão **400**. **Esta checagem é de autorização, não de digitação:** sem ela, um PERITO poderia usar a rota para marcar como retirado **qualquer vestígio do sistema**, passando um uuid arbitrário no corpo. É a única brecha real de autorização desta feature — não a pule.

```ts
const idsDaSolicitacao = new Set(request.items.map((i) => i.vestigeId));
const forasteiros = body.withdrawnVestigeIds.filter((id) => !idsDaSolicitacao.has(id));
if (forasteiros.length > 0) {
  return reply.status(400).send({
    message: `Estes materiais não fazem parte desta solicitação: ${forasteiros.join(', ')}`,
  });
}
```

**Gravação — uma transação só.** Metade aplicada é o pior resultado possível: solicitação concluída com vestígios que continuam constando na URC, ou o inverso.

```ts
const agora = new Date();
const total = request.items.length;
const retirados = new Set(body.withdrawnVestigeIds);
const parcial = retirados.size < total;

const notaFinal = [
  body.statusNote?.trim(),
  parcial ? `Retirada parcial: ${retirados.size} de ${total} itens.` : null,
].filter(Boolean).join(' | ') || null;

await prisma.$transaction(async (tx) => {
  // 1) Trava e conclui a solicitação. Se outro operador concluiu no mesmo segundo,
  //    count = 0 e a transação inteira aborta — ninguém movimenta nada duas vezes.
  const { count } = await tx.withdrawalRequest.updateMany({
    where: { id, status: 'SOLICITADA' },
    data: {
      status: 'CONCLUIDA',
      statusNote: notaFinal,
      statusChangedBy: user.id,
      statusChangedAt: agora,
    },
  });
  if (count === 0) throw new Error('CONFLICT_STATUS');

  // 2) Movimenta cada vestígio marcado, no MESMO padrão de vestigeRoutes.ts:369-382,
  //    para que o histórico de destinação continue sendo um só.
  for (const vestigeId of retirados) {
    const atual = await tx.vestige.findUnique({
      where: { id: vestigeId },
      select: { destinacao: true },
    });

    // Já estava RETIRADO (dado defasado, remarcação): não registra transição inexistente.
    if (!atual || atual.destinacao === 'RETIRADO') continue;

    await tx.vestigeDestinationLog.create({
      data: {
        vestigeId,
        fromStatus: atual.destinacao,
        toStatus: 'RETIRADO',
        observation: `Retirada registrada no painel — solicitação ${id}`,
        changedBy: user.id,
      },
    });

    await tx.vestige.update({
      where: { id: vestigeId },
      data: {
        destinacao: 'RETIRADO',
        destinacaoChangedBy: user.id,
        destinacaoChangedAt: agora,
        updatedBy: user.id,
      },
    });
  }
});
```

> **Não escreva em `destinacaoObs`.** Aquele campo é a observação que o operador digita na tela de edição e aparece em itálico no card (`VestigeCard.tsx:238-242`). Sobrescrevê-lo aqui apagaria o que alguém escreveu antes. O contexto da retirada já fica no `observation` do log de destinação e na `statusNote` da solicitação.

**Tratamento do conflito:** capture o `CONFLICT_STATUS` fora da transação e responda **409** com a mesma mensagem da 4.6. Nenhum vestígio terá sido tocado — a transação abortou inteira.

**Auditoria** (além dos `VestigeDestinationLog`, que já são trilha por si):

```ts
action:     'WITHDRAWAL_COMPLETED'
targetType: 'withdrawal_request'
targetId:   id
details:    {
  itemCount: total,
  withdrawnCount: retirados.size,
  withdrawnVestigeIds: [...retirados],
  notWithdrawnVestigeIds: [...],   // os que ficaram — tão importante quanto os que saíram
  partial: parcial,
}
```

Registrar **o que não saiu** é deliberado: daqui a um ano, "por que este vestígio continuou na URC depois de agendado?" é uma pergunta que alguém vai fazer.

**Resposta:** `200` com a solicitação recarregada e serializada (já com `status: CONCLUIDA` e `statusChangedByName` preenchido).

**Idempotência:** chamar duas vezes devolve **409** na segunda. A primeira já concluiu.

### 4.7 `POST /api/withdrawal-requests/:id/calendar-opened` *(❌ removida em 2026-09-10 — ver R-48)*

Preenche `calendarOpenedAt` — **só na primeira abertura**, que é a que importa. Também atômico:

```ts
const { count } = await prisma.withdrawalRequest.updateMany({
  where: { id, calendarOpenedAt: null },
  data: { calendarOpenedAt: new Date() },
});

if (count === 0) {
  const exists = await prisma.withdrawalRequest.count({ where: { id } });
  if (exists === 0) return reply.status(404).send({ message: 'Solicitação não encontrada.' });
  return reply.status(204).send();   // já estava marcada — idempotente, não é erro
}

await auditService.log({ /* ... */ action: 'WITHDRAWAL_CALENDAR_OPENED', targetType: 'withdrawal_request', targetId: id });
return reply.status(204).send();
```

Chamada em background pelo front; falha aqui **nunca** deve atrapalhar a UI. Auditar só na primeira vez evita poluir a trilha se o usuário clicar várias vezes.

---

## Parte 5 — Mudanças no front

### 5.1 Mapa de dependências (leia antes de abrir qualquer arquivo)

```
Dashboard.tsx
 ├─ useVestiges()  →  vestiges, openWithdrawals (Map), refreshData
 ├─ <SearchResults openWithdrawals onWithdrawalCreated>
 │     └─ <VestigeCard withdrawal onWithdrawalCreated>
 │           └─ <ScheduleModal vestiges=[1] onCreated onClose>   ← individual
 ├─ <ScheduleModal vestiges=selecionados onCreated onClose>       ← lote
 └─ <AdminPanel user>
       └─ <WithdrawalRequestsModal user onClose>                 ← novo
```

**Dois pontos de renderização do `ScheduleModal`.** Toda mudança de assinatura precisa ser aplicada em `Dashboard.tsx:266-271` **e** `VestigeCard.tsx:318-323`. Esquecer um dos dois quebra o type-check — o que, neste caso, é sorte: o compilador pega.

### 5.2 `client/types.ts` — tipos e rótulos

Acrescentar, seguindo o padrão de `DESTINACAO_OPTIONS` (array `as const` + função `get...Label`):

```ts
// === Solicitação de Retirada ===
// O banco guarda o `value` (código); a tela mostra o `label`. Ver Parte 3.3 do plano.
// Os `value` são espelho de VALID_REASONS em server/src/routes/withdrawalRoutes.ts.
// Mesmo padrão de ESTADO_CONSERVACAO_OPTIONS e DESTINACAO_OPTIONS, logo acima neste arquivo.
export const WITHDRAWAL_REASONS = [
  { value: 'DESTRUICAO',           label: 'Destruição' },
  { value: 'RESTITUICAO',          label: 'Restituição' },
  { value: 'ANALISE_INVESTIGACAO', label: 'Análise pela Investigação' },
  { value: 'SOLICITACAO_JUDICIAL', label: 'Solicitação Judicial' },
  { value: 'OUTROS',               label: 'Outros' },
] as const;

export type WithdrawalReason = typeof WITHDRAWAL_REASONS[number]['value'];

export const getWithdrawalReasonLabel = (value: string): string =>
  WITHDRAWAL_REASONS.find((o) => o.value === value)?.label || value;

export const WITHDRAWAL_STATUS_OPTIONS = [
  { value: 'SOLICITADA',     label: 'Agendada' },
  { value: 'CONCLUIDA',      label: 'Concluída' },
  { value: 'CANCELADA',      label: 'Cancelada' },
  { value: 'NAO_COMPARECEU', label: 'Não compareceu' },
] as const;

export type WithdrawalStatus = typeof WITHDRAWAL_STATUS_OPTIONS[number]['value'];

export const getWithdrawalStatusLabel = (value: string): string =>
  WITHDRAWAL_STATUS_OPTIONS.find((o) => o.value === value)?.label || value;

export interface WithdrawalRequestItem {
  id: string;                 // BigInt do banco, já convertido para string pela API
  vestigeId: string;
  reason: string;             // CÓDIGO (ex.: 'ANALISE_INVESTIGACAO'). Exibir sempre
                              // com getWithdrawalReasonLabel() — ver Parte 3.3.
  reasonDetail?: string | null;
  material?: string | null;
  fav: string;                // ← vem de registroFav; ver Parte 0.4
  // Só os NÚMEROS dos itens ativos. Atenção: aqui é string[], diferente de
  // Vestige.requisicoes / Vestige.involucros, que são VestigeItem[] (número + motivo).
  requisicoes: string[];
  municipio?: string | null;
  involucros: string[];
  vestigeDeleted: boolean;
}

export interface WithdrawalRequest {
  id: string;
  scheduledFor: string;       // ISO
  status: string;
  notes?: string | null;
  // Preenchido só quando um ADMIN agendou com menos de 24h (Parte 2.11).
  // Não-nulo = a solicitação furou o prazo e precisa de destaque na tela.
  deadlineOverrideReason?: string | null;
  requestedBy: string;
  requesterName?: string | null;
  requesterEmail?: string | null;
  requestedAt: string;
  calendarOpenedAt?: string | null;
  statusChangedByName?: string | null;
  statusChangedAt?: string | null;
  statusNote?: string | null;
  items: WithdrawalRequestItem[];
}

export interface OpenWithdrawalItem {
  vestigeId: string;
  requestId: string;
  scheduledFor: string;
  requesterName: string;
}

export const canManageWithdrawals = (user: Pick<User, 'role'>): boolean =>
  user.role === 'ADMIN' || user.role === 'PERITO';
```

A constante `REASONS` que hoje está solta em `ScheduleModal.tsx:13-19` **é removida** e o modal passa a importar `WITHDRAWAL_REASONS`. Como ela deixa de ser um array de strings e passa a ser um array de objetos, os dois `<select>` do modal (o de aplicar a todos, `:170-177`, e o por item, `:195-207`) mudam de `<option key={r} value={r}>{r}</option>` para `<option key={o.value} value={o.value}>{o.label}</option>`. O type-check pega se você esquecer.

### 5.3 `client/services/withdrawalService.ts` — arquivo novo

Espelhe o estilo de `dataService.ts` (interface `Api*` + mapper + `apiRequest`).

```ts
import { apiRequest } from './apiClient';
import { WithdrawalRequest, WithdrawalRequestItem, OpenWithdrawalItem } from '../types';

interface ApiWithdrawalItem {
  id: string; vestigeId: string; reason: string; reasonDetail?: string | null;
  material?: string | null; registroFav?: string | null; requisicoes?: string[] | null;
  municipio?: string | null; involucros?: string[] | null; vestigeDeleted?: boolean;
}
interface ApiWithdrawalRequest { /* espelha serializeRequest da Parte 4.0b */ }

// Tradução registroFav → fav, igual ao mapVestige do dataService (Parte 0.4).
const mapItem = (i: ApiWithdrawalItem): WithdrawalRequestItem => ({
  id: i.id,
  vestigeId: i.vestigeId,
  reason: i.reason,           // fica em código; quem traduz é getWithdrawalReasonLabel na hora de exibir
  reasonDetail: i.reasonDetail ?? null,
  material: i.material ?? null,
  fav: i.registroFav ?? '',
  requisicoes: i.requisicoes ?? [],
  municipio: i.municipio ?? null,
  involucros: i.involucros ?? [],
  vestigeDeleted: Boolean(i.vestigeDeleted),
});

const mapRequest = (r: ApiWithdrawalRequest): WithdrawalRequest => ({ /* ... */ items: (r.items ?? []).map(mapItem) });
```

Funções exportadas:

| Função | Rota | Notas |
|---|---|---|
| `createWithdrawalRequest(payload)` | `POST /` | devolve `WithdrawalRequest` mapeada |
| `listWithdrawalRequests(filters)` | `GET /` | devolve `{ items, meta }` |
| `getWithdrawalRequest(id)` | `GET /:id` | — |
| `listOpenWithdrawalItems()` | `GET /open-items` | array plano, sem paginação |
| `updateWithdrawalStatus(id, status, statusNote?)` | `PATCH /:id/status` | só `CANCELADA` e `NAO_COMPARECEU` (4.6) |
| `completeWithdrawal(id, withdrawnVestigeIds, statusNote?)` | `POST /:id/complete` | conclui **e movimenta** os vestígios (4.8) |
| `markCalendarOpened(id)` | `POST /:id/calendar-opened` | **fire and forget**: quem chama faz `.catch(console.error)`, mesmo padrão de `logPcnetAction` (`VestigeCard.tsx:91-93`) |
| `buildGoogleCalendarUrl(request)` | — | ver abaixo |

**`buildGoogleCalendarUrl` — mover para cá** toda a montagem que hoje está dentro do `handleConfirm` (`ScheduleModal.tsx:83-128`), incluindo `formatGCalDate`. Passa a receber a solicitação **já gravada**, então:

- ⚠️ **traduza o motivo antes de escrever no evento.** O item vem com `reason` em código; o e-mail que a URC recebe **não pode** dizer `MOTIVO DA SAÍDA: ANALISE_INVESTIGACAO`. Use `getWithdrawalReasonLabel(item.reason)`, e para `OUTROS` mantenha o formato de hoje: `Outros: <justificativa>`;
- o corpo cita o identificador da solicitação (é o que permite achar a lista completa quando ela for truncada);
- **o limite da 2.7 vale aqui:**

```ts
const MAX_ITENS_NO_EVENTO = 20;

// A URL do Google carrega o corpo do evento na querystring. Acima de ~8.000 caracteres
// a URL entra na faixa em que servidores e navegadores começam a truncar; 200 itens
// gerariam ~57.000. O registro no EvidenceOS guarda tudo — o evento é só conveniência.
const visiveis = request.items.slice(0, MAX_ITENS_NO_EVENTO);
const ocultos = request.items.length - visiveis.length;
const rodapeItens = ocultos > 0
  ? `\n---\n... e mais ${ocultos} item(ns). Lista completa na solicitação ${request.id} do EvidenceOS.`
  : '';
```

Preserve **integralmente** o formato de bloco por item que existe hoje (`ScheduleModal.tsx:104-108`), que desde 2026-09-10 é:

```
---
MATERIAL: <material>
FAV: <fav>
REQUISIÇÃO(ÕES): <n1>, <n2> | INVÓLUCRO(S): <n1>, <n2>
MOTIVO DA SAÍDA: <rótulo do motivo>
```

com os números separados por vírgula e `N/I` quando a lista está vazia. Preserve também o título dinâmico, o `location` e o `add=pericia.lavras@gmail.com`. E preserve `formatGCalDate` como está — ver 1.2.

### 5.4 `client/components/ScheduleModal.tsx` — reescrita do submit

**Nova assinatura:**

```ts
interface ScheduleModalProps {
  vestiges: Vestige[];
  onClose: () => void;
  onCreated?: (request: WithdrawalRequest) => void;   // ← novo (R-06, Parte 2.8)
  openWithdrawals?: Map<string, OpenWithdrawalItem>;  // ← novo, para o aviso de duplicidade
  user?: User;                                        // ← novo, para a exceção das 24h (2.11)
}
```

> ⚠️ **O `user` é opcional de propósito, e o default tem que ser o seguro.** O `VestigeCard` já declara `user?: User` (`VestigeCard.tsx:15`), então ele pode chegar indefinido aqui. Escreva `const isAdmin = user?.role === 'ADMIN'` — na dúvida, **não** é admin. Nunca `user!.role`. De todo modo o servidor barra sozinho; o front só decide se mostra o caminho da exceção.

**Preservar integralmente:** as validações listadas em 1.2, o layout, o seletor de motivo por item, a bolinha de pendência e o "aplicar a todos".

> ⚠️ **Três comparações a `'Outros'` precisam virar `'OUTROS'`** (decisão 3.3), e o compilador **não** pega nenhuma delas — são comparações de string, sempre válidas para o TypeScript. Se passar batido, o campo de justificativa nunca aparece e a validação de "Outros" nunca dispara. Elas estão em `ScheduleModal.tsx:43` (limpar o texto no "aplicar a todos"), `:77` (validação local) e `:209` (renderizar o input de justificativa). Some-se a essas a linha do payload logo abaixo e a `:100` (montagem do corpo do evento, que migra para o `withdrawalService` — ver 5.3): **cinco** no total. Já a mensagem de erro em `:79` é texto para o usuário e continua com "Outros" mesmo.

**Novos estados:**

```ts
const [submitting, setSubmitting] = useState(false);
const [createdRequest, setCreatedRequest] = useState<WithdrawalRequest | null>(null);
const [overrideReason, setOverrideReason] = useState('');   // justificativa de urgência (2.11)
```

#### Fase 1a — a validação das 24h deixa de ser um beco sem saída para o ADMIN

A validação de hoje (`ScheduleModal.tsx:57-67`) **para o fluxo** com um erro vermelho. Ela continua fazendo exatamente isso para PERITO e VISUALIZADOR. Para ADMIN, muda de bloqueio para **passagem com pedágio**:

```ts
const ANTECEDENCIA_MINIMA_MS = 24 * 60 * 60 * 1000;
const isAdmin = user?.role === 'ADMIN';

const foraDoPrazo = selectedDateTime.getTime() < Date.now() + ANTECEDENCIA_MINIMA_MS;

if (foraDoPrazo && !isAdmin) {
  setError('ERRO: Agendamento bloqueado. É necessária antecedência mínima de 24h. Para urgências, contate a administração da URC.');
  return;   // continua sendo beco sem saída — exatamente como hoje
}

if (foraDoPrazo && isAdmin && !overrideReason.trim()) {
  setError('Para agendar com menos de 24h de antecedência, descreva o motivo da urgência.');
  return;
}
```

E no envio: `deadlineOverrideReason: foraDoPrazo && isAdmin ? overrideReason.trim() : undefined`.

**O que aparece na tela quando o ADMIN escolhe uma data fora do prazo** — e note que **não é vermelho**:

- Bloco **âmbar** (aviso, não erro — ele *pode* prosseguir):
  > ⚠️ **Este agendamento está abaixo do prazo mínimo de 24h.** Como administrador, você pode prosseguir, mas a urgência ficará **registrada e identificada** nesta solicitação.
- Logo abaixo, `<textarea>` **obrigatório**, `maxLength={500}`, rótulo **"Justificativa da urgência"**, placeholder do tipo *"Ex.: ordem judicial com prazo para amanhã, ofício nº ..."*.
- O aviso e o campo **aparecem e somem conforme a data/hora muda**, não só ao tentar enviar. O ADMIN precisa saber que entrou no caminho da exceção **antes** de preencher o resto.
- Para quem não é ADMIN nada disso existe: nem o aviso âmbar, nem o campo. Só o erro vermelho de sempre.

> ⚠️ **O `min` do input de data depende do perfil.** O defeito da 1.4 manda passar `min` para **amanhã** — mas isso impediria o ADMIN de escolher hoje, que é justamente o caso da urgência. Portanto: `min` = **amanhã** para PERITO e VISUALIZADOR, **hoje** para ADMIN. Trocar por um `min` fixo de amanhã mataria a exceção pela porta dos fundos, sem erro nenhum aparecer.

#### Fase 1 — formulário (o que já existe)

No submit, **depois** das validações locais:

```ts
setSubmitting(true);
setError(null);
try {
  const created = await createWithdrawalRequest({
    scheduledFor: selectedDateTime.toISOString(),
    notes: notes.trim() || undefined,
    deadlineOverrideReason: foraDoPrazo && isAdmin ? overrideReason.trim() : undefined,
    items: vestiges.map((v) => ({
      vestigeId: v.id,
      reason: selectedReasons[v.id],   // já é o CÓDIGO: o <option value> passou a ser o value (3.3)
      reasonDetail: selectedReasons[v.id] === 'OUTROS' ? customReasonTexts[v.id]?.trim() : undefined,
    })),
  });
  setCreatedRequest(created);   // → fase 2
  onCreated?.(created);         // → Dashboard recarrega e o selo aparece
} catch (err) {
  setError(err instanceof Error ? err.message : 'Falha ao registrar a solicitação.');
  // NÃO abre o Google. Este é o ponto do plano inteiro.
} finally {
  setSubmitting(false);
}
```

Requisitos de UI desta fase:

- **Botão desabilitado enquanto `submitting`**, com rótulo "Registrando..." e `cursor-not-allowed`. Sem isso, duplo clique cria duas solicitações.
- **Rótulo do botão muda** de "Confirmar e Abrir Agenda" para **"Confirmar Solicitação"** — o texto atual promete abrir a agenda, e agora não abre mais nesse clique. Prometer o que não acontece é o defeito de UX mais caro de um formulário.
- **Aviso de lote grande:** se `vestiges.length > 200`, mostrar aviso âmbar **antes** de submeter ("O sistema registra no máximo 200 itens por solicitação. Divida em mais de um agendamento."), porque a barra de seleção do `Dashboard` não tem teto e o 400 do backend chegaria como surpresa.
- **Aviso de duplicidade** (Parte 2.5): para cada item que já esteja em `openWithdrawals`, alerta amarelo **não bloqueante**: `FAV 12345 já tem retirada agendada para 26/08 às 14h.` Idem para `estaForaDaUrc(v.destinacao)`: `FAV 12345 consta como já retirado da URC.`
- Corrigir `maxLength={20}` → `maxLength={200}` e o placeholder.
- Corrigir o `min` do input de data — **amanhã para PERITO/VISUALIZADOR, hoje para ADMIN** (defeito da 1.4 + exceção da 2.11; ver o aviso na fase 1a).
- Remover o import morto de `ExclamationCircleIcon`.
- **Encadear o `user` pelos dois pontos de renderização** (5.1): `Dashboard.tsx:266-271` já tem `user` à mão; `VestigeCard.tsx:318-323` repassa o próprio `user`, que é opcional.

#### Fase 2 — sucesso (nova)

Renderizada quando `createdRequest !== null`. **Substitui** o formulário no mesmo modal (não é um segundo modal).

Conteúdo, nesta ordem de leitura:

1. **Ícone de confirmação verde** e título **"Solicitação registrada"**.
2. **Uma frase que resolve o medo do usuário:** *"O registro já está salvo no EvidenceOS. Abrir a agenda é opcional e não altera o que foi registrado."* — é isso que impede a pessoa de achar que perdeu o trabalho ao fechar sem abrir o Google.
3. **Resumo:** data/hora formatadas em pt-BR (`26/08/2026 às 14:00`), nº de itens, solicitante, identificador da solicitação.
4. **Lista dos itens** com material, FAV e motivo (rolável).
5. **Dois botões**, lado a lado:
   - **Primário — "Abrir no Google Agenda"**, como **âncora**:
     ```tsx
     <a
       href={buildGoogleCalendarUrl(createdRequest)}
       target="_blank"
       rel="noopener noreferrer"
       onClick={() => { markCalendarOpened(createdRequest.id).catch(console.error); }}
       className="...estilo do botão âmbar..."
     >
       Abrir no Google Agenda
     </a>
     ```
     **Por que âncora e não `window.open` (R-02):** âncora com `target="_blank"` é navegação iniciada pelo usuário e **nenhum bloqueador de popup interfere**. O `window.open`, mesmo síncrono, ainda pode ser barrado em configurações mais restritivas e em alguns navegadores móveis. A âncora elimina a classe inteira de problema — e continua obedecendo a 2.4, porque o gravar já aconteceu.
   - **Secundário — "Fechar"**, chama `onClose()`.
6. Se `createdRequest.items.length > 20`, uma nota discreta: *"O evento do Google lista os 20 primeiros itens; a solicitação completa fica no EvidenceOS."*

Requisitos de acessibilidade mínimos desta fase (baratos e valiosos aqui):

- `autoFocus` no botão primário, para que Enter faça a coisa certa logo após o sucesso.
- O `X` do cabeçalho continua fechando — não há risco de perda, já está gravado.
- `aria-live="polite"` no bloco de sucesso, para leitor de tela anunciar a confirmação.

### 5.5 `client/hooks/useVestiges.ts` — índice de solicitações abertas

Em `loadData()`, junto do `Promise.all` que já busca vestígios e categorias:

```ts
const [data, loadedCategories, openItems] = await Promise.all([
  fetchAllVestiges(),
  getCategories(),
  // ⚠️ O .catch fica AQUI, na promise individual — nunca no Promise.all inteiro.
  // Ver armadilha T-03 (Parte 11): sem isto, uma falha na rota de retiradas
  // rejeita o Promise.all, cai no catch do loadData e a LISTA DE VESTÍGIOS
  // some da tela por causa de um selo decorativo.
  listOpenWithdrawalItems().catch((err) => {
    console.error('Falha ao carregar retiradas agendadas (o selo não será exibido):', err);
    return [] as OpenWithdrawalItem[];
  }),
]);

// A rota devolve ordenado por scheduledFor asc; o primeiro a entrar no Map
// é a retirada mais próxima, que é a que o selo deve mostrar.
const map = new Map<string, OpenWithdrawalItem>();
openItems.forEach((item) => {
  if (!map.has(item.vestigeId)) map.set(item.vestigeId, item);
});
setOpenWithdrawals(map);
```

Expor `openWithdrawals` no retorno do hook.

**Não** mexa em `fetchAllVestiges` nem na query de vestígios — a busca é o caminho crítico da tela e não deve ganhar peso por causa disto.

> Nota de custo: `searchVestiges` chama `loadData()` a cada busca (`useVestiges.ts:93`), então a rota `/open-items` é chamada em toda pesquisa. É uma consulta indexada devolvendo poucas centenas de linhas curtas — irrelevante perto do `fetchAllVestiges`, que já pagina a base inteira. Não otimize isso preventivamente.

### 5.6 `client/components/VestigeCard.tsx` — selo "Retirada agendada"

**Novas props:** `withdrawal?: OpenWithdrawalItem` e `onWithdrawalCreated?: () => void`.

**Onde o selo entra.** Dentro da célula **"Situação"** (`VestigeCard.tsx:228-243`), como segunda linha logo abaixo do badge existente:

```tsx
{withdrawal && (
  <span className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold
                   bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30"
        title={`Solicitada por ${withdrawal.requesterName}`}>
    <CalendarIcon className="w-3 h-3" />
    Retirada agendada — {formatCurto(withdrawal.scheduledFor)}
  </span>
)}
```

com `formatCurto` produzindo `26/08 14h`.

**Regras de cor — não improvise:**

- **Âmbar** = há retirada agendada, o item **está** na URC.
- **Vermelho** = `estaForaDaUrc`, o item **não está** na URC (faixa lateral + aviso no topo + badge, `VestigeCard.tsx:125-138` e `216-231`).
- **O vermelho já significa uma coisa e não pode passar a significar duas.** Se um vestígio estiver simultaneamente `RETIRADO` **e** com solicitação aberta (acontece: remarcação, dado defasado), **os dois sinais aparecem** — vermelho no topo, âmbar na Situação. É informação verdadeira e o operador precisa vê-la.

**Não** coloque o selo âmbar como faixa no topo: aquele espaço é do alerta vermelho, e dois avisos empilhados no topo transformam o card num painel de alarmes.

O `<ScheduleModal>` renderizado em `VestigeCard.tsx:318-323` passa a receber `onCreated={() => onWithdrawalCreated?.()}`.

### 5.7 `client/components/SearchResults.tsx` — repasse de props

Duas props novas, só encaminhadas: `openWithdrawals?: Map<string, OpenWithdrawalItem>` e `onWithdrawalCreated?: () => void`. No `map` dos cards (`SearchResults.tsx:184-191`):

```tsx
<VestigeCard
  /* ...props existentes... */
  withdrawal={openWithdrawals?.get(vestige.id)}
  onWithdrawalCreated={onWithdrawalCreated}
/>
```

### 5.8 `client/components/Dashboard.tsx` — ligação final

- Pegar `openWithdrawals` do `useVestiges()`.
- Repassar para `<SearchResults>` junto com `onWithdrawalCreated={() => void refreshData()}`.
- No `<ScheduleModal>` do lote (`Dashboard.tsx:266-271`): `onCreated={() => void refreshData()}`.
- **Não limpar a seleção automaticamente** — decisão da Parte 2.8.

### 5.9 `client/components/WithdrawalRequestsModal.tsx` — arquivo novo

Modal de gestão, no padrão de `AuditLogModal.tsx` (que usa `createPortal` — use também).

> **Paleta:** siga o **zinc/âmbar** do `ScheduleModal` e do `AdminPanel`, não o `slate/indigo` do `AuditLogModal`. O `slate` ali é resíduo de uma versão anterior do tema; replicá-lo espalha a inconsistência.

**Props:** `{ user: User; onClose: () => void; onDataChanged?: () => void }`.

> 💡 **A fiação do `onDataChanged` já existe e está sobrando no código.** O `AdminPanel` **declara** `onRefresh: () => void` na sua interface (`AdminPanel.tsx:23`) e o `Dashboard` **já passa** `onRefresh={() => void refreshData()}` (`Dashboard.tsx:161`) — mas o componente **nunca desestrutura a prop**, então ela está morta hoje. Basta passar a desestruturá-la e repassar como `onDataChanged`. É por aí que o card do vestígio ganha a faixa vermelha assim que a retirada é registrada, sem inventar nenhum encanamento novo.

**Este é o painel que o usuário descreveu em 2026-08-25:** o perito abre, vê as demandas do dia, recebe a pessoa e registra ali mesmo o que saiu.

**Estrutura:**

1. **Cabeçalho** — ícone de calendário em âmbar, título "Retiradas Agendadas", subtítulo com a contagem do filtro atual, botão de fechar.
2. **Barra de filtros** — `select` de status (default **`SOLICITADA`**) e dois inputs de data (`de` / `até`, opcionais). Trocar o filtro refaz a busca.
3. **Estados da lista**, todos obrigatórios: carregando · erro (com botão "Tentar de novo") · vazio ("Nenhuma retirada agendada para o filtro atual.") · com dados.
4. **Uma linha por solicitação**, colapsada por padrão:
   - `26/08/2026 · 14:00` · **12 itens** · `Fulano de Tal` · badge de status.
   - **Badge "Atrasada"** em âmbar quando `status === 'SOLICITADA' && new Date(scheduledFor) < new Date()`. É derivação pura de apresentação, sem campo novo no banco — e é o que responde "o que ficou para trás?" numa olhada.
   - Ícone de "aberta no Google" quando `calendarOpenedAt` estiver preenchido, com `title` explicando que o sistema sabe que a aba foi aberta, **não** que o evento foi salvo (mesma honestidade da 2.1).
   - 🔶 **Badge "Urgência — fora do prazo de 24h"** quando `deadlineOverrideReason` não for nulo, e a justificativa **em destaque ao expandir**, com quem autorizou (`requesterName`, que por definição é um ADMIN). O perito que vai receber a pessoa precisa saber que aquela retirada entrou por exceção e por quê — essa é metade da razão de a exceção ser registrada (2.11).
   - Expandindo: os itens com material, FAV, invólucros e motivo — sempre via **`getWithdrawalReasonLabel(item.reason)`**, nunca o código cru (3.3) — com a justificativa quando for `OUTROS`, mais as observações gerais. Item com `vestigeDeleted` recebe a marca `(vestígio excluído do cadastro)`.
5. **Três ações**, **visíveis apenas para ADMIN e PERITO** (`canManageWithdrawals(user)`) e **apenas quando `status === 'SOLICITADA'`**:

   | Botão | Rota | O que acontece com os vestígios |
   |---|---|---|
   | **Registrar retirada** (primário, âmbar) | `POST /:id/complete` | os marcados viram **`RETIRADO`** |
   | **Cancelar** (secundário) | `PATCH /:id/status` → `CANCELADA` | **nada muda** — ninguém saiu da URC |
   | **Não compareceu** (secundário) | `PATCH /:id/status` → `NAO_COMPARECEU` | **nada muda** |

   - O rótulo é **"Registrar retirada"**, não "Concluir". O botão precisa dizer o que faz: "Concluir" não avisa ninguém de que doze vestígios estão prestes a sair da URC no banco de dados.
   - Se o backend responder **409** (alguém agiu na mesma solicitação em outra aba), mostrar a mensagem que veio da API e **recarregar a lista**, em vez de repetir a tentativa.

6. **Diálogo de "Registrar retirada"** — é aqui que mora o cuidado da Parte 2.10:
   - Lista os itens da solicitação com **checkbox, todos marcados por padrão**, cada linha mostrando material, FAV e invólucros. O caso comum ("levou tudo") continua sendo um clique.
   - Item cujo vestígio **já está `RETIRADO`** aparece marcado, desabilitado e com a nota `já consta fora da URC` — o backend o ignora (4.8), e explicar isso na tela evita que o perito ache que o sistema errou.
   - Contador ao vivo: **"8 de 12 materiais serão marcados como retirados"**, atualizando conforme desmarca.
   - Campo de observação opcional.
   - **Aviso destacado, em âmbar, com o número na frente:**
     > ⚠️ **8 materiais** passarão a constar como **retirados da URC** e receberão a faixa vermelha no card. A ação fica registrada no histórico de destinação de cada vestígio, com seu nome e a data. **Não é possível desfazer por aqui.**
   - Se desmarcar tudo, o botão de confirmar fica **desabilitado**, com a dica: *"Se ninguém compareceu, use a ação 'Não compareceu'."* — é o espelho exato do 400 do backend, dito antes de o usuário levar o erro.
   - Depois do sucesso: fecha o diálogo, recarrega a lista **e chama `onDataChanged()`**, para a faixa vermelha aparecer nos cards atrás do modal.

7. **Formatação de data** sempre com `new Date(iso).toLocaleString('pt-BR')`. O backend devolve ISO em UTC; quem converte para o fuso de quem olha é o navegador.

8. **Solicitação já concluída** mostra, na linha, quem registrou e quando (`statusChangedByName`, `statusChangedAt`) e a `statusNote` — inclusive o `Retirada parcial: 8 de 12 itens.` gravado automaticamente. Sem ações disponíveis: status terminal é terminal (2.6).

**Como se corrige um erro** (precisa estar claro para quem for implementar, e vale explicar ao usuário): se o perito marcar um item por engano, **não** se reabre a solicitação. Corrige-se pela tela de edição do vestígio, mudando a `destinacao` de volta — caminho que **já existe** e **já grava** `VestigeDestinationLog` com de-para, autor e timestamp (`vestigeRoutes.ts:369-382`). O erro e a correção ficam os dois no histórico, que é como registro de custódia deve se comportar: não se apaga, se retifica.

### 5.10 `client/components/AdminPanel.tsx` — botão de acesso

Acrescentar "Retiradas Agendadas" ao Painel Operacional:

- **Grade:** hoje é `lg:grid-cols-5` com 5 botões (`AdminPanel.tsx:106`). Com 6, passar para **`lg:grid-cols-3`** (duas linhas de 3). `grid-cols-6` espremeria rótulos longos como "Gerenciar Usuários". O `sm:grid-cols-2` continua igual.
- **`hasPermission`:** tratar `'RETIRADAS'` retornando `true` — todos **veem** a lista; só ADMIN/PERITO **agem** nela, controle que fica dentro do modal (5.9, item 5) **e no servidor** (`requireEditorAccess`).
  > **Por que o VISUALIZADOR também vê a lista.** O usuário pediu o painel pensando em perito e admin, e são eles que vão trabalhar nele. Mas o VISUALIZADOR **é quem cria a solicitação** (README linha 97) — se ele não puder conferir que o agendamento dele foi registrado, o cenário 1 da Parte 7.3, que é o problema central deste plano, volta a existir por outro caminho. Ele vê e não mexe. Se o usuário preferir esconder o botão dele, basta trocar este `true` por `canManageWithdrawals(user)` — mudança de uma linha, sem efeito nenhum no backend, que já barra por perfil.
- **Passar pelo `handleAction`**, que já registra auditoria de acesso ao recurso (`AdminPanel.tsx:52-63`).
- **Desestruturar o `onRefresh`** (hoje declarado e não usado, `AdminPanel.tsx:23` e `:30`) e repassá-lo ao modal como `onDataChanged` — ver a nota da 5.9.
- Ícone: `ClipboardListIcon` já existe e é usado em "Logs de Auditoria"; para não repetir, use o `CalendarIcon`, que combina com o domínio.

### 5.11 `README.md` — manter a documentação verdadeira

A seção **"3. 📅 Agendamento de Retirada (Google Agenda)"** (linha 29) descreve o comportamento antigo. Atualizar para dizer que a solicitação é **registrada no EvidenceOS** e que a agenda passou a ser um passo opcional posterior. Documentação que descreve um fluxo que não existe mais é pior do que documentação nenhuma.

---

## Parte 6 — Plano de Execução

> Ordem obrigatória. As etapas de escrita dependem da infraestrutura das anteriores. Atualize o `**Status:**` de cada etapa antes de encerrar a sessão.

### ETAPA 0 — Preparação
**Status:** ✅ concluída em 2026-09-10 — trabalho feito direto na `main`, sem branch e sem commit (fluxo do projeto). Baseline de type-check limpo nos dois lados.

1. `git status` — confirmar `main` limpa e criar branch de trabalho.
2. Subir o ambiente: `npm run dev:full` na raiz (sobe o Postgres em Docker se preciso, depois backend e frontend).
3. Reler as **Partes 0, 2 e 11**.
4. Conferir o quadro de gates no topo. **Em 2026-08-25 os dois foram liberados pelo usuário** (GATE 1: 24h no servidor com exceção só para ADMIN; GATE 2: registrar retirada movimentando o vestígio). Não há gate aberto — mas confira, porque o quadro é a fonte, não esta linha.
5. Registrar o baseline: `cd client && npx tsc --noEmit` e `cd server && npx tsc --noEmit`, ambos limpos (Parte 0.3).

**Pronto quando:** branch criada, `npm run dev:full` servindo, os dois type-checks limpos.

### ETAPA 1 — Banco de dados
**Status:** ✅ concluída em 2026-09-10 — migration `20260910_0002_add_withdrawal_requests` (R-42), SQL idêntica à gerada pelo Prisma. Parte 3.6 conferida no banco local: 2 tabelas, coluna `deadline_override_reason`, 4 índices + 2 PKs, 4 FKs, migration registrada.

1. Acrescentar os dois models e as três relações inversas em `server/prisma/schema.prisma` (Parte 3.4).
2. Criar a pasta e o `migration.sql` à mão (Parte 3.5). **Não use `migrate dev`** — armadilha A1.
3. `cd server` (armadilhas A2/A3) e rodar `npx prisma migrate deploy` e `npx prisma generate`.

**Pronto quando:** as 4 consultas de verificação da Parte 3.6 retornarem 2 tabelas, 4 índices, 4 FKs e a migration listada em `_prisma_migrations`. E `cd server && npx tsc --noEmit` limpo.

### ETAPA 2 — Rotas de leitura
**Status:** ✅ concluída em 2026-09-10 — verificações L1 a L6 do roteiro automatizado (inclui `item.id` como string e filtro inválido → 400).

Criar `withdrawalRoutes.ts` com a infraestrutura da Parte 4.0 (serializador, `safeParse`, constantes), mais `GET /`, `GET /open-items` e `GET /:id`. Registrar no `server.ts`. Testar com dado inserido à mão no banco.

Ler antes de escrever mantém a superfície de risco baixa enquanto o contrato é validado — e o `INSERT` manual é o jeito mais rápido de provar que o serializador de BigInt está certo (T-01).

```sql
-- dado de teste; troque os UUIDs por um vestígio e um usuário reais
INSERT INTO withdrawal_requests (id, scheduled_for, status, requested_by, requested_at)
VALUES (gen_random_uuid(), NOW() + INTERVAL '2 days', 'SOLICITADA', '<user-uuid>', NOW());

INSERT INTO withdrawal_request_items (request_id, vestige_id, reason)
VALUES ((SELECT id FROM withdrawal_requests ORDER BY requested_at DESC LIMIT 1), '<vestige-uuid>', 'DESTRUICAO');
```

**Pronto quando:** `GET /` e `GET /:id` devolvem **200** com o item aparecendo e `items[0].id` vindo como **string**; `GET /open-items` devolve o par `{vestigeId, requestId, scheduledFor, requesterName}`; `GET /:id` inexistente devolve **404**; sem JWT devolve **401**.

### ETAPA 3 — Rota de criação 🚦
**Status:** ✅ concluída em 2026-09-10 — cenários 1–8, 13a–13h, 14 e 16 passando; 7.2 conferida (4 ações de auditoria, só o 13d na consulta de exceções, agendar não tocou em `vestiges`). GATE 1 liberado em 2026-08-25.

1. Implementar `POST /` com todas as validações da Parte 4.2, usando `safeParse` (T-02).
2. **Regra das 24h com exceção só para ADMIN** (item 5 da 4.2 + Parte 2.11), incluindo a folga de 5 min do relógio e a gravação condicional da justificativa.
3. Criação atômica: solicitação + itens num único `create` aninhado.
4. `auditService.log` com `WITHDRAWAL_REQUESTED`, já com `deadlineOverride` no `details`.
5. Rodar os cenários 1 a 8, 13a-13h, 14 e 16 da Parte 7.1.

**Pronto quando:** os cenários acima passando com os códigos HTTP exatos da tabela, **e** as consultas SQL da Parte 7.2 mostrando (a) a solicitação com seus itens, (b) o `WITHDRAWAL_REQUESTED` em `audit_logs`, e (c) **só o 13d** aparecendo na consulta de exceções de prazo — o 13g não pode estar lá.

### ETAPA 4 — Rotas de status e calendário
**Status:** ✅ concluída em 2026-09-10 — cenários 9–12 e 17 passando (`calendar_opened_at` manteve o primeiro instante).

`PATCH /:id/status` (com a trava de status terminal → 409 via `updateMany` atômico, e recusando `CONCLUIDA` com 400) e `POST /:id/calendar-opened` (idempotente). **Sem tocar em `Vestige` em nenhuma das duas.**

**Pronto quando:** cenários 9 a 12 e 17 da Parte 7.1 passando, incluindo a confirmação de que `calendar_opened_at` **mantém o primeiro instante** após duas chamadas.

### ETAPA 4b — Rota de registro da retirada (movimenta vestígio) ⚠️
**Status:** ✅ concluída em 2026-09-10 — cenários 18–24 passando, incluindo o 21 (vestígio de fora → 400, nada movimentado). 7.2b: corte 8 RETIRADO / 4 NAO_INICIADO, 8 logs com autor, nota de parcialidade, auditoria com o que ficou, zero logs fora da solicitação.

`POST /:id/complete` (Parte 4.8). **A etapa mais sensível de todo o plano** — é a única que escreve fora das tabelas de retirada.

Ordem sugerida dentro da etapa, para não escrever nada errado no meio do caminho:

1. Validações primeiro, **com a checagem de subconjunto (item 3 da 4.8) antes de qualquer escrita.**
2. Só então a transação.
3. Só então a auditoria.

**Pronto quando:** cenários 18 a 23 da Parte 7.1 passando **e** as consultas SQL da Parte 7.2b confirmando, para uma retirada parcial: os marcados com `destinacao = 'RETIRADO'`, os desmarcados **ainda em `NAO_INICIADO`**, uma linha em `vestige_destination_logs` por item movimentado com o autor certo, e um `WITHDRAWAL_COMPLETED` em `audit_logs`.

### ETAPA 5 — Camada de serviço no front
**Status:** ✅ concluída em 2026-09-10 — `types.ts` e `withdrawalService.ts`; type-check limpo.

`types.ts` (5.2) e `withdrawalService.ts` (5.3), incluindo a mudança do `buildGoogleCalendarUrl` para lá com o corte de 20 itens (2.7). Nenhuma tela muda ainda.

**Pronto quando:** `cd client && npx tsc --noEmit` limpo, com o `ScheduleModal` ainda funcionando como antes (o `REASONS` local vira import).

### ETAPA 6 — ScheduleModal em duas fases
**Status:** ✅ testado pelo usuário em 2026-09-10 — cenários 1, 2 e 5 da 7.3 (o 5 com o navegador em "Sem conexão de rede"; a mensagem de falha de conexão foi traduzida no `withdrawalService`). Cenários 3 e 4 sem efeito (Google Agenda retirado). Não testado na tela: 6 (duplo clique).

O coração da mudança (5.4). Inclui os defeitos de carona da 1.4 e o `onCreated` chegando aos **dois** pontos de renderização (5.1).

**Pronto quando:** cenários 1, 2, 3, 5 e 6 da Parte 7.3 passando. O cenário 5 (backend derrubado → erro no modal, **nenhuma aba aberta**) é o que prova a inversão de prioridade da 2.4 — não o pule.

### ETAPA 7 — Selo no card
**Status:** ✅ testado pelo usuário em 2026-09-10 — cenários 7 (selo âmbar) e 8 (aviso de duplicidade) da 7.3. Não testado na tela: 13 (rota `/open-items` derrubada). Ver R-45.

`useVestiges.ts` (5.5, com o `.catch` no lugar certo — T-03), `VestigeCard.tsx` (5.6), `SearchResults.tsx` (5.7) e `Dashboard.tsx` (5.8).

**Pronto quando:** cenário 7 da Parte 7.3 passando **e** a degradação silenciosa confirmada: com a rota `/open-items` derrubada de propósito, a listagem de vestígios continua funcionando normalmente, sem selo e sem mensagem de erro na tela.

### ETAPA 8 — Painel de retiradas (listagem)
**Status:** 🟡 listagem testada pelo usuário como ADMIN em 2026-09-10. **Não testado na tela: cenário 9 (VISUALIZADOR vê o painel sem botões)** — o banco local só tem usuário ADMIN; o bloqueio no servidor está provado pelos cenários 9 e 18 da 7.1. Decisão confirmada pelo usuário: todos os perfis veem o painel e o selo.

`WithdrawalRequestsModal.tsx` — cabeçalho, filtros, estados de lista, linha por solicitação, expansão dos itens, badge "Atrasada" (5.9, itens 1 a 4 e 7 a 8) — e o botão no `AdminPanel.tsx` (5.10), com o `onRefresh` finalmente desestruturado.

Sem as ações ainda: primeiro o perito consegue **ver** as demandas, que é a metade do pedido do usuário que não mexe em dado nenhum.

**Pronto quando:** cenário 9 da Parte 7.3 passando, testado **com os três perfis** (ADMIN, PERITO, VISUALIZADOR).

### ETAPA 8b — Ações do painel, incluindo o registro da retirada ⚠️
**Status:** ✅ testado pelo usuário em 2026-09-10 — cenários 14, 15 e 16 da 7.3 (retirada parcial pelo diálogo, faixa vermelha sem recarregar, contador acompanhando as caixinhas). Frase orientativa acrescentada acima dos botões ("Só parte dos materiais saiu? Clique em 'Registrar retirada' e desmarque o que ficou."), porque o usuário tentou selecionar os itens direto na lista. Não testado na tela: 10 (cancelar / não compareceu — provado no backend pelos cenários 10 e 11), 17 (correção pela edição) e 18 (duas abas — 409 provado pelo cenário 23).

Os três botões e o diálogo de "Registrar retirada" com checkbox por item (5.9, itens 5 e 6).

**Pronto quando:** cenários 10, 14, 15, 16 e 17 da Parte 7.3 passando. O **cenário 15 (retirada parcial)** é o que prova a Parte 2.10 — é o mais importante desta etapa e o mais fácil de deixar para depois. Não deixe.

### ETAPA 9 — Verificação ponta a ponta
**Status:** ✅ em 2026-09-10 — 7.1, 7.2, 7.2b e 7.4 ✅ (roteiro automatizado, nenhum 500); README ✅. 7.3: cenários 1, 2, 5, 7, 8, 14, 15, 16 e 19–23 (regra das 24h como PERITO e ADMIN) testados pelo usuário. Ficaram sem teste de tela: 6, 9, 10, 12, 13, 17, 18 e 24 — todos com a regra correspondente provada no backend, exceto 6, 12 e 13, que são só de interface.

Executar a **Parte 7 inteira**, incluindo o type-check dos dois lados e a atualização do README (5.11).

**Não marque nada como concluído sem rodar os testes** — o CLAUDE.md tem a skill `verification-before-completion` justamente para isso.

**Pronto quando:** as três subseções da Parte 7 completas, com o resultado real de cada uma anotado aqui neste documento.

### ETAPA 10 — Commit e implantação
**Status:** ⬜ não iniciada — aguardando o pedido de commit do usuário.

Só depois da ETAPA 9 passar por completo. Ver Parte 8. **Commit e push só com pedido explícito do usuário.**

---

## Parte 7 — Roteiro de testes

### 7.0 Obter um token para os testes de API

Use a ferramenta **Bash** (armadilha A4). Faça três logins, um por perfil, e guarde os tokens:

```bash
API=http://localhost:3000

TOKEN_ADMIN=$(curl -s -X POST "$API/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"<admin@exemplo>","password":"<senha>"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')

echo "${TOKEN_ADMIN:0:20}..."   # confirme que veio token, não vazio
```

Repita para `TOKEN_PERITO` e `TOKEN_VISUALIZADOR`. Se não houver usuários desses perfis no banco local, crie-os pela tela de Gerenciar Usuários (ou `npm run bootstrap:admin` para o primeiro admin).

Pegue também dois UUIDs de vestígio válidos:

```sql
SELECT id, material, registro_fav FROM vestiges WHERE deleted_at IS NULL LIMIT 2;
```

### 7.1 Backend (curl)

| # | Cenário | Esperado |
|---|---|---|
| 1 | POST válido, 1 item | **201**, solicitação com 1 item, `items[0].id` **string** |
| 2 | POST válido, 12 itens em lote | **201**, **uma** solicitação com 12 itens |
| 3 | POST com `items: []` | **400** com `message` legível |
| 4 | POST com `vestigeId` inexistente | **400** citando o id; **nada gravado** (confirme no banco) |
| 5 | POST com `reason: "OUTROS"` sem `reasonDetail` | **400** |
| 6 | POST com `reasonDetail` de 300 caracteres | **400** |
| 7 | POST com o mesmo `vestigeId` duas vezes | **400** |
| 8 | POST sem JWT | **401** |
| 9 | PATCH status com `TOKEN_VISUALIZADOR` | **403** |
| 10 | PATCH `SOLICITADA` → `CANCELADA` com `TOKEN_PERITO` | **200**; `destinacao` dos vestígios **inalterada** |
| 11 | PATCH de novo na já cancelada | **409** com mensagem explicando que é terminal |
| 12 | POST `/calendar-opened` duas vezes | **204** nas duas; `calendar_opened_at` mantém o **primeiro** instante |
| 14 | POST com `reason: "Destruição"` (o **rótulo** em vez do código) | **400** — prova que o backend só aceita código, nunca o texto da tela (3.3) |
| 15 | GET `/open-items` sem JWT | **401** |
| 16 | POST com 201 itens | **400** (teto de `MAX_ITEMS_PER_REQUEST`) |
| 17 | PATCH status com `status: "CONCLUIDA"` | **400** orientando a usar "Registrar retirada" (4.6) |

**Regra das 24h e a exceção do ADMIN (item 5 da 4.2 — Parte 2.11):**

| # | Cenário | Esperado |
|---|---|---|
| 13a | POST daqui a 2h com `TOKEN_PERITO` | **400** com a frase de bloqueio; **nada gravado** |
| 13b | POST daqui a 2h com `TOKEN_VISUALIZADOR` | **400** idem |
| 13c | POST daqui a 2h com `TOKEN_ADMIN`, **sem** `deadlineOverrideReason` | **400** pedindo a justificativa |
| 13d | POST daqui a 2h com `TOKEN_ADMIN` **com** justificativa | **201**; coluna `deadline_override_reason` **preenchida** |
| 13e | POST com `scheduledFor` **no passado**, `TOKEN_ADMIN` sem justificativa | **400** — cai na mesma regra, sem precisar de validação própria |
| 13f | POST daqui a **25h** com `TOKEN_PERITO` | **201** — dentro do prazo, sem exceção |
| 13g | POST daqui a **25h** com justificativa enviada assim mesmo | **201**; coluna `deadline_override_reason` fica **NULL** (justificativa ignorada — senão a coluna vira lixo) |
| 13h | POST daqui a **23h58** com `TOKEN_PERITO` | **201** — a folga de 5 min do relógio funcionando |

**Registro da retirada — `POST /:id/complete` (rota 4.8):**

| # | Cenário | Esperado |
|---|---|---|
| 18 | `/complete` com `TOKEN_VISUALIZADOR` | **403**; **nada** movimentado |
| 19 | `/complete` com **todos** os ids, `TOKEN_PERITO` | **200**; todos os vestígios em `RETIRADO`; 1 log de destinação por item; solicitação `CONCLUIDA` |
| 20 | **`/complete` parcial** — 8 de 12 ids | **200**; os 8 em `RETIRADO`, **os 4 restantes ainda em `NAO_INICIADO`**; `statusNote` contendo `Retirada parcial: 8 de 12 itens.` |
| 21 | 🔒 `/complete` com um `vestigeId` que **não** pertence à solicitação | **400**; **nada** movimentado — nem os ids válidos do mesmo pedido |
| 22 | `/complete` com `withdrawnVestigeIds: []` | **400** orientando a usar "Não compareceu" |
| 23 | `/complete` de novo na já concluída | **409**; **nenhum** vestígio tocado pela segunda chamada |
| 24 | `/complete` num item cujo vestígio **já estava `RETIRADO`** | **200**; **sem** log de destinação novo para ele (não houve transição) |

**Nenhum cenário pode responder 500.** Um 500 no lugar de 400 é sinal de que o `.parse()` vazou (T-02); um 500 no lugar de 201 é sinal de BigInt não serializado (T-01).

> **O cenário 21 é o teste de segurança desta feature.** Ele prova que a rota não pode ser usada para marcar como retirado um vestígio qualquer do sistema. Rode-o com um uuid de vestígio real que **não** esteja na solicitação, e depois confirme no banco que a `destinacao` dele continua intacta.

Exemplo do cenário 1:

```bash
curl -s -o /tmp/out.json -w '%{http_code}\n' -X POST "$API/api/withdrawal-requests" \
  -H "Authorization: Bearer $TOKEN_PERITO" -H 'Content-Type: application/json' \
  -d '{"scheduledFor":"2026-08-30T17:00:00.000Z","notes":"teste","items":[{"vestigeId":"<uuid>","reason":"DESTRUICAO"}]}'
cat /tmp/out.json
```

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

A segunda query é **obrigatória**: como visto na Parte 0.8, falha de gravação de auditoria é silenciosa por decisão de projeto — a tela funciona normalmente mesmo sem o log ter sido gravado. Sem olhar a tabela, você não sabe se a auditoria funcionou.

Esperado ao fim da Parte 7.1: `WITHDRAWAL_REQUESTED`, `WITHDRAWAL_STATUS_CHANGED`, `WITHDRAWAL_CALENDAR_OPENED` e `WITHDRAWAL_COMPLETED` presentes, com `user_name` correto em cada um.

**A consulta que justifica a coluna própria** (Parte 2.11) — depois dos cenários 13d e 13g:

```sql
SELECT wr.id, wr.scheduled_for, wr.requested_at,
       u.name AS autorizou, u.role,
       wr.deadline_override_reason
FROM withdrawal_requests wr
JOIN users u ON u.id = wr.requested_by
WHERE wr.deadline_override_reason IS NOT NULL
ORDER BY wr.requested_at DESC;
-- Esperado: SÓ o cenário 13d. O 13g (justificativa enviada num agendamento
-- normal) NÃO pode aparecer aqui — se aparecer, a coluna virou lixo.
-- E `role` tem que ser ADMIN em toda linha, sempre.
```

Confirmar que **agendar** não escreveu nada em `Vestige` (Parte 2.3) — rode **antes** de qualquer `/complete`:

```sql
SELECT v.id, v.destinacao, v.destinacao_changed_at
FROM vestiges v
JOIN withdrawal_request_items wri ON wri.vestige_id = v.id
ORDER BY v.destinacao_changed_at DESC NULLS LAST LIMIT 10;
-- destinacao deve continuar NAO_INICIADO nos itens apenas AGENDADOS
```

### 7.2b Banco — a verificação do registro de retirada (a mais importante do plano)

Rodar **depois do cenário 20** (retirada parcial de 8 de 12). Esta é a única parte do sistema que altera dado de vestígio; se algo aqui sair errado, sai errado em registro de cadeia de custódia.

```sql
-- 1) O corte tem que ser exato: 8 fora, 4 dentro. Nem 9, nem 7.
SELECT v.destinacao, COUNT(*) AS qtd
FROM vestiges v
JOIN withdrawal_request_items wri ON wri.vestige_id = v.id
WHERE wri.request_id = '<request-uuid>'
GROUP BY v.destinacao;
-- esperado: RETIRADO = 8 · NAO_INICIADO = 4

-- 2) Um log de destinação por item movimentado, com o autor certo e o de-para certo.
SELECT vdl.vestige_id, vdl.from_status, vdl.to_status, u.name AS autor, vdl.observation, vdl.changed_at
FROM vestige_destination_logs vdl
JOIN users u ON u.id = vdl.changed_by
WHERE vdl.observation LIKE '%<request-uuid>%'
ORDER BY vdl.changed_at DESC;
-- esperado: 8 linhas, from NAO_INICIADO → to RETIRADO, autor = o perito do teste

-- 3) A solicitação registrou a parcialidade por escrito.
SELECT status, status_note, status_changed_at, (SELECT name FROM users WHERE id = status_changed_by) AS por
FROM withdrawal_requests WHERE id = '<request-uuid>';
-- esperado: CONCLUIDA · status_note contendo "Retirada parcial: 8 de 12 itens."

-- 4) A auditoria guardou os dois lados: o que saiu e o que ficou.
SELECT action, user_name, details, created_at
FROM audit_logs WHERE action = 'WITHDRAWAL_COMPLETED' ORDER BY created_at DESC LIMIT 1;
-- esperado: details com withdrawnCount = 8, partial = true, e notWithdrawnVestigeIds com 4 ids

-- 5) Nenhum vestígio de fora da solicitação foi tocado (fecha o cenário 21).
SELECT COUNT(*) FROM vestige_destination_logs
WHERE changed_at > NOW() - INTERVAL '10 minutes'
  AND vestige_id NOT IN (SELECT vestige_id FROM withdrawal_request_items WHERE request_id = '<request-uuid>');
-- esperado: 0
```

### 7.3 Interface

1. Agendar individual pelo card → confirmar → **fechar o modal sem abrir o Google** → abrir "Retiradas Agendadas" e ver que a solicitação está lá. *(É o cenário que hoje perde tudo.)*
2. Agendar em lote com 3 itens e motivos diferentes → conferir os 3 motivos no registro.
2b. **Em nenhuma tela e em nenhum e-mail o usuário pode ver um código.** Percorra modal de sucesso, tela de gestão e corpo do evento do Google procurando por `ANALISE_INVESTIGACAO` ou similar: se aparecer, faltou um `getWithdrawalReasonLabel` (3.3).
3. **Com bloqueador de popup ativo**, clicar em "Abrir no Google Agenda" → a aba precisa abrir. *(Com a âncora da 5.4 isto deve passar trivialmente; teste mesmo assim.)*
4. Conferir no evento do Google que data, hora e fuso batem com o solicitado.
5. **Derrubar o backend** (`Ctrl+C` no server) e tentar confirmar → erro visível no modal, **nenhuma aba do Google aberta**, o formulário preservado para nova tentativa.
6. Duplo clique rápido em "Confirmar Solicitação" → **uma** solicitação criada, não duas.
7. Vestígio com solicitação em aberto → **selo âmbar** no card, **sem** faixa vermelha.
8. Agendar duas vezes o mesmo vestígio → aviso amarelo, mas **permite**.
9. Login como VISUALIZADOR: consegue criar solicitação; abre "Retiradas Agendadas" e **vê** as demandas; **não** vê nenhum dos três botões de ação.
10. **Cancelar** uma solicitação como PERITO → a `destinacao` dos vestígios **não** muda e o card **não** ganha faixa vermelha (Parte 2.3 e 4.6). Idem para "Não compareceu".
11. Lote com mais de 20 itens → o evento do Google abre normalmente e traz a linha "... e mais N item(ns)"; a solicitação no EvidenceOS tem **todos** os itens.
12. Solicitação com `scheduledFor` no passado e status `SOLICITADA` → badge **"Atrasada"** na tela de gestão.
13. Com `/open-items` derrubada de propósito → a busca de vestígios continua funcionando, sem selo e **sem mensagem de erro** na tela.

**O fluxo que o usuário descreveu, ponta a ponta** — estes cinco são a razão de existir do painel:

14. **O ciclo completo.** Agendar 3 itens como VISUALIZADOR → entrar como PERITO → abrir "Retiradas Agendadas" → achar a demanda com solicitante, dia, hora e os 3 materiais → **"Registrar retirada"** com tudo marcado → confirmar. Fechar o modal e conferir, **sem recarregar a página**, que os 3 cards agora têm a **faixa vermelha "Material não se encontra a URC"** e que o **selo âmbar sumiu**. *(É a demonstração de que o `onDataChanged` está ligado — 5.9.)*
15. ⭐ **Retirada parcial.** Solicitação de 4 itens → desmarcar 1 → confirmar. Os 3 marcados ficam vermelhos; **o desmarcado continua sem faixa nenhuma e some do painel de agendadas junto com a solicitação concluída**. Reabrir o painel no filtro "Concluída" e ver a observação `Retirada parcial: 3 de 4 itens.`
16. **O aviso é honesto.** No diálogo de registrar retirada, o número no aviso âmbar tem que acompanhar as caixinhas: desmarcou uma, o aviso passa a dizer um a menos. Desmarcar todas **desabilita** o botão e mostra a dica do "Não compareceu".
17. **Correção de erro.** Marcar um item por engano → ir na tela de edição do vestígio → voltar a `destinacao` para "Na URC" → conferir em "Histórico de destinação" que ficaram registradas **as duas** transições, com autor e horário. *(Prova que erro se retifica, não se apaga.)*
18. **Duas abas.** Abrir o painel em duas abas, registrar a retirada numa → na outra, tentar registrar de novo → mensagem clara vinda do backend (409) e a lista se recarrega sozinha, sem movimentar nada duas vezes.

**A regra das 24h e a exceção do ADMIN (Parte 2.11):**

19. **Como PERITO**, escolher data para daqui a 2h → erro **vermelho**, bloqueio, **nenhum** campo de justificativa à vista. O seletor de data nem deve oferecer hoje (`min` = amanhã).
20. **Como ADMIN**, escolher a mesma data → **nada de vermelho**: aparece o aviso **âmbar** e o campo "Justificativa da urgência". O seletor de data oferece hoje.
21. **O aviso reage à data, não ao envio.** Ainda como ADMIN, mudar a data para daqui a 3 dias → o aviso âmbar e o campo **somem**; voltar para hoje → **reaparecem**. Sem precisar clicar em confirmar.
22. **Como ADMIN**, deixar a justificativa em branco e tentar confirmar → erro pedindo o motivo; **nada gravado**.
23. **Como ADMIN**, preencher a justificativa e confirmar → **201**. Abrir o painel e ver a solicitação com o badge 🔶 **"Urgência — fora do prazo de 24h"**, e a justificativa ao expandir.
24. **A exceção não vaza para agendamento normal.** Como ADMIN, agendar para daqui a 3 dias → a solicitação **não** pode ganhar o badge de urgência no painel.

### 7.4 Type-check

```bash
cd client && npx tsc --noEmit
cd ../server && npx tsc --noEmit
```

Ambos precisam sair limpos — era o baseline (Parte 0.3).

---

## Parte 8 — Implantação

Mudança **full-stack**: `server/` **e** `client/`, com migration nova.

| Serviço | Ação | Detalhe |
|---|---|---|
| **api** | **Implantar + rodar a migration à mão** | Após o build, no console do serviço `api`: `cd /app && npx prisma@7.7.0 migrate deploy`. **O deploy não roda migrations sozinho.** O cwd precisa ser o diretório onde está o `prisma.config.ts` — é ele que fornece a `DATABASE_URL`, porque o bloco `datasource` do schema não tem `url` (armadilha A3). Fixar a versão `@7.7.0` é obrigatório: sem isso o `npx` baixa a RC 8 (armadilha A2). |
| **web** | **Implantar** | Depois do build, **`Ctrl+Shift+R`** no navegador — o nginx serve estático com cache e um F5 comum entrega o bundle antigo. |
| **db** | **Nenhuma ação** | Não rodar a migration aqui via `psql`: o Prisma não registraria como aplicada em `_prisma_migrations` e quebraria a próxima. |

**Ordem obrigatória:** `api` (com a migration) **antes** do `web`. Se o `web` novo subir primeiro, ele chama rotas que ainda não existem e o modal quebra em produção com o usuário na frente.

**Confirmação pós-deploy** (não confiar em "o botão funcionou"):

1. Criar uma solicitação real de teste.
2. Conferir em **Logs de Auditoria** que o `WITHDRAWAL_REQUESTED` apareceu — se a tabela não tivesse sido criada, a tela funcionaria igual e o registro simplesmente não existiria (Parte 0.8).
3. Abrir "Retiradas Agendadas" e ver a solicitação listada.
4. Conferir o selo âmbar no card do vestígio.

**Rollback.** A migration é puramente aditiva: nenhuma tabela ou coluna existente é tocada. Reverter = reimplantar a versão anterior do `api` e do `web`. As duas tabelas novas ficam órfãs no banco, sem efeito nenhum sobre o sistema antigo. **Não** rode `DROP TABLE` para "limpar": se houver qualquer solicitação já gravada, isso apaga registro de cadeia de custódia.

---

## Parte 9 — Fora de escopo (fases futuras)

### ~~Fase 3 — Acoplar conclusão à `destinacao`~~ → ✅ **ENTROU NO ESCOPO em 2026-08-25**
Pedida explicitamente pelo usuário. Deixou de ser fase futura: virou a rota **4.8**, a tela **5.9 itens 5-6** e as etapas **4b** e **8b**. O guarda-corpo que o gate protegia foi mantido inteiro — comando explícito, item a item, sempre auditado (Partes 2.9 e 2.10).

### Fase 4 — Encadear com "Movimentar FAV" *(agora o próximo passo natural)*
Na tela de retiradas, botão que abre direto a movimentação no PCNET para cada FAV, reaproveitando `buildPcnetUrl` e `logPcnetAction` (`dataService.ts:154-179`).

Com a Fase 3 dentro do escopo, isto ficou mais óbvio do que era: o perito já vai estar no painel, com a pessoa na frente, tendo acabado de marcar o que saiu — e o **ato oficial** ainda precisa ser feito na FAV do PCNET. O painel é o lugar exato para esse botão. **Continua fora do escopo deste plano**, mas é a primeira coisa a considerar depois dele.

### Fase 5 — Agenda oficial da unidade
Hoje o evento nasce na conta Google de quem clicou (Parte 1.3, item 4). Gravar direto na agenda oficial exigiria OAuth com a conta da URC e é um projeto próprio, com implicações de credencial que este plano não cobre.

### Não fazer
- **Notificação por e-mail da solicitação.** O `emailService.ts` existe e seria fácil, mas ninguém pediu.
- **Aprovação/workflow de duas etapas** (solicita → chefia aprova). Não foi pedido e mudaria o modelo de status inteiro.
- **Reabrir solicitação terminal.** Contraria a 2.6 e o 409 da 4.6.
- **Instalar framework de teste** (armadilha A6).
- **Refatorar o `AuditLogModal` para a paleta nova.** Tentador ao ver o `slate` isolado, mas é escopo alheio.

---

## Parte 10 — Resumo de Impacto de Segurança e Auditoria

> Exigido pelo CLAUDE.md antes de qualquer implementação em lógica crítica. **Os dois gates já foram aprovados pelo usuário em 2026-08-25** — esta seção fica como o registro do impacto que foi avaliado, e deve ser relida (e atualizada) se o escopo mudar de novo.

### 10.1 Superfície nova

| Vetor | Avaliação |
|---|---|
| **Autenticação** | Todas as 7 rotas ficam sob `addHook('onRequest', jwtVerify)`, igual às demais. Nenhuma rota pública nova. |
| **Autorização** | Criar/ler: qualquer autenticado (decisão de negócio, README linha 97). Mudar status **e registrar retirada**: ADMIN/PERITO via `requireEditorAccess`, **checado no servidor** — esconder o botão no front nunca é controle de acesso. |
| **Escalada de privilégio** | **Nenhuma.** A `/complete` (4.8) permite a ADMIN/PERITO exatamente o que eles **já podem** fazer hoje pelo `PUT /api/vestiges/:id`: mudar a `destinacao`. Muda o caminho e o contexto, não o poder. |
| **Regra de negócio contornável** | **Corrigida.** A regra das 24h sai do navegador e passa a valer no servidor (2.11). Hoje ela é burlável mudando o relógio da máquina ou chamando a API direto — depois, não. A exceção é **exclusiva do ADMIN**, exige justificativa e fica gravada em coluna própria. O front decide se **mostra** o caminho da exceção; quem **decide** é o servidor. |
| **IDOR / alteração de alvo indevido** | 🔒 **Único ponto real da feature, e tem defesa própria.** A `/complete` recebe uma lista de `vestigeId` no corpo. Sem a checagem de subconjunto (4.8, item 3), um PERITO poderia marcar como retirado **qualquer vestígio do sistema** passando um uuid arbitrário. A validação é obrigatória e tem teste dedicado (cenário 21). Fora isso, o sistema não segrega vestígios por usuário — todo perfil já lê tudo (Parte 4.5). |
| **Atomicidade** | A `/complete` roda em `$transaction` única. Falha no meio = nada aplicado. O estado "solicitação concluída mas vestígios ainda na URC" (ou o inverso) não é alcançável. |
| **Injeção SQL** | Nenhuma query crua. Tudo por Prisma parametrizado. |
| **XSS** | `notes`, `reasonDetail` e nomes são renderizados como texto pelo React, que escapa por padrão. **Não usar `dangerouslySetInnerHTML` em nenhum ponto desta feature.** |
| **XSS via URL do Google** | A base é uma constante; todo conteúdo variável passa por `encodeURIComponent` (comportamento atual, preservado). Não há como injetar esquema `javascript:`. |
| **CSRF** | O access token vai no header `Authorization`, não em cookie — requisição cross-site não o carrega sozinha. O cookie de refresh é `httpOnly` + `sameSite: 'lax'` + `path: /api/auth` (`authRoutes.ts:16-21`), fora do alcance de fetch cross-site. |
| **Mass assignment** | Schemas Zod explícitos, campo a campo. **Nunca** espalhar `request.body` no `data` do Prisma. |
| **Segredos** | Nenhum segredo novo. Nenhuma credencial no front. |
| **DoS acidental** | `items` limitado a 200; `limit` da listagem com teto de 200; `/open-items` devolve payload mínimo. |

### 10.2 Impacto na cadeia de custódia

- **A migration é aditiva.** Nenhuma coluna ou tabela existente é alterada, nenhum dado histórico é reescrito.
- **`Vestige` só muda num lugar, e é o lugar certo.** Agendar não toca em vestígio nenhum (2.3). A `destinacao` só se move pela `/complete` (4.8), por comando explícito de um perito que está presenciando a entrega (2.9), item a item (2.10).
- **A escrita reaproveita o mecanismo de auditoria que já existe.** `VestigeDestinationLog` grava de-para, autor, timestamp e observação — a mesma tabela que a tela de edição usa (`vestigeRoutes.ts:369-382`). O histórico de destinação do vestígio continua **um só**, contínuo, sem trilha paralela.
- **Trilha nova, mais completa do que hoje:** quatro ações auditadas (`WITHDRAWAL_REQUESTED`, `WITHDRAWAL_STATUS_CHANGED`, `WITHDRAWAL_CALENDAR_OPENED`, `WITHDRAWAL_COMPLETED`), cada uma com usuário, timestamp e detalhes, além dos campos `requestedBy/At` e `statusChangedBy/At` na própria tabela.
- **O que NÃO saiu também fica registrado.** Numa retirada parcial, a auditoria guarda `notWithdrawnVestigeIds` e a `statusNote` diz "8 de 12". Essa é a informação que some em quase todo sistema e que alguém vai procurar um ano depois.
- **Registro imutável na prática:** sem exclusão (2.6), sem reabertura de status terminal (4.6), sem edição de itens após a criação.
- **A exceção ao prazo deixa de ser invisível.** Hoje, uma retirada urgente simplesmente não é agendada no sistema — combina-se por fora e não fica registro nenhum. Depois, ela entra pelo sistema, só por ADMIN, com justificativa escrita, coluna consultável e destaque no painel de quem vai receber a pessoa.
- **Erro se retifica, não se apaga.** Marcou errado? A correção é pela tela de edição do vestígio, que grava **outra** linha no histórico de destinação. As duas transições ficam visíveis — o engano e o conserto.
- **Honestidade preservada:** `calendarOpenedAt` significa "a aba foi aberta", nunca "o evento foi salvo" — a mesma limitação já documentada no `PcnetActionLog`. E o EvidenceOS continua **não** afirmando nada sobre o PCNET: o ato oficial segue sendo a FAV.
- **Saldo líquido:** hoje uma retirada agendada não deixa rastro nenhum, e um vestígio que sai da URC só muda de estado se alguém lembrar de editar o cadastro à mão. Depois, o agendamento fica registrado e a saída é marcada no mesmo gesto em que acontece, por quem presenciou. **A feature aumenta a rastreabilidade em dois pontos; não a reduz em nenhum.**

### 10.3 Achados pré-existentes — fora do escopo, registrados para decisão futura

Encontrados durante a revisão. **Nenhum é introduzido por este plano** e nenhum deve ser corrigido dentro dele sem pedido explícito do usuário.

1. **CORS reflexivo com credenciais** — `server/src/server.ts:20-27` usa `origin: true` + `credentials: true`, o que reflete qualquer origem. **Risco real hoje: baixo**, porque o cookie de refresh é `sameSite: 'lax'` e não viaja em fetch cross-site, e o access token fica em `localStorage` (não é enviado automaticamente). Endurecer para uma allowlist de origens seria higiene, não emergência.
2. **Access token em `localStorage`** — `apiClient.ts:1-5`. Qualquer XSS o exfiltra. Mitigação real é não ter XSS; a alternativa (token só em memória) custa re-login a cada refresh de página.
3. **Sem rate limit no login** — `POST /api/auth/login` não tem throttling. Há auditoria de `LOGIN_FAILED`, mas nada barra tentativas repetidas.

---

## Parte 11 — Armadilhas verificadas e modos de falha

> As três primeiras foram **reproduzidas em execução** durante a revisão de 2026-08-25. Não são hipóteses.

| ID | Armadilha | Como se manifesta | Correção |
|---|---|---|---|
| **T-01** | **BigInt não serializa em JSON.** `WithdrawalRequestItem.id` é `BigInt`. | `POST /` responde **500 — "Do not know how to serialize a BigInt"**. O registro é gravado no banco, mas o front recebe erro. Pior modo de falha possível: dado gravado + usuário achando que falhou. | Serializador da Parte 4.0b, com `String(it.id)`. Mesmo padrão de `auditRoutes.ts:5-8`. |
| **T-02** | **`ZodError` vira 500, não 400.** O `server.ts` não tem `setErrorHandler`. | Todos os cenários 3, 5, 6, 7 e 16 da Parte 7.1 respondem **500** com o JSON bruto do Zod no `message`. O usuário vê um despejo técnico ilegível. | `safeParse` + `reply.status(400).send({ message: z.prettifyError(err) })`, Parte 4.0a. |
| **T-03** | **`.catch` no lugar errado derruba a tela inteira.** | Pôr `listOpenWithdrawalItems()` cru no `Promise.all` do `loadData` faz uma falha da rota de retiradas rejeitar o `Promise.all`, cair no `catch` do `loadData` e **esvaziar a lista de vestígios**. Um selo decorativo derruba a função principal do sistema. | `.catch` na promise individual, **antes** de entrar no `Promise.all` — Parte 5.5. |
| **T-04** | **URL do Google estoura em lote grande.** | 50 itens = 14.425 chars; 200 itens = 56.875 chars. A aba abre em branco, trunca ou nem navega — sem erro nenhum no EvidenceOS. | Corte em 20 itens no corpo do evento, Parte 2.7 / 5.3. |
| **T-05** | **Perda de informação no evento do Google.** | Se a API devolver só `material`/`registroFav`/`municipio`, o evento perde `REQUISIÇÃO(ÕES)` e `INVÓLUCRO(S)`, que existem hoje. Regressão que ninguém percebe até alguém precisar do dado. | Incluir `requisicoes` e `involucros` (listas, só itens ativos) no `REQUEST_INCLUDE`, Parte 4.0b. |
| **T-06** | **Selo some em silêncio a partir da 201ª solicitação aberta.** | Se o selo for alimentado por `GET /` (teto de 200 por página), cards param de mostrar o selo sem erro nenhum. | Rota dedicada `/open-items` sem paginação, Parte 4.4. |
| **T-07** | **Solicitação gravada e tela sem reagir.** | Sem o `onCreated`, o usuário grava, fecha o modal e não vê mudança nenhuma — conclui que não funcionou e agenda de novo. | Prop `onCreated` encadeada nos **dois** pontos de renderização, Partes 2.8 / 5.4 / 5.8. |
| **T-08** | **Corrida entre dois operadores mudando status.** | `findUnique` + `update` deixa o segundo sobrescrever o primeiro, e o `statusChangedBy` registra a pessoa errada. | `updateMany` com `where: { id, status: 'SOLICITADA' }`, Parte 4.6. |
| **T-09** | **Duplo clique cria duas solicitações.** | Cadeia de custódia com registro fantasma. | `disabled={submitting}`, Parte 5.4. |
| **T-11** | **`/complete` sem a checagem de subconjunto.** | Um PERITO consegue marcar como retirado **qualquer vestígio do sistema**, mandando um uuid arbitrário no corpo. Não aparece em teste nenhum de caso feliz. | Validar que todo id enviado pertence à solicitação, **antes** da transação — 4.8 item 3, cenário 21. |
| **T-12** | **Concluir a solicitação inteira quando a retirada foi parcial.** | Vestígios que continuam na prateleira passam a constar como fora da URC. Mentira gravada em registro de custódia, e ninguém percebe até alguém procurar o material. | Checkbox por item, com o backend recebendo só o que saiu — Partes 2.10 e 4.8. |
| **T-13** | **Movimentar vestígio fora de transação.** | Falha no meio deixa metade dos vestígios como `RETIRADO` e a solicitação ainda `SOLICITADA`. Ao repetir a operação, os já movimentados não geram log (a 4.8 os ignora) — e o registro fica permanentemente incompleto. | `prisma.$transaction` envolvendo status + todos os vestígios — 4.8. |
| **T-14** | **Sobrescrever `destinacaoObs` ao registrar a retirada.** | Apaga em silêncio a observação que um operador digitou antes, e que aparece em itálico no card (`VestigeCard.tsx:238-242`). | Não escrever nesse campo. O contexto vai no `observation` do log de destinação — 4.8. |
| **T-15** | **`min` do input de data fixado em "amanhã".** | Mata a exceção das 24h pela porta dos fundos: o ADMIN não consegue nem *escolher* hoje, e nenhum erro aparece — parece que a funcionalidade não existe. | `min` = amanhã para PERITO/VISUALIZADOR, **hoje** para ADMIN — Parte 5.4, fase 1a. |
| **T-16** | **Gravar a justificativa sempre que ela vier no corpo.** | A coluna `deadline_override_reason` enche de texto de agendamento normal, e a consulta "quem furou o prazo" para de significar alguma coisa. | Gravar **só** quando a exceção de fato se aplicou (`overrideAplicado`) — 4.2 item 5, cenário 13g. |
| **T-17** | **`user!.role` no `ScheduleModal`.** | O `VestigeCard` declara `user?: User` (`:15`), então pode chegar indefinido. Estoura em runtime, na produção, no card. | `const isAdmin = user?.role === 'ADMIN'` — na dúvida, não é admin. Parte 5.4. |
| **T-10** | **Fuso horário.** | ``new Date(`${date}T${time}`)`` é horário **local** (correto); `toISOString()` converte para UTC (correto); o banco guarda UTC. O erro clássico é "consertar" um dos dois e deslocar tudo em 3 horas. | Não mexa. Exiba sempre com `toLocaleString('pt-BR')`. |
| **T-18** | **Ler a requisição pela coluna antiga.** *(desde 2026-09-10)* | O Prisma ainda expõe `requisicaoLegado` (coluna `vestiges.requisicao`, congelada). Selecioná-la compila e funciona — mas mostra a requisição de antes de 2026-09-10 e **ignora as incluídas depois**, sem erro nenhum. | Usar sempre a relação `requisicoes`, Parte 0.4 e 4.0b. |
| **T-19** | **Listar invólucros/requisições sem filtrar `removedAt`.** *(desde 2026-09-10)* | Item removido pela tela (lançado por engano) reaparece no painel de retiradas e no e-mail do Google Agenda que a URC recebe. | `where: { removedAt: null }` em todo `select` dessas relações, Parte 4.0b. |
| **T-20** | **Migration nomeada com data anterior à última aplicada.** *(desde 2026-09-10)* | Criar a pasta `20260825_0001_...` (a data original do plano) a coloca antes de `20260910_0001_...`, já aplicada em produção — histórico desalinhado entre repositório e banco. | Data real do dia em que a migration for escrita, Parte 3.5. |

---

## Parte 12 — Log de Revisão (2026-08-25)

Revisão de engenharia sênior sobre o código real do repositório. O plano original estava **arquiteturalmente correto** — as decisões da Parte 2 se sustentam todas. As mudanças abaixo são de execução: coisas que quebrariam ou regrediriam na hora de codar.

| ID | O que mudou | Por quê |
|---|---|---|
| **R-01** | **Parte 0 nova** — mapa do repositório, versões, baseline de type-check, tabela de tradução de nomes, contrato de erro, payload do JWT, matriz de permissões. | O plano mandava "seguir o padrão de X" sem dizer qual é o padrão. Agora o executor não precisa explorar para começar. |
| **T-01 / R-01b** | **Serializador obrigatório** para BigInt e Date (4.0b). | Reproduzido: `{id: 1n}` numa resposta Fastify = **HTTP 500**. O plano mandava devolver "a solicitação criada, itens incluídos" — o que quebraria. |
| **T-02** | **`safeParse` + 400 explícito** (4.0a). | Reproduzido: `ZodError` sem `setErrorHandler` = **HTTP 500**. Todos os "400" da Parte 7.1 eram inalcançáveis do jeito que estava. |
| **T-03** | **`.catch` na promise individual** (5.5). | O texto do plano ("degrade em silêncio") estava certo; o esboço de código ("buscar junto do `Promise.all`") produziria o oposto. |
| **R-02** | **Âncora `<a target="_blank">` em vez de `window.open`** (2.4/5.4). | Elimina a classe inteira de bloqueio de popup, em vez de contorná-la. Mantém a arquitetura de duas fases, que é o que importa. |
| **R-04 / T-05** | **`requisicao` e `involucros` na resposta da API** (4.0b). *Em 2026-09-10 virou a lista `requisicoes` — ver R-35.* | Sem eles o evento do Google perde campos que existem hoje. |
| **R-05 / T-04** | **Corte de 20 itens no corpo do evento** (2.7). | Medido: 200 itens = 56.875 chars de URL. O registro guarda tudo; o evento resume. |
| **R-06 / T-07** | **Prop `onCreated`** encadeada nos dois pontos de renderização (2.8/5.4/5.8). | Sem ela, gravar não muda nada na tela. |
| **R-07 / T-06** | **Rota `/open-items`** dedicada (4.4). | Evita o selo sumir em silêncio no 201º registro e o payload pesado por selo. |
| **R-08** | **`updateMany` atômico** em status e calendar-opened (4.6/4.7). | Elimina TOCTOU entre dois operadores. |
| **R-09** | **Especificação de UI/UX detalhada** — rótulo do botão, estados de carregamento/erro/vazio, badge "Atrasada", regras de cor âmbar vs. vermelho, foco e `aria-live`, confirmação de ação irreversível, paleta zinc/âmbar. | O plano dizia "modal de gestão no padrão de AuditLogModal" e parava aí. |
| **R-10** | **Armadilhas A1-A6 do ambiente**, incluindo o `npx prisma` fora de `server/` baixando a **RC 8** e o `curl` do PowerShell. | Verificado na máquina. Custaria uma sessão de confusão. |
| **R-11** | **Parte 10 — Resumo de Impacto de Segurança e Auditoria** completo, com 3 achados pré-existentes registrados e explicitamente fora de escopo. | Exigência do CLAUDE.md que faltava no documento. |
| **R-12** | **"Pronto quando"** em cada etapa; testes 14-16 e 6, 11, 12, 13 acrescentados; comandos de obtenção de token; SQL de verificação da migration e de não-alteração da `destinacao`. | "Testar com curl" não é critério de conclusão. |
| **R-13** | **Rollback e ordem de deploy** explicitados na Parte 8, com a razão de fixar `prisma@7.7.0` e o cwd `/app`. | — |
| **R-14** | **README** entra no escopo (5.11). | A seção 3 do README descreve o fluxo que este plano substitui. |
| **R-03** | **`reason` passa a gravar CÓDIGO, não rótulo** (3.3) — decidido pelo usuário em 2026-08-25. Propagado para 3.2, 4.0d, 4.2, 5.2, 5.3, 5.4, 5.9, ETAPA 2 e testes 5, 14 e 2b. | Gravar rótulo contraria a convenção `{value, label}` do próprio projeto, órfã registros se a redação mudar, e torna o espelhamento de acentos um risco manual. Custo de mudar: zero em dados. |

### Complemento de 2026-08-25 (segunda conversa) — o painel de demandas

Pedido do usuário: *"Queria que os usuários com perfil de Perito e Adm pudessem ver em um painel as demandas (...). Ele ainda nesse painel pode dar um comando quando os materiais fossem retirados e movimentaria automaticamente o vestígio no banco de dados aparecendo a mensagem em vermelho de que o vestígio não se encontra mais na URC."*

| ID | O que mudou | Por quê |
|---|---|---|
| **R-15** | 🚦 **GATE 2 liberado.** A mudança de `destinacao` na conclusão saiu da Parte 9 (fases futuras) e virou escopo: rota **4.8**, tela **5.9 itens 5-6**, etapas **4b** e **8b**. | Pedido explícito do usuário. Os guarda-corpos do gate foram todos preservados. |
| **R-16** | **Parte 2.9 nova** — por que registrar a retirada **não** contradiz a Parte 2.1. | Sem isso, quem ler as duas seções acha que o plano se contradiz. A diferença: a 2.1 proíbe o sistema **adivinhar**; a 4.8 registra o que um perito **presenciou**. |
| **R-17** | **Parte 2.10 nova — retirada parcial é o caso normal.** Checkbox por item; desmarcados continuam na URC; `statusNote` automática registrando "8 de 12". | Conclusão tudo-ou-nada obrigaria o perito a mentir no registro ou não registrar nada. Ver T-12. |
| **R-18** | **`PATCH /:id/status` passa a recusar `CONCLUIDA` (400)** e nunca escreve em `Vestige`. Concluir só pela `/complete`. | Impede concluir sem dizer o que saiu — o registro incompleto que a 2.10 existe para evitar. |
| **R-19** | 🔒 **Checagem de subconjunto na `/complete`** (4.8 item 3) + cenário 21 dedicado. | Única brecha real de autorização da feature: sem ela, dá para movimentar qualquer vestígio do sistema. Ver T-11. |
| **R-20** | **Transação única** cobrindo status + todos os vestígios + logs de destinação. | Ver T-13. |
| **R-21** | **`onDataChanged` reaproveitando o `onRefresh` morto** — `AdminPanel.tsx:23` declara a prop, `Dashboard.tsx:161` já a passa, e o componente nunca a desestruturou. | A faixa vermelha aparece nos cards sem recarregar a página, sem encanamento novo. |
| **R-22** | **Botão chamado "Registrar retirada"**, não "Concluir"; aviso âmbar com o número de materiais; botão desabilitado se desmarcar tudo. | "Concluir" não avisa ninguém de que doze vestígios vão sair da URC no banco. |
| **R-23** | **Parte 7.2b nova** (5 consultas SQL) e **cenários 18-24** no backend, **14-18** na interface. Cenário 10 da UI **corrigido** — dizia para conferir que a `destinacao` não muda ao concluir, o que virou o oposto. | Era o teste que passaria a afirmar o contrário do comportamento novo. |
| **R-24** | **VISUALIZADOR continua vendo o painel** (sem os botões), com o motivo escrito e a instrução de como esconder se o usuário preferir. | Ele é quem cria a solicitação; sem ver, não confere que foi registrada. Divergência pequena em relação à literalidade do pedido, sinalizada de propósito. |
| **R-25** | **Fase 4 (Movimentar FAV pelo painel)** promovida a "próximo passo natural", ainda fora de escopo. | Com a Fase 3 dentro, o painel virou o lugar óbvio para o link do ato oficial no PCNET. |

### Complemento de 2026-08-25 (terceira conversa) — GATE 1 resolvido

Decisão do usuário: a regra das 24h **passa a valer no servidor**, com exceção **exclusiva do ADMIN** mediante justificativa.

| ID | O que mudou | Por quê |
|---|---|---|
| **R-26** | ✅ **GATE 1 liberado.** Validação das 24h no servidor (4.2 item 5), com folga de 5 min de relógio. | A regra só existia no navegador, ou seja, não era regra: bastava mudar o relógio da máquina. |
| **R-27** | **Exceção só para ADMIN, com justificativa obrigatória.** PERITO e VISUALIZADOR levam 400, sem campo de escape. **Parte 2.11 nova** com o raciocínio. | Bloqueio absoluto empurraria a retirada urgente para fora do sistema — e o caso excepcional é justamente o que mais merece registro. |
| **R-28** | **Coluna própria `deadline_override_reason`** no model e na migration, em vez de enfiar no `notes`. | "Quais retiradas furaram o prazo neste semestre e por quê" precisa ser consulta, não leitura de texto livre. Consulta pronta na 7.2. |
| **R-29** | **Justificativa gravada só quando a exceção se aplicou** (`overrideAplicado`), nunca só porque veio no corpo. Cenário 13g existe para provar. | Senão a coluna vira lixo e a consulta acima perde o sentido. Ver T-16. |
| **R-30** | **Data no passado deixou de precisar de regra própria** — é menor que `agora + 24h` e cai na mesma validação. | Uma regra a menos para manter. |
| **R-31** | **Fase 1a nova na 5.4**: aviso **âmbar** (não vermelho) + campo de justificativa que aparece e some conforme a data muda, só para ADMIN. `user` vira prop do modal, com default seguro. | Erro vermelho é para quem está barrado; o ADMIN não está barrado, está pagando pedágio. E ele precisa saber que entrou na exceção antes de preencher o resto. |
| **R-32** | **`min` do input de data passa a depender do perfil** — amanhã para PERITO/VISUALIZADOR, hoje para ADMIN. | O defeito da 1.4 mandava fixar em amanhã, o que mataria a exceção em silêncio. Ver T-15. |
| **R-33** | **Badge 🔶 "Urgência — fora do prazo de 24h"** no painel, com a justificativa ao expandir. | O perito que vai receber a pessoa precisa saber que aquela retirada entrou por exceção. É metade da razão de registrá-la. |
| **R-34** | **Cenários 13a-13h** (backend) e **19-24** (interface); consulta SQL das exceções na 7.2; verificação da coluna nova na 3.6. | — |

**Correções factuais pontuais:** `estaForaDaUrc` fica em `client/types.ts:164-166`, não em `VestigeCard.tsx`; as linhas dos botões de agendamento foram reconferidas (`VestigeCard.tsx:277-284`, `Dashboard.tsx:247-253`); `client/` não tem `src/`.

### Complemento de 2026-09-10 — realinhamento após as múltiplas requisições

**Nenhuma decisão de arquitetura mudou e nenhuma etapa foi iniciada** — o plano continua inteiro por executar. O que mudou foi o código em volta dele: o commit `9c8efb7` (múltiplas requisições por vestígio e motivo de inclusão, em produção desde 2026-09-10) alterou o formato de requisição e invólucro e deslocou linhas em vários arquivos citados aqui.

| ID | O que mudou | Por quê |
|---|---|---|
| **R-35** | **Requisição virou lista.** `requisicao: string` → `requisicoes: string[]` no `REQUEST_INCLUDE` e no serializador (4.0b), em `WithdrawalRequestItem` (5.2) e no `withdrawalService` (5.3). Tabela da 0.4 reescrita. | Desde 2026-09-10 um vestígio tem N requisições em `vestige_requisicoes`. O campo `requisicao` não existe mais no Prisma — o plano antigo nem compilaria. |
| **R-36** | **Filtro `removedAt: null` e ordem por `id`** nos selects de requisições e invólucros (4.0b). | Remover invólucro/requisição pela tela é remoção lógica. Sem o filtro, o item lançado por engano volta a aparecer. Ver T-19. |
| **R-37** | **Aviso sobre `requisicaoLegado`** (0.4, T-18). | É a coluna antiga, congelada como cópia de segurança até ser removida. Lê-la compila e mostra dado desatualizado sem erro. |
| **R-38** | **Formato do evento do Google atualizado** (5.3): a linha é `REQUISIÇÃO(ÕES): a, b \| INVÓLUCRO(S): x, y`. | É o que está em produção desde 2026-09-10 — o "preserve integralmente" precisa apontar para o formato real. |
| **R-39** | **Nome da migration** deixa de ser `20260825_0001_...` e passa a usar a data real do dia (3.5, T-20). | A pasta com a data original ordenaria antes de uma migration já aplicada em produção. |
| **R-40** | **Todas as referências `arquivo:linha` reconferidas e corrigidas no próprio texto** — inclusive as citações antigas deste log. Deslocadas pelo commit de 2026-09-10: `VestigeCard.tsx`, `types.ts`, `dataService.ts`, `vestigeRoutes.ts`, `schema.prisma`. Imprecisas desde 2026-08-25 e corrigidas agora: várias do `ScheduleModal.tsx` (import na 6, `min` na 237, erro das 24h na 64, selects em 170-177 e 195-207), `useVestiges.ts:93`, `pcnetRoutes.ts`, `auditService.ts`, `server.ts`, `apiClient.ts`, `SearchResults.tsx`, `Dashboard.tsx:266-271`, `AdminPanel.tsx:52-63`, README (linhas 29 e 97). | A Parte 0 promete fatos verificados; referência errada custa exploração a quem executa. |
| **R-41** | **Contagem de migrations 4 → 5** (0.1), `vestigeItemService.ts` no mapa e baseline de type-check reconferido (0.3). | — |

**Não mudou:** modelo das tabelas de retirada (3.4), rotas e contratos (Parte 4), regras de negócio (24h no servidor com exceção do ADMIN, retirada parcial, cancelamento como status), telas (Parte 5) e os gates já liberados. A migration de retirada continua **puramente aditiva** — não toca nas tabelas de requisição e invólucro.

### Complemento de 2026-09-10 — Execução

Implementação aprovada pelo usuário ("Faça a implementação do plano já"). Desvios do texto do plano, todos pequenos e deliberados:

| ID | Desvio | Por quê |
|---|---|---|
| **R-42** | Migration nomeada `20260910_0002_add_withdrawal_requests`. | Mesmo dia da de requisições; o `_0002` ordena depois dela (T-20). |
| **R-43** | O serializador devolve também `destinacao` (situação atual do vestígio) em cada item. | O diálogo de "Registrar retirada" precisa mostrar "já consta fora da URC" (5.9, item 6), e o plano não trazia o campo. |
| **R-44** | A `/complete` trata `FINALIZADO` (legado) como já fora da URC, igual ao `estaForaDaUrc` do client, e ignora vestígio excluído do cadastro. | Evita registrar transição `FINALIZADO → RETIRADO` inexistente e movimentar vestígio apagado. |
| **R-45** | Criar solicitação recarrega **só** o índice `/open-items` (`refreshOpenWithdrawals`), não o `refreshData`. | O `refreshData` põe a lista em "carregando", o que desmonta o `VestigeCard` — e junto o `ScheduleModal` individual com a tela de sucesso. O "Registrar retirada" continua usando o `refreshData` (via `onDataChanged`), porque muda a situação dos vestígios e roda de dentro do painel. |
| **R-46** | Ids validados com `z.guid()` em vez de `z.string().uuid()`. | Formato permissivo evita falso 400 por variante de UUID; a existência é conferida no banco de qualquer forma. |
| **R-47** | `min` do seletor de data calculado no **fuso local**. | O `toISOString()` antigo dava a data em UTC: depois das 21h o seletor já tratava amanhã como "hoje". |

**Resultado dos testes (7.1, 7.2, 7.2b, 7.4):** 48/48 verificações passando, nenhuma resposta 500. Rodados por script contra a API local:

- **Tokens:** o banco de desenvolvimento só tem um usuário ADMIN. Os tokens de PERITO e VISUALIZADOR foram assinados com o `JWT_SECRET` local, usando o id do ADMIN e trocando só o perfil, que é o que as rotas consultam.
- **Dados de teste:** 14 vestígios `[TESTE RETIRADA]` criados para o roteiro e excluídos logicamente ao final; as solicitações que ficaram abertas foram canceladas.
- **Banco local:** recebeu também a migration `20260910_0001`, que estava pendente nele.

**Pendente:** Parte 7.3 (interface), teste manual.

| ID | Mudança posterior | Por quê |
|---|---|---|
| **R-48** | **Google Agenda retirado** (decisão do usuário, 2026-09-10). Saíram o botão "Abrir no Google Agenda" da tela de sucesso, `buildGoogleCalendarUrl` e `markCalendarOpened` do `withdrawalService`, a rota `POST /:id/calendar-opened`, a ação de auditoria `WITHDRAWAL_CALENDAR_OPENED` e a coluna `calendar_opened_at` — removida da própria migration `20260910_0002`, que ainda não tinha ido para produção; no banco local a coluna foi apagada e o checksum da migration atualizado. | O painel "Retiradas Agendadas" passou a ser o acompanhamento. O evento do Google nascia na agenda pessoal de quem clicava, podia nem ser salvo e cortava lotes grandes em 20 itens. Perde-se o convite por e-mail para pericia.lavras@gmail.com. Roteiro de API reexecutado depois da remoção: 46/48 no script e as 2 restantes (b5, a1) confirmadas por consulta — as falhas eram do próprio script, que comparava `timestamp` sem fuso com um Date do JavaScript e puxava dados da execução anterior; script corrigido. |

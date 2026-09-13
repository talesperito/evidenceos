# Acompanhamento especial: contador de 10 dias, vestígios sem requisição e monitoramento

**Data:** 2026-09-10 · **Revisado:** 2026-09-13 · **Status:** design fechado (D1–D12 definidos) — aguardando
aprovação para implementar. **Nada implementado** (conferido em 13/09: nenhum código, migration, commit, branch ou
stash).

## 1. Problema e objetivo

Entra material na URC sem requisição e ninguém providencia o destino. Hoje o sistema só enxerga esse passivo em
retrospecto (relatório "Passivo sem requisição > 1 ano"), quando já virou problema.

**Objetivo:** tornar o atraso visível desde o primeiro dia, permitir **acompanhar periodicamente e cobrar a
destinação** dos responsáveis e gerar uma prova exportável para a auditoria. Com isso, cadastrar sem requisição passa
a ter custo visível para quem cadastra e para a chefia.

O grupo se chama **"Acompanhamento especial"**: os vestígios que devem ser destinados o mais breve possível. Ele tem
duas origens, com a mesma regra de cor:

1. **Sem requisição (automático):** vestígio cadastrado **a partir do dia da implantação** e sem requisição entra
   sozinho no grupo, com contador desde o cadastro. **Nada anterior à implantação entra por esta via** (D7).
2. **Em monitoramento (manual):** ADMIN ou PERITO marca **qualquer** vestígio (novo ou antigo) que não pode ficar
   muito tempo na URC, **por qualquer motivo**, informando o motivo. O contador conta desde a marcação (D10).

Nas duas, o contador fica **azul até 10 dias** e **vermelho a partir do 11º dia**. **Vestígio fora do grupo não mostra
contador.**

O grupo aparece em quatro lugares, sempre com a mesma contagem:

| Onde | Quem vê | Quem age |
|---|---|---|
| **Card do vestígio** (selo com dias) | todos os perfis | ADMIN/PERITO marcam e encerram o monitoramento |
| **Busca avançada** (filtro "Acompanhamento especial", 4.5) | todos os perfis | ADMIN/PERITO exportam o CSV |
| **Painel Operacional → "Acompanhamento especial"** (modal, 4.3) | todos os perfis | ADMIN/PERITO exportam o CSV e encerram |
| **"Gerar Relatório"** (seção no relatório completo e no PDF, 4.6) | todos os perfis | todos os perfis emitem o PDF |

## 2. Decisões

| # | Decisão | Definição | Por quê |
|---|---|---|---|
| **D1** ✅ | De quando conta o contador "sem requisição" | **Momento do cadastro no sistema**, gravado pelo servidor em coluna própria (`monitorado_desde`). **Não** a "Data de coleta" (que o card chama de "Data Entrada") e **não** o `created_at` | A data de coleta é digitada e editável: dá para zerar o contador corrigindo a data. O `created_at` dos vestígios migrados em 10/09 é a data da migração (ver 3.B). *Confirmado pelo usuário.* |
| **D2** | Como contar os dias | Dia do cadastro (ou da marcação) = **dia 0**. **Azul de 0 a 10**, **vermelho a partir do 11º**. Dias corridos, calendário de Brasília | "Até 10 dias" lido literalmente. Dias corridos porque o prazo é de providência, não de expediente |
| **D3** ✅ | Contador do monitoramento manual | **Mesma regra do sem requisição** (azul até 10 dias, vermelho a partir do 11º), contando **desde a marcação** | Amarelo foi descartado: no card, âmbar já significa "retirada agendada" (selo), "selecionado" (borda) e é a cor de destaque do sistema. *Definido pelo usuário: azul e vermelho.* |
| **D4** ✅ | Contador em vestígio fora do grupo | **Não aparece.** Só vestígio sem requisição (automático) ou em monitoramento (manual) mostra contador | O contador é sinal de urgência: em todos os vestígios, perderia o efeito. O carimbo do cadastro continua gravado em **todo** vestígio novo, para que um vestígio que perca a requisição depois entre no grupo com os dias corretos (D5). *Definido pelo usuário.* |
| **D5** | Quando sai de "Sem requisição" | **Automático:** quando ganha uma requisição **ou** sai da URC (Retirado). Se a requisição for removida depois, volta, e o contador segue da data de cadastro | É o fim do problema, não uma decisão de alguém. Nada é apagado: a trilha fica no histórico de requisições e no AuditLog |
| **D6** ✅ | Quando sai de "Em monitoramento" | **Só manualmente**, por ADMIN/PERITO, **com motivo de encerramento**. Se o vestígio sair da URC, continua no grupo (e contando) com o aviso "fora da URC" até alguém encerrar | Entrada manual pede saída manual, com autor e motivo. *Confirmado pelo usuário.* |
| **D7** ✅ | A partir de quando vale o contador automático | **Só a partir do dia da implantação. Sem retroativo:** a migration **não** preenche `monitorado_desde` em nenhum vestígio existente, nem nos cadastrados pela tela entre 10/09 e o deploy | O que passou não tem como ser cobrado, e incluir retroativo arrisca marcar vestígio errado (ex.: os 19 gravados pelo script `cadastrar-favs-pendentes.cjs`). Vestígio antigo que precise de cobrança entra pelo monitoramento manual. *Definido pelo usuário em 13/09.* |
| **D8** ✅ | Formato da exportação | **CSV gerado pelo servidor** (abre no Excel) para o grupo; **PDF** pelo relatório completo. **XLSX fica fora** (seção 9) | O CSV sai do servidor, então a auditoria do "quem exportou o quê" é garantida. XLSX exigiria dependência nova só para isso. *Confirmado pelo usuário em 13/09.* |
| **D9** ✅ | Filtro na busca avançada | Seletor **"Acompanhamento"**: *Todos* · *Acompanhamento especial* · *Só sem requisição* · *Só em monitoramento*. As três últimas são recortes **do grupo**; o legado sem requisição não é listado por aqui | Consequência da D7: a busca serve para cobrar, e o que é anterior à implantação não se cobra. O legado continua visível na seção "Passivo sem requisição" do relatório |
| **D10** ✅ | O que entra no monitoramento manual | **Qualquer vestígio que não pode ficar muito tempo na URC, por qualquer motivo.** Motivo em texto livre (10–500 caracteres), sem lista fixa | O sistema não tem campo que identifique esse material automaticamente; o motivo e o autor ficam registrados. *Definido pelo usuário em 13/09.* |
| **D11** ✅ | Conteúdo e permissão do CSV | O CSV traz **só o grupo de acompanhamento especial, completo**, montado pelo servidor. **Gerar: só ADMIN/PERITO. Visualizar o grupo na tela: todos os perfis** | Um único arquivo com recorte fixo facilita a cobrança periódica e a comparação entre exportações. *Definido pelo usuário em 13/09.* |
| **D12** ✅ | Relatório do botão "Gerar Relatório" | Continua **completo** (gráficos, KPIs, tabelas) e ganha a seção "Vestígios com acompanhamento especial". **Emitido por qualquer perfil** (ADMIN, PERITO e VISUALIZADOR), na tela e em PDF | É o documento geral da unidade; a seção nova não expõe nada além do que o card já mostra a todos. *Definido pelo usuário em 13/09.* |

**Resumo de permissões:** todos os perfis veem o contador no card, o filtro da busca, o modal "Acompanhamento
especial" e o relatório completo (tela e PDF). **Só ADMIN/PERITO geram o CSV, marcam e encerram monitoramento**,
checado no servidor, não só na tela.

## 3. Abordagens consideradas

**A. Coluna explícita + tabela de monitoramentos + rota dedicada (recomendada).**
`vestiges.monitorado_desde` preenchida só pela rota de cadastro. Monitoramento manual em tabela própria, com
histórico. Rota `/api/monitoring` monta a lista e gera o CSV.
Prós: o critério de "novo" não depende de inferência; o histórico de marcações é preservado; autorização e auditoria
ficam no servidor.
Contra: uma migration e uma rota nova.

**B. Derivar de `createdAt`/`importedAt`, monitoramento como booleano no vestígio.**
Não serve. `createdAt` dos 627 migrados em 10/09 é a data da migração: todo o passivo legado entraria no grupo com
"3 dias" e ficaria vermelho junto em 21/09. `importedAt` depende de cada script ter preenchido o campo (e os scripts
de cadastro manual o deixam nulo). O booleano perde quem marcou, por quê e quem encerrou, o que numa lista de
auditoria é inaceitável. *Cogitado de novo em 13/09 e descartado pelo mesmo motivo.*

**C. Tudo no cliente** (o front já baixa todos os vestígios).
Serve para **exibir** (card, filtro, seção do relatório), porque todo perfil já vê todos os vestígios. Não serve para
o **CSV**: o servidor não teria como garantir o registro de que os dados saíram do sistema, e o nome de quem cadastrou
não vem na listagem atual.

## 4. Design

### 4.1 Banco — migration nova (depois da `20260910_0002`, a última hoje)

```prisma
model Vestige {
  // ...
  // Carimbo do servidor no cadastro pela tela. NULL = vestígio anterior à implantação da feature:
  // nunca entra em "Sem requisição". Nenhuma rota de edição nem script de importação escreve aqui.
  monitoradoDesde DateTime? @map("monitorado_desde")
  monitoramentos  VestigeMonitoramento[]
}

// Marcação manual para monitoramento. Encerrar é preencher encerrado_*, nunca apagar a linha.
model VestigeMonitoramento {
  id                 BigInt    @id @default(autoincrement())
  vestigeId          String    @map("vestige_id")
  motivo             String
  marcadoPor         String    @map("marcado_por")
  marcadoEm          DateTime  @default(now()) @map("marcado_em")
  encerradoPor       String?   @map("encerrado_por")
  encerradoEm        DateTime? @map("encerrado_em")
  motivoEncerramento String?   @map("motivo_encerramento")
  // relations: vestige, marcador (User), encerrador (User)
  @@index([vestigeId])
  @@index([encerradoEm])
  @@map("vestige_monitoramentos")
}
```

- **Sem retroativo (D7):** a migration só cria a coluna (nula) e a tabela. Nenhum `UPDATE` em `vestiges`. O primeiro
  vestígio com contador é o primeiro cadastrado pela tela depois do deploy do `api`.
- **Um monitoramento ativo por vestígio:** verificação dentro de transação, com o vestígio travado
  (`SELECT ... FOR UPDATE`). Um índice único parcial (`WHERE encerrado_em IS NULL`) seria mais forte, mas o Prisma
  não o representa no schema. Conferir na implementação se a versão 7.7.0 acusa drift antes de adotar.
- `onDelete` sem cascade: registro de custódia não some junto com nada.

### 4.2 API

**Cadastro (`POST /api/vestiges`):** grava `monitoradoDesde: new Date()` em **todo** vestígio novo, com ou sem
requisição (D4). O valor **não** entra no schema Zod do POST nem do PUT (o Zod descarta a chave), então nenhum payload
consegue alterar ou zerar o contador.

**Listagem (`GET /api/vestiges`):** `monitoradoDesde` já vem por ser escalar do `include` atual. Acrescentar o
monitoramento ativo (`monitoramentos` com `where: { encerradoEm: null }`: `motivo`, `marcadoEm`, nome de quem marcou).
É com isso que card, filtro e relatório calculam tudo no cliente, sem chamada extra.

**Rotas novas — `server/src/routes/monitoringRoutes.ts`, prefixo `/api/monitoring`:**

| Rota | Perfil | Faz | Erros | Auditoria |
|---|---|---|---|---|
| `GET /` | **todos** | Devolve `{ geradoEm, semRequisicao[], emMonitoramento[] }` com todos os campos da 4.4 e `dias` já calculado | 401 | — (abertura já registrada pelo `handleAction` do painel) |
| `POST /export.csv` | ADMIN/PERITO | Gera o CSV do **grupo completo** (D11). Body `{ origem: 'PAINEL' \| 'BUSCA' }`, só para a auditoria saber de onde veio. Não recebe ids nem filtros: o conteúdo é sempre montado pelo servidor | 400 origem · 403 | `MONITORING_EXPORTED` com `{ origem, totalSemRequisicao, totalEmMonitoramento, totalVencidos, vestigeIds }` |
| `POST /vestiges/:vestigeId/marcar` | ADMIN/PERITO | Marca para monitoramento. Body `{ motivo }` (10–500 caracteres) | 400 motivo · 404 vestígio inexistente/excluído · 409 já monitorado | `MONITORING_MARKED` com `{ motivo }` |
| `POST /vestiges/:vestigeId/encerrar` | ADMIN/PERITO | Encerra o monitoramento ativo. Body `{ motivo }` (10–500) | 400 · 404 sem monitoramento ativo | `MONITORING_CLEARED` com `{ motivoMarcacao, motivoEncerramento, diasMonitorado }` |

O export é `POST` (e não `GET`) para que um link em outro site não consiga disparar um download e um registro de
auditoria em nome de quem está logado: `POST` com JSON exige preflight de CORS, e o CORS só aceita as origens
autorizadas.

Todas as rotas usam `safeParse` e devolvem 400 (o `server.ts` não tem `setErrorHandler`: um ZodError vira 500).
IDs BigInt sempre convertidos com `String()`.

**Critério "sem requisição" no servidor:**

```ts
{ deletedAt: null, monitoradoDesde: { not: null },
  destinacao: { notIn: ['RETIRADO', 'FINALIZADO'] },
  requisicoes: { none: { removedAt: null } } }   // ordenado por monitoradoDesde asc = mais atrasado primeiro
```

`none` basta porque, desde 10/09, o cadastro e a edição só aceitam requisição com dígitos. O texto legado ("N/I"),
que obriga o cliente a testar `/\d/`, nunca existe num vestígio com carimbo.

**Em monitoramento:** registros com `encerradoEm = null` cujo vestígio não foi excluído, ordenados por `marcadoEm` asc.
Um vestígio sem requisição **e** marcado aparece **nas duas seções**, com a indicação cruzada.

**Contagem de dias:** diferença entre datas de calendário em `America/Sao_Paulo` (servidor via `Intl.DateTimeFormat`,
cliente pelo fuso do navegador). A regra existe em dois lugares (`monitoringRoutes.ts` e helper em `client/types.ts`),
cada um com comentário apontando para o outro, no mesmo padrão de `VALID_REASONS`/`WITHDRAWAL_REASONS`. Constante
`PRAZO_MONITORAMENTO_DIAS = 10` nos dois, valendo para as duas seções.

**Helper único no cliente** (`client/types.ts`), usado por card, filtro e relatório, para que os três nunca
divirjam:

```ts
getAcompanhamento(vestige): {
  semRequisicao: { dias: number; vencido: boolean } | null;  // só com carimbo, sem requisição e ainda na URC
  monitoramento: { dias: number; vencido: boolean; motivo: string; marcadoPor: string; foraDaUrc: boolean } | null;
}
// No grupo = semRequisicao !== null || monitoramento !== null
```

### 4.3 Tela

**Card (`VestigeCard.tsx`)** — selo abaixo de "Situação", sempre com texto (a cor nunca é o único sinal), visível a
todos os perfis:

| Situação do vestígio | Selo |
|---|---|
| Fora do grupo (inclui todo legado não marcado e todo vestígio com requisição) | **nenhum**. O "Tempo de Custódia" atual continua como está |
| Sem requisição, 0–10 dias desde o cadastro | azul — "Sem requisição · 7 dias" |
| Sem requisição, 11+ dias | vermelho — "Sem requisição · 14 dias — prazo vencido" |
| Em monitoramento, 0–10 dias desde a marcação | azul — "Monitoramento · 3 dias" (motivo e autor ao passar o mouse) |
| Em monitoramento, 11+ dias | vermelho — "Monitoramento · 12 dias — prazo vencido" |

Nas duas situações ao mesmo tempo, os **dois selos** aparecem, porque as datas de início são diferentes.

> ⚠️ **Conflito de linguagem visual.** Hoje o vermelho no card significa **só** "fora da URC" (faixa lateral + selo
> de Situação; ver comentário em `VestigeCard.tsx:132-135`). O vermelho do prazo vencido é pedido explícito. Em "Sem
> requisição" os dois nunca aparecem juntos, porque sair da URC tira o vestígio da seção. Já no monitoramento manual
> podem aparecer (D6). Por isso o selo de prazo **não** usa a faixa lateral, sempre diz "prazo vencido", e o
> comentário do card precisa ser atualizado.

**Marcar/encerrar monitoramento:** botão com ícone de bandeira ao lado de Editar (só ADMIN/PERITO). Abre um modal
pequeno com textarea de motivo obrigatório (texto livre, D10). Sem `window.prompt`.

**Painel Operacional (`AdminPanel.tsx`):** botão **"Acompanhamento especial"**, **liberado para todos os perfis**
(novo case em `hasPermission`, como `RETIRADAS`).

**`MonitoringModal.tsx` (novo), título "Vestígios com acompanhamento especial":**
- Cabeçalho: gerado em, por quem, totais por seção e quantos com prazo vencido.
- Quadro "O que são", com o mesmo texto da seção do relatório (4.6). O texto fica num único componente, usado nos
  dois lugares, para não divergir.
- Seção 1 **"Sem requisição"**: tabela ordenada do mais atrasado ao mais recente, com a coluna de dias colorida.
- Seção 2 **"Em monitoramento"**: mesma tabela, mais motivo, quem marcou e aviso "fora da URC" quando for o caso; ação
  "Encerrar" por linha **só para ADMIN/PERITO**.
- Botão **Exportar CSV** **só para ADMIN/PERITO** (`POST /export.csv` com `origem: 'PAINEL'`, baixa via `fetch` + blob,
  com o cookie de sessão). **Imprimir / PDF** para todos (`window.print()`, com `print:` do Tailwind, no padrão do
  `ReportModal`).

**Formulário de cadastro (`VestigeFormModal.tsx`):** com a lista de requisições vazia, aviso âmbar: *"Sem requisição:
este vestígio entra no Acompanhamento especial e o prazo de 10 dias começa a contar agora."* É o empurrão no momento
em que o problema nasce. Não bloqueia o cadastro.

### 4.4 Conteúdo da lista (modal, PDF e CSV)

Todos os dados do vestígio, na ordem:

Seção (Sem requisição / Em monitoramento) · Dias (desde o cadastro em "Sem requisição"; desde a marcação em "Em
monitoramento") · Prazo (dentro / vencido) · Categoria · Material · Tipo de material · FAV · Requisições (número —
motivo) · Invólucros (número — motivo) · Município · Data de coleta · Entrada no sistema (data e hora; vazio para
vestígio anterior à implantação) · Cadastrado por (nome) · Estado de conservação · Situação · Obs. da destinação ·
Observações · Retirada agendada (data e solicitante, se houver) · Ref. (id) · ID legado.

Só na seção 2: Motivo do monitoramento · Marcado por · Marcado em.

Rodapé do PDF: "Documento gerado pelo EvidenceOS em DD/MM/AAAA HH:MM por <nome>".

CSV: UTF-8 com BOM, separador `;` (Excel pt-BR), uma linha por vestígio por seção (quem está nas duas aparece duas
vezes, cada linha com seus dias). Ordem: seção 1, depois seção 2, cada uma do mais atrasado ao mais recente. Nome do
arquivo: `acompanhamento-especial-AAAA-MM-DD.csv`. O conteúdo é o mesmo venha do painel ou da busca.

### 4.5 Busca avançada — filtro "Acompanhamento" (D9)

**`SearchBar.tsx`:** novo seletor **"Acompanhamento"** no painel de filtros avançados, combinável com os demais
(município, categoria, datas, conservação, situação). Novo campo `acompanhamento?` em `SearchFilters`.

| Opção | Lista |
|---|---|
| *Todos* (padrão) | sem restrição |
| *Acompanhamento especial* | sem requisição **+** em monitoramento. Sem outros filtros, **mesma contagem** do modal e da seção do relatório |
| *Só sem requisição* | só a seção 1 do grupo |
| *Só em monitoramento* | só a seção 2 do grupo, inclusive fora da URC (D6) |

**Filtro no cliente** (`useVestiges.ts`), usando o helper `getAcompanhamento`: é o mesmo dado que o card já mostra a
todos os perfis.

**`SearchResults.tsx`**, quando o filtro "Acompanhamento" está em qualquer opção diferente de *Todos*:
- **Faixa de contagem** acima dos cards, para todos os perfis: *"14 vestígios em acompanhamento especial · 5 com prazo
  vencido"*.
- **Ordem:** mais atrasado primeiro.
- **Botão "Exportar CSV do acompanhamento especial"**, só ADMIN/PERITO (`POST /export.csv` com `origem: 'BUSCA'`).
  Como o CSV é sempre o grupo completo (D11), o botão avisa ao lado, quando houver outros filtros ativos: *"O CSV traz
  o grupo completo, sem os demais filtros."*

### 4.6 Relatório — seção "Vestígios com acompanhamento especial" (D12)

O relatório do botão "Gerar Relatório" **continua completo** (KPIs, gráficos, tabelas por categoria e semestre) e
**continua liberado para todos os perfis**, na tela e em PDF. Muda só o acréscimo abaixo.

**`useVestiges.ts` → `generateReport`:** calcula, com o helper, `acompanhamentoEspecial: { total, vencidos, itens[] }`
a partir dos vestígios já carregados. Novo campo em `ReportData`.

**`ReportModal.tsx`:** seção nova, logo depois dos KPIs principais (é a lista de ação; o resto do relatório é análise):

- Título: **"Vestígios com acompanhamento especial"**.
- **Quadro explicativo "O que são"**, fixo, logo abaixo do título, sempre visível na tela e no PDF (não colapsa).
  Escrito para qualquer servidor, sem termos técnicos do sistema:

  > **O que são os vestígios com acompanhamento especial**
  >
  > São vestígios que precisam ser destinados o mais breve possível. Entram nesta lista de duas formas:
  >
  > **Sem requisição (automático).** Todo vestígio cadastrado no EvidenceOS a partir de DD/MM/AAAA sem número de
  > requisição entra sozinho, no momento do cadastro. O prazo conta a partir do cadastro. Sai sozinho quando recebe
  > uma requisição ou é retirado da URC.
  >
  > **Em monitoramento (manual).** Vestígio que não pode ficar muito tempo na URC, por qualquer motivo, marcado por um
  > perito ou administrador, que registra o motivo. O prazo conta a partir da marcação. Sai quando um perito ou
  > administrador encerra o monitoramento, também informando o motivo.
  >
  > **Prazo: 10 dias corridos.** Azul: dentro do prazo (até o 10º dia). Vermelho: prazo vencido (a partir do 11º dia).
  >
  > Vestígios sem requisição cadastrados antes de DD/MM/AAAA não entram automaticamente: constam na seção "Passivo sem
  > requisição" deste relatório. Se algum deles precisar ser cobrado, um perito ou administrador pode marcá-lo em
  > monitoramento.

  "DD/MM/AAAA" é a data da implantação, lida de uma constante no cliente preenchida no deploy (seção 8). Visual:
  bloco discreto (fundo levemente destacado, texto pequeno), sem ícone de alerta, para não competir com a tabela.
- KPIs: total em acompanhamento · com prazo vencido.
- Tabela: Dias (colorido, com o texto "vencido") · Seção · FAV · Material · Categoria · Município · Requisições ·
  Motivo (se em monitoramento). Ordem: mais atrasado primeiro.
- Na tela, as 20 primeiras linhas com "Ver todos"; **no PDF, sempre a lista completa** (mesmo padrão da tabela por
  semestre, `print:block`).
- Sem itens: *"Nenhum vestígio em acompanhamento especial nesta data."*

O legado sem requisição **não** entra aqui: continua na seção "Passivo sem requisição" (D7/D9).

## 5. Resumo de Impacto de Segurança e Auditoria

**O que muda na lógica crítica:** a rota de cadastro de vestígio passa a gravar um campo novo. Nasce uma tabela de
monitoramentos. Nenhuma alteração em autenticação, em `destinacao`, na rota `/complete` da retirada ou na regra das
24h. A feature **observa** a custódia, não a movimenta. Nenhum dado existente é alterado pela migration (D7).

| Risco | Tratamento |
|---|---|
| **Manipular o contador** (zerar o prazo editando a data) | Carimbo do servidor, fora de qualquer schema de entrada. Scripts de importação não conhecem o campo e o deixam nulo |
| **Contador falsificado no CSV** | O CSV não recebe nada do cliente além da origem: lista, situação e dias são calculados no servidor |
| **Vazamento via exportação** (o arquivo sai do sistema com todos os dados) | Só ADMIN/PERITO, checado no servidor (o botão escondido é conveniência, não controle). `MONITORING_EXPORTED` grava quem, quando, a origem e **quais ids**. Resposta com `Cache-Control: no-store` |
| **Lista visível ao VISUALIZADOR** (modal, filtro, relatório) | Não expõe dado novo: todo perfil já vê todos os vestígios, e o card já mostra selo, motivo e autor. `GET /api/monitoring` exige só sessão válida |
| **CSV/formula injection** (`material`/`observacoes`/`motivo` são texto livre; `=HYPERLINK(...)` executaria no Excel do auditor) | Toda célula que começar com `=`, `+`, `-`, `@`, tab ou CR recebe `'` na frente. Aspas escapadas. Teste obrigatório na 6 |
| **XSS** | Só renderização React (escapa por padrão). Nenhum `dangerouslySetInnerHTML` |
| **IDOR** | Todo usuário autenticado já vê todos os vestígios. As rotas de escrita só exigem perfil; `vestigeId` validado como UUID |
| **CSRF** | Mesmo modelo das rotas atuais (cookie HttpOnly + CORS restrito). Escrita e exportação só por `POST` com JSON |
| **Marcação duplicada concorrente** | Transação com trava da linha do vestígio → 409 |
| **Perda de trilha** | Monitoramento nunca é apagado. Marcação e encerramento com autor, data e motivo na tabela **e** no AuditLog |

**Ações novas no AuditLog:** `MONITORING_MARKED`, `MONITORING_CLEARED`, `MONITORING_EXPORTED`. A impressão/PDF é
registrada pelo cliente (`logAction`, como o "Ver FAV"): prova que o botão foi usado, não que a folha saiu da
impressora.

**Lembrete do projeto:** falha de gravação de log é silenciosa. Conferir em Logs de Auditoria depois do deploy.

## 6. Roteiro de testes

Local, contra a API. **Datas simuladas só no banco local, nunca em produção.**

**Contador e seções**

1. Cadastrar sem requisição → `monitorado_desde` preenchido; aparece na seção 1 com 0 dias, azul.
2. `UPDATE vestiges SET monitorado_desde = now() - interval '10 days'` → azul. `'11 days'` → vermelho.
3. Cadastrar **com** requisição → `monitorado_desde` preenchido, **nenhum selo**, fora do grupo.
4. Remover a requisição desse vestígio → entra na seção 1 com os dias contados do cadastro. Incluir de novo → sai.
5. Marcar como Retirado um vestígio da seção 1 → sai da seção e o selo some.
6. `PUT` e `POST` com `monitoradoDesde` no body → valor ignorado.
7. Vestígio legado → sem selo, fora da seção 1. Marcado para monitoramento → selo "Monitoramento · 0 dias".
8. Simular marcação com 11 dias (`UPDATE vestige_monitoramentos SET marcado_em = ...`) → vermelho.
9. Marcar sem motivo / com 5 caracteres → 400. Duas vezes → 409. Vestígio excluído → 404.
10. Encerrar sem monitoramento ativo → 404. Encerrar com motivo → sai da seção 2; a linha continua no banco.
11. Monitorado que sai da URC → continua na seção 2, com aviso "fora da URC", contando.
12. Aviso no formulário de cadastro sem requisição.

**Sem retroativo (D7)**

13. Rodar a migration num banco local com vestígios existentes (inclusive criados pela tela antes dela) → todos com
    `monitorado_desde` nulo; grupo vazio até o primeiro cadastro novo sem requisição.

**Permissões**

14. VISUALIZADOR: vê selo, filtro, faixa de contagem, modal "Acompanhamento especial" e a seção do relatório; **não** vê
    "Exportar CSV", "Encerrar" nem a bandeira de marcar.
15. VISUALIZADOR chamando direto `POST /export.csv`, `/marcar` e `/encerrar` → 403. `GET /api/monitoring` → 200.
16. VISUALIZADOR gera o relatório completo e imprime o PDF, com gráficos, KPIs e a seção nova.

**CSV**

17. Exportar pelo modal e pela busca → mesmo conteúdo; logs com `origem: 'PAINEL'` e `origem: 'BUSCA'` e os
    `vestigeIds`.
18. Busca com *Acompanhamento especial* + município → o aviso "grupo completo" aparece e o CSV traz o grupo inteiro.
19. Vestígio com requisição ou legado não marcado nunca aparece no CSV.
20. Material `=HYPERLINK("http://x","y")` → no CSV aparece `'=HYPERLINK(...)` e o Excel mostra texto.
21. Acentos (Santo Antônio do Amparo) corretos ao abrir o CSV no Excel.
22. Vestígio nas duas seções → duas linhas, cada uma com seus dias.

**Busca e relatório**

23. *Acompanhamento especial* sem outros filtros → mesma contagem do modal e da seção do relatório. *Só sem
    requisição* + *Só em monitoramento* somam o total (descontando quem está nas duas).
24. Relatório: seção com o quadro "O que são" (com a data da implantação nas duas menções), KPIs e tabela do mais
    atrasado primeiro; sem legado. O quadro aparece inteiro no PDF e é idêntico ao do modal.
25. Mais de 20 itens → tela mostra 20 com "Ver todos"; PDF traz todos.
26. Grupo vazio → mensagem de lista vazia no modal, na busca e no relatório, sem erro.
27. `audit_logs` com `MONITORING_MARKED`, `MONITORING_CLEARED` e `MONITORING_EXPORTED`.

## 7. Ordem de implementação

~~0. Fechar a solicitação de retirada antes.~~ **Feito:** commit `a69e08c`. A migration desta feature vem depois da
`20260910_0002`, que continua sendo a última.

1. Schema + migration (sem retroativo).
2. `POST /api/vestiges` grava `monitoradoDesde`; `GET` inclui o monitoramento ativo.
3. `monitoringRoutes.ts`: lista (todos), marcar/encerrar e CSV (ADMIN/PERITO). Registro em `server.ts`.
4. `types.ts` + `dataService.ts`: tipos, helper `getAcompanhamento`, constante da data de implantação, mapeamento.
5. Selos no `VestigeCard` + modal de marcação/encerramento.
6. `MonitoringModal` ("Acompanhamento especial") + botão no `AdminPanel`.
7. Aviso no `VestigeFormModal`.
8. Filtro "Acompanhamento" (`SearchBar`, `useVestiges`), faixa de contagem e botão de CSV (`SearchResults`).
9. Seção no relatório (`generateReport`, `ReportModal`).
10. Roteiro da parte 6 + `verification-before-completion`.

## 8. Implantação

| Serviço | Ação |
|---|---|
| **api** | Reimplantar. Depois, no console do serviço `api`: `cd /app && npx prisma@7.7.0 migrate deploy` |
| **web** | Reimplantar. Depois, `Ctrl+Shift+R` no navegador |
| **db** | Nenhuma ação |

**Ordem:** `api` com a migration, depois `web`. Enquanto o `web` antigo estiver no ar, nada quebra: os campos novos só
são ignorados pela tela velha. **O contador começa a valer no deploy do `api`** (D7): conferir que a constante da data
de implantação no cliente corresponde a esse dia antes de gerar o build do `web`.

**Conferência em produção:**
1. Logo após o deploy, "Acompanhamento especial" vazio (nenhum retroativo).
2. Cadastrar um vestígio de teste sem requisição e ver o selo "Sem requisição · 0 dias".
3. Com um usuário VISUALIZADOR: ver o selo, o filtro, o modal e a seção do relatório; confirmar que não há botão de
   CSV nem de marcar.
4. Com ADMIN/PERITO: exportar o CSV pela busca e pelo modal; ver `MONITORING_EXPORTED` com as duas origens em Logs de
   Auditoria.
5. Marcar o vestígio de teste para monitoramento e ver `MONITORING_MARKED`; encerrar e ver `MONITORING_CLEARED`.
6. Excluir o vestígio de teste **pela tela**.

## 9. Fora de escopo (por ora)

- **XLSX.** O CSV abre direto no Excel; gerar `.xlsx` exigiria dependência nova (ex.: `exceljs`). Entra se o CSV não
  bastar para quem recebe a cobrança.
- **Contador para o que é anterior à implantação.** Fora por decisão (D7). Caso a caso, pelo monitoramento manual.
- **Responsável pela destinação.** O sistema não sabe quem deve dar o destino (autoridade requisitante, delegacia). A
  cobrança usa o que existe: FAV, município e "Cadastrado por". Registrar o responsável seria um campo novo.
- E-mail automático quando o prazo vence (o Nodemailer já existe; fica para uma fase 2, se a lista sozinha não
  bastar).
- Número de vencidos no botão do painel.
- Prazo de 10 dias configurável pela tela (constante no código até alguém pedir outro valor).
- Registro de "exportações enviadas" como entidade própria: o AuditLog com os ids cobre a prova por enquanto.

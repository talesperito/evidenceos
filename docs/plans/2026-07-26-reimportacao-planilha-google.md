# Plano: Reimportação/Sincronização da Planilha do Google para o Banco da VPS

**Data:** 2026-07-26
**Status:** 🔍 Levantamento concluído · ✅ **Decisões de desenho tomadas pelo usuário em 2026-07-26** (ver Parte 3) · ⬜ Nada implementado ainda — nenhum script alterado, nenhuma sincronização executada.
**Escopo deste documento:** Parte 1 (como funciona hoje) · Parte 2 (o que impede rodar de novo) · Parte 3 (decisões tomadas) · Parte 4 (abordagens possíveis) · Parte 5 (plano de execução proposto)

> ## ⛔ Antes de qualquer coisa: NÃO rode `npm run phase2:run` (nem `phase2:seed`) no estado atual
>
> O script de seed é **destrutivo** e está **quebrado**. Rodá-lo hoje contra o banco de produção, na melhor das hipóteses, falha no meio; na pior, apaga dados de cadeia de custódia que só existem no EvidenceOS e não têm origem na planilha. Os detalhes estão na Parte 2 — leia antes de agir.
>
> Esta é exatamente a situação que a Regra de Ouro do `CLAUDE.md` cobre: mexe em evidências e em cadeia de custódia, logo exige **Resumo de Impacto de Segurança e Auditoria + aprovação explícita** antes de qualquer execução.

---

## Parte 1 — Como a importação foi feita (levantado no código em 2026-07-26)

### 1.1 A origem dos dados não é o "Google Drive" diretamente

Não há credencial do Google, nem API do Sheets, nem download de arquivo. A ponte é um **Google Apps Script publicado como Web App**, que lê a planilha e devolve JSON:

```
https://script.google.com/macros/s/AKfycbwmcouawrn6FbbbWPBozjdobJzhCmGGKGynyzTrGzaT2PsCgAIE7uJCGTm14TJSTS1_MA/exec
```

Está **hardcoded** em [`server/scripts/_phase2-common.cjs`](../../server/scripts/_phase2-common.cjs), na constante `APPS_SCRIPT_URL`.

**O código-fonte desse Apps Script não está neste repositório.** Ele vive na conta Google do usuário, e é ele quem define quais abas/colunas da planilha entram no JSON. Qualquer mudança de estrutura da planilha (coluna nova, aba nova) precisa ser feita lá, não aqui.

### 1.2 O pipeline: 3 scripts encadeados

Orquestrados por [`phase2-run.cjs`](../../server/scripts/phase2-run.cjs), disponíveis como npm scripts em `server/package.json`:

| # | Comando | Script | O que faz |
|---|---|---|---|
| 1 | `npm run phase2:export` | `export-sheets.cjs` | `GET` no Apps Script → grava `database/sheets-snapshot.json` (com `generatedAt`, `total`, `items[]`) |
| 2 | `npm run phase2:seed` | `seed-from-snapshot.cjs` | Lê o snapshot → cria/atualiza categorias → **apaga e reinsere** os vestígios → insere em lotes de 500 |
| 3 | `npm run phase2:validate` | `validate-import.cjs` | Compara o snapshot com o banco → grava `database/import-validation.json` |
| — | `npm run phase2:run` | `phase2-run.cjs` | Roda os três acima em sequência, abortando se algum falhar |

### 1.3 Formato de cada item da planilha

Sete campos, conforme o snapshot atual:

```json
{
  "material": "Chupa cabra",
  "requisicao": 48652172,
  "involucro": 4303292,
  "fav": 1087560,
  "municipio": "Ijaci",
  "data": "2024-01-06T03:00:00.000Z",
  "planilhaOrigem": "Eletrônico"
}
```

`planilhaOrigem` (o nome da aba da planilha) vira a **categoria** do vestígio, via `normalizeCategoryName()` — que remove a extensão do nome e usa `"Geral"` como fallback.

### 1.4 Resultado da importação original

De `database/import-validation.json`, gerado em **2026-04-09**:

| Métrica | Valor |
|---|---|
| Vestígios no snapshot | **4.600** |
| Vestígios importados | **4.600** (bateu) |
| Categorias | **29** (bateu) |
| Sem data de coleta | 375 |
| Material vazio/`N/I` | 1 |
| Maiores categorias | Drogas (1.330), Celulares (999), ArmasSimulacros (459), Munições (368) |

Todos os importados ficam marcados com `importedFrom: 'google_sheets'` e `importedAt`, o que os distingue dos criados manualmente no sistema.

### 1.5 Como cada vestígio é identificado (`legacyId`)

`buildLegacyId()` gera `gs_<sha256 truncado>` a partir da concatenação de:

```
planilhaOrigem | fav | requisicao | involucro | material | municipio | data | ÍNDICE DA LINHA
```

**O índice da linha entra no hash.** Isso é decisivo e está detalhado na Parte 2.

---

## Parte 2 — Por que NÃO dá para simplesmente rodar de novo

Três problemas independentes. Qualquer um deles, sozinho, já impediria.

### 🔴 Problema 1 — O script de seed está quebrado desde 2026-06-19

`mapVestigeForInsert()` em `_phase2-common.cjs` monta o objeto de inserção com um campo **`involucro`**:

```js
involucro: item.involucro ? String(item.involucro).trim() : null,
```

Só que a coluna `involucro` **não existe mais** no model `Vestige`. Ela foi removida no commit `017f850` (*"feat: permite multiplos involucros por vestigio"*, 2026-06-19), quando os invólucros viraram uma tabela separada (`VestigeInvolucro`, relação 1:N).

**Consequência:** `prisma.vestige.createMany()` vai falhar com erro de argumento desconhecido. O script nunca foi atualizado depois daquela mudança — a última importação (abril) é anterior a ela.

**Agravante:** o `deleteMany` acontece **antes** do `createMany`. Ou seja, o script apaga os 4.600 vestígios e só então explode ao tentar inserir. **Resultado: banco vazio e nada reinserido.**

### 🔴 Problema 2 — O seed é destrutivo por natureza (apaga tudo e reinsere)

```js
await prisma.vestige.deleteMany({
  where: { importedFrom: 'google_sheets' },
});
```

Isso não é um "sync", é um **replace**. O snapshot só carrega 7 campos vindos da planilha, mas o vestígio no EvidenceOS acumulou muito mais desde abril. Tudo que **não** vem da planilha seria perdido:

| Dado perdido | Origem | Gravidade |
|---|---|---|
| `estadoConservacao` | Preenchido no sistema (plano 2026-04-15) | 🔴 Alta |
| `destinacao`, `destinacaoObs`, `destinacaoChangedBy/At` | Preenchido no sistema | 🔴 Alta — é fluxo de saída de evidência |
| `VestigeInvolucro[]` | Múltiplos invólucros por vestígio | 🔴 Alta — apagados em **cascata e em silêncio** (`onDelete: Cascade`) |
| `observacoes`, `tipoMaterial` | Preenchidos no sistema | 🟡 Média |
| `createdBy`, `updatedBy`, `createdAt` | Autoria/rastreabilidade | 🔴 Alta |
| `deletedAt` (soft delete) | Vestígios excluídos logicamente **voltariam** | 🔴 Alta |
| `id` (UUID) | Regerado — toda referência externa quebra | 🔴 Alta |

**E tem um efeito de proteção acidental que vale conhecer:** `VestigeDestinationLog` e `PcnetActionLog` referenciam `Vestige` **sem `onDelete: Cascade`**, ou seja, com `RESTRICT` (o padrão). Então o `deleteMany` **vai falhar** em qualquer vestígio que tenha histórico de destinação ou ação do PCNET.

Isso é bom (impede a destruição total) e ruim (o script morre no meio, sem transação explícita, deixando o banco num estado indefinido). Como agora existem registros de PCNET em produção, a chance de bater nesse erro é real.

**Além disso:** a reimportação **não escreve nada em `AuditLog`**. Uma substituição em massa de 4.600 evidências não deixaria rastro de auditoria — o oposto do princípio de *audit trail* inquebrável do `CLAUDE.md`.

### 🔴 Problema 3 — Não existe identidade estável para fazer "atualizar em vez de recriar"

O caminho natural seria trocar o `deleteMany` por um `upsert` — atualizar quem já existe, inserir só quem é novo. Mas **não há chave confiável para isso**, porque o `legacyId` inclui o **índice da linha** no hash.

Efeito prático: se uma linha for inserida no meio ou no topo da planilha, **todas as linhas seguintes mudam de `legacyId`** e passariam a ser vistas como registros novos, gerando milhares de duplicatas.

O `legacyId` também inclui `material`, `municipio` e `data` — então **corrigir um erro de digitação na planilha também muda a identidade** do registro.

**Conclusão:** antes de qualquer sincronização incremental, é preciso definir qual campo (ou combinação) identifica um vestígio de forma estável. Ver Parte 3.

---

## Parte 3 — Decisões tomadas pelo usuário (2026-07-26)

### 3.1 Análise de unicidade — feita sobre os 4.600 registros reais do snapshot

Antes de fixar a chave, as opções foram testadas contra os dados de verdade (não contra suposição):

| Chave candidata | Chaves distintas | Chaves repetidas | Linhas sem chave usável |
|---|---|---|---|
| **FAV sozinha** | 4.411 | **181** (afetando 369 linhas) | 1 |
| Invólucro sozinho | 4.424 | 87 | 84 |
| Requisição sozinha | 2.841 | 105 | 1.252 |
| **FAV + Invólucro** ✅ | 4.538 | **61** | **0** |
| FAV + Invólucro + Requisição | 4.541 | 58 | 0 |

**Achado relevante:** a planilha usa o literal **`x` como "não informado"**, inclusive no campo FAV — a "FAV" `x` aparece em 7 linhas distintas (Lâmpada, 2 Facas, CD, DVD, Pen drive, Tacógrafo). O mesmo `x` aparece em requisição e material. Qualquer normalização precisa tratar `x` e `N/I` como vazio, nunca como valor.

**Sobre as 61 colisões restantes em FAV+Invólucro:** parte delas é **legítima, não erro de digitação**. Exemplo real: a chave `1119697|3961437` tem um "Smartwatch" e um "Relógio", mesma data, mesmo invólucro — dois objetos distintos acondicionados juntos. Por isso o agente **nunca deve adivinhar** nesses casos: deve reportar e não excluir.

### 3.2 Decisões

1. **Chave de identidade: `FAV + Invólucro`.** Escolhida pelo usuário após ver a análise acima. Nas colisões, o agente reporta em vez de decidir sozinho.

2. **Nova coluna `situação` na planilha.** A partir de agora as linhas **não serão mais apagadas** do Drive: receberão uma marcação de situação (ex.: excluído/descartado), e o registro permanece. O banco já suporta isso via `Vestige.deletedAt`.
   **Por que isso é o correto:** apagar a linha destrói o registro de que o vestígio existiu, o oposto do que a cadeia de custódia exige — o rastro precisa ser contínuo, inclusive o do descarte. Tem também um motivo prático: vestígios com histórico de destinação ou de PCNET **não podem** ser apagados fisicamente (a FK bloqueia), então exclusão física quebraria a sincronização no meio.
   ⚠️ **Depende de alteração no Apps Script**, que fica fora deste repositório — a coluna precisa ser exportada no JSON para o EvidenceOS conseguir lê-la.

3. **O Drive é a fonte de verdade da cadeia de custódia.** Registros que existem na VPS e não existem no Drive são, em princípio, resíduo dos testes de migração.

4. **Exclusão nunca é automática.** O agente separa esses registros, mostra ao usuário e **só age depois de aprovação explícita**.

### 3.3 Ponto de atenção não resolvido pelas decisões acima

**Vestígios criados manualmente no EvidenceOS** (botão "Novo Vestígio") nunca vão existir na planilha — por definição, não vêm dela. Pela regra "o que não está no Drive é teste", eles seriam candidatos a exclusão indevida.

**Mitigação obrigatória no agente:** separar os candidatos por `importedFrom` (`google_sheets` vs. criado no sistema) e apresentá-los em **listas distintas**, deixando claro que os criados manualmente provavelmente **não** são resíduo de teste. Nunca misturar os dois grupos numa lista só.

### 3.4 Ainda em aberto (não bloqueia)

- A estrutura da planilha mudou desde abril, além da coluna `situação`? Colunas/abas novas exigem alterar o Apps Script.
- Frequência: por ora, **sob demanda** — o usuário aciona o agente quando quiser sincronizar.

---

## Parte 4 — Abordagens possíveis

| Abordagem | Como funciona | Prós | Contras | Recomendação |
|---|---|---|---|---|
| **A. Reimportação destrutiva** (o que o script faz hoje) | Apaga tudo com `importedFrom='google_sheets'` e reinsere | Simples; garante espelho fiel da planilha | Destrói conservação, destinação, invólucros, autoria e soft-deletes; falha por FK; sem auditoria | ❌ **Descartar** |
| **B. Sincronização incremental (upsert)** | Compara planilha × banco por chave estável; insere novos, atualiza só campos da planilha, nunca toca nos campos do sistema | Preserva tudo que o EvidenceOS acrescentou; auditável | Exige resolver a chave estável (Parte 3, item 2); mais código | ✅ **Recomendada** |
| **C. Só inserir os novos** | Ignora os existentes; insere apenas o que não está no banco | Mais simples que B; risco quase nulo de perda | Correções feitas na planilha nunca chegam ao banco | ✅ Boa **primeira versão**, se a planilha for só append |
| **D. Relatório de diferenças (dry-run)** | Não escreve nada: só gera um relatório de quantos são novos, alterados e sumidos | Risco zero; mostra o tamanho real do problema | Não resolve sozinho | ✅ **Fazer primeiro, sempre** |

**Caminho definido (2026-07-26):** **D → B**. O dry-run (D) roda sempre antes de qualquer escrita, a cada sincronização, e a sincronização em si é incremental por `FAV + Invólucro` (B) — com a exclusão sendo sempre **lógica** (`deletedAt`) e sempre **precedida de aprovação**.

---

## Parte 5 — Plano de execução proposto (⬜ nada iniciado, nada aprovado)

### ETAPA 0 — Definir a chave de identidade e as regras de exclusão
**Status:** ✅ Concluída em 2026-07-26 — ver Parte 3. Chave: `FAV + Invólucro`. Exclusão: lógica, sempre com aprovação prévia.

### ETAPA 1 — Extrair um snapshot novo (leitura pura, risco zero)
**Status:** ⬜ Não iniciado
Rodar **apenas** `npm run phase2:export`, que só faz `GET` no Apps Script e grava um arquivo local. **Não toca no banco.** Cuidado: sobrescreve `database/sheets-snapshot.json` — fazer cópia do atual antes, que é o retrato de abril e serve de base de comparação.
Saídas: total de linhas hoje vs. 4.600 de abril; verificar se as 7 colunas continuam iguais.

### ETAPA 2 — Relatório de diferenças (dry-run, sem escrita)
**Status:** ⬜ Não iniciado
Script novo, que **não escreve no banco**. É também o coração do que o agente (ETAPA 6) apresenta ao usuário. Deve produzir exatamente os dois relatórios pedidos pelo usuário:

**Relatório 1 — Contagem dos dois lados**
- Total de registros no Drive (linhas do snapshot novo)
- Total de registros na VPS (vestígios ativos, isto é, `deletedAt IS NULL`)
- Quantos são novos (existem no Drive, não na VPS)
- Quantos já existem nos dois
- *Expectativa normal: o Drive sempre terá mais, porque é alimentado diariamente.*

**Relatório 2 — Registros que existem na VPS e não no Drive**
Para cada um, exibir **FAV, Requisição e Material**, conforme pedido. Obrigatoriamente separado em **dois grupos** (ver 3.3):
- Grupo A — `importedFrom = 'google_sheets'`: resíduo provável dos testes de migração; candidatos legítimos a exclusão lógica.
- Grupo B — criados manualmente no EvidenceOS: **provavelmente não são teste**; exigem confirmação individual antes de qualquer coisa.

**Relatório 3 (complementar, de segurança)** — quantos dos registros do Grupo A já possuem dado que só existe no EvidenceOS (estado de conservação preenchido, destinação iniciada, invólucros extras, logs de destinação ou de PCNET). Um registro nessa condição **não é resíduo de teste inofensivo** — alguém trabalhou nele. Deve ser destacado à parte.

Também deve listar as **colisões de chave** (dois itens do Drive com a mesma FAV+Invólucro, ver 3.1) para decisão manual, sem nunca resolvê-las sozinho.

### ETAPA 3 — Resumo de Impacto de Segurança e Auditoria + aprovação explícita
**Status:** ⬜ Não iniciado — **gate obrigatório** (Regra de Ouro do `CLAUDE.md`)
Mexe em 4.600 evidências e em cadeia de custódia. Nenhuma linha de escrita antes da aprovação registrada.

### ETAPA 4 — Corrigir o pipeline
**Status:** ⬜ Não iniciado — depende da ETAPA 3 aprovada
1. Corrigir o bug do campo `involucro` (Problema 1) — passar a gravar em `VestigeInvolucro`.
2. **Remover o `deleteMany`** e implementar a sincronização incremental por `FAV + Invólucro` (abordagem B).
3. Normalizar `x` e `N/I` como vazio ao montar a chave (ver 3.1).
4. Nunca sobrescrever campos que a planilha não conhece: `estadoConservacao`, `destinacao*`, `observacoes`, `tipoMaterial`, autoria e `deletedAt`.
5. Registrar a sincronização em `AuditLog` (quantos inseridos/atualizados/marcados como excluídos, por quem, quando).
6. Ler a nova coluna `situação` da planilha e refleti-la em `deletedAt`.
7. Mover a `APPS_SCRIPT_URL` para variável de ambiente (ver "Observação de segurança" abaixo).
8. Envolver a escrita em transação, para não deixar estado parcial em caso de falha.

### ETAPA 5 — Ensaio em dev, depois produção com backup
**Status:** ⬜ Não iniciado
Rodar primeiro no banco de desenvolvimento. **Backup do banco de produção antes de rodar lá** — e conferir que o backup restaura, porque backup não testado não é backup.
Serviço da VPS: **api** (é quem tem os scripts e a `DATABASE_URL`) — ver a tabela dos 3 serviços no `CLAUDE.md`.

### ETAPA 6 — Criar o agente especializado de sincronização
**Status:** ⬜ Não iniciado — depende do pipeline corrigido (ETAPA 4)

Agente dedicado, acionado sob demanda pelo usuário ("rode a sincronização do Drive"). Fluxo obrigatório, nesta ordem:

1. Exporta o snapshot novo do Apps Script (leitura pura).
2. Roda o **dry-run** da ETAPA 2 e **apresenta os relatórios 1, 2 e 3 ao usuário**.
3. **Para e espera.** Não sincroniza, não exclui, não altera nada sem aprovação explícita.
4. Com aprovação: aplica inserções/atualizações e as exclusões lógicas aprovadas, dentro de transação, registrando tudo em `AuditLog`.
5. Reapresenta o resultado final (quantos inseridos, atualizados, marcados como excluídos).

**Regras invioláveis do agente:**
- Nunca exclusão física — sempre `deletedAt`.
- Nunca excluir sem aprovação explícita, item a item ou lista a lista.
- Nunca misturar registros importados com criados manualmente na mesma lista de exclusão.
- Nunca resolver colisão de chave sozinho.
- Nunca sobrescrever dado do EvidenceOS que a planilha não conhece.
- Sempre reportar antes de agir.

---

## Observação de segurança — a URL do Apps Script

A `APPS_SCRIPT_URL` está **hardcoded no código-fonte** ([`_phase2-common.cjs`](../../server/scripts/_phase2-common.cjs)) e versionada no Git, inclusive no repositório do GitHub.

URLs de Apps Script publicados costumam ficar acessíveis a **qualquer um que tenha o link** ("Qualquer pessoa com o link"). Se for o caso aqui, **qualquer pessoa com acesso ao repositório consegue baixar a base inteira de 4.600 vestígios** — dados de procedimento policial — sem nenhuma autenticação.

Isso contraria a política de segredos do `CLAUDE.md` ("credenciais sempre em `.env.local` ou variáveis de ambiente").

**Ações recomendadas, independentes deste plano:**
1. Verificar no Google Apps Script qual é a permissão de acesso do deployment.
2. Se estiver aberta, restringir e mover a URL para variável de ambiente.
3. Considerar que essa URL já esteve exposta no histórico do Git — remover do código atual **não** a apaga dos commits antigos.

*Levantamento apenas. Nada foi executado, nenhum script foi rodado contra banco nenhum, e nenhum código foi alterado.*

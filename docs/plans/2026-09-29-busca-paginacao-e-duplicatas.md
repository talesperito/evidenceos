# Vestígios invisíveis na busca (paginação) e levantamento de duplicatas

**Data:** 2026-09-29 · **Status:** paginação corrigida e implantada (commit `150f3af`, serviço `api`) · limpeza das duplicatas em andamento, manual, pela equipe · trava contra duplo clique **aguardando aprovação**

---

## 1. O sintoma relatado

Nos testes após a implantação com a equipe, vestígios da aba **Drogas** a partir da linha 521 da planilha (FAV `1344231`) não eram encontrados no app em produção — nem por FAV, nem por invólucro, nem por requisição. Exemplos: `1344231`, `1677036`, `1507014`.

O detalhe que intrigava: **o total de registros batia** com o total de linhas da planilha. O sistema "contava, mas não lia".

## 2. O que foi descartado

| Hipótese | Por que foi descartada |
|---|---|
| Colunas deslocadas, como na aba Munições (`ee54c56`) | Os dois snapshots (abril e setembro) têm essas linhas com os campos no lugar certo |
| Linhas não importadas | As FAVs existem no banco, com os dados corretos |
| Lógica de busca | A comparação em `useVestiges.ts` está correta; o vestígio simplesmente não estava na lista que ela percorre |

## 3. A causa

A busca da tela roda **no navegador**. `fetchAllVestiges` (`client/services/dataService.ts`) baixa **todos** os vestígios em páginas de 500, e o servidor ordenava essas páginas **só por `created_at`** (`server/src/routes/vestigeRoutes.ts`).

A importação gravou os vestígios em lote, dentro de transações. No PostgreSQL, `DEFAULT CURRENT_TIMESTAMP` é o horário do **início da transação** — então blocos inteiros de 500 registros ficaram com o `created_at` **idêntico ao milissegundo**.

Com empate na ordenação, o PostgreSQL não garante a mesma ordem entre uma consulta e outra. `LIMIT 500 OFFSET 500` podia devolver itens que já tinham vindo na página anterior e pular outros. Cada item pulado era substituído por um repetido — por isso **o total fechava exatamente** e nada acusava erro.

Consequências:

- vestígios existentes sumiam da busca por FAV, invólucro e requisição;
- o **relatório** (que usa a mesma lista) contava uns em dobro e outros nenhuma vez — total global certo, contagem por categoria distorcida;
- o conjunto de invisíveis **variava entre consultas**: a FAV `1650761` foi encontrada num print do usuário e aparece na lista de invisíveis estimada para produção.

## 4. Os testes

### Banco local (importação de abril, 4.602 vestígios)

Simulação exata do que o navegador faz (páginas de 500), com e sem desempate:

| Ordenação | Total | Recebidos | Distintos | Invisíveis |
|---|---|---|---|---|
| `created_at` (antiga) | 4.602 | 4.602 | 4.575 | **27** (e 27 repetidos) |
| `created_at`, `id` (nova) | 4.602 | 4.602 | 4.602 | **0** |

Os 27 estavam espalhados por 6 categorias (Drogas 11, Balanças 7, Biológicos 6, Armas Branca, Diversos e Vestuário 1 cada). A mesma medição feita em SQL puro reproduziu exatamente os mesmos 27 IDs.

### Produção (5.311 vestígios, medido pelo usuário no console do `api`)

Pela ordem antiga, **385 vestígios (7,2% da base)** ficavam invisíveis; pela ordem atual, **0 em todas as categorias**.

| Categoria | Invisíveis (ordem antiga) |
|---|---|
| Drogas | 192 |
| Armas Branca | 116 |
| Materiais Monetários | 35 |
| Balanças | 25 |
| Carregadores munição | 14 |
| Informática, Ferramentas, Químicos | 1 cada |

Nenhuma categoria estava imune: quase todo vestígio importado divide o `created_at` com outros. Quais sumiam dependia do plano de execução de cada consulta.

Reproduzir: `node scripts/verificar-paginacao.cjs` (console do `api`, só leitura).

## 5. A correção — commit `150f3af`

`id` como desempate em toda listagem paginada com `OFFSET`:

| Arquivo | Antes | Depois |
|---|---|---|
| `server/src/routes/vestigeRoutes.ts` (`GET /` e `GET /search`) | `{ createdAt: 'desc' }` | `[{ createdAt: 'desc' }, { id: 'asc' }]` |
| `server/src/routes/auditRoutes.ts` (Logs de Auditoria) | `{ createdAt: 'desc' }` | `[{ createdAt: 'desc' }, { id: 'asc' }]` |
| `server/src/routes/withdrawalRoutes.ts` (Retiradas Agendadas) | `{ scheduledFor: 'asc' }` | `[{ scheduledFor: 'asc' }, { id: 'asc' }]` |

Auditoria e retiradas não tinham sintoma relatado, mas tinham o mesmo defeito latente — retiradas no mesmo horário são comuns, e uma entrada de auditoria pulada na paginação é pior que um vestígio fora da busca.

- Só muda a **ordem de leitura**. Nenhum dado alterado, nenhuma migration.
- Implantação: **api** reimplantado; **web** e **db** sem ação.
- Validação em produção: as FAVs `1344231`, `1677036` e `1507014` passaram a ser encontradas (confirmado pelo usuário), e `verificar-paginacao` deu **0 invisíveis**.

**Regra para o futuro:** toda paginação com `skip`/`OFFSET` precisa terminar a ordenação numa coluna única. Ordenar só por data, status ou nome é um bug esperando dados com empate.

## 6. Efeito colateral: duplicatas

Com vestígios invisíveis, a equipe buscava, não encontrava e **cadastrava de novo**. Entre 11/09 e 25/09, 12 cadastros feitos pelo app (Cristiane Santos) repetem FAVs que já existiam vindas da planilha. Um deles é a `1650761`, recadastrada em 21/09 — justamente uma das FAVs que o bug escondia.

Somam-se a isso as duplicatas herdadas da planilha (linha lançada duas vezes; troca de lacre lançada como linha nova).

### Levantamento em produção (2026-09-29)

**442 vestígios em 218 grupos**, classificados pela lógica que hoje mora em `server/scripts/conferencia-dados.cjs` (função `repetidos`):

| Seção | Grupos | O que é | Ação sugerida |
|---|---|---|---|
| A | 40 | Mesma FAV, mesmo conteúdo | 23 apagar direto; 17 conferir município/data no PCNET antes |
| B1 | 80 | Troca de lacre lançada como linha nova | Adicionar o invólucro antigo ao registro com requisição, depois apagar o outro |
| B2 | 49 | Mesma FAV e categoria, outras diferenças | Conferir no PCNET |
| B3 | 10 | FAV da planilha recadastrada no app | Conferir; se for o mesmo objeto, juntar num registro |
| B4 | 11 | Mesma FAV em categorias diferentes | Em geral objetos distintos: manter |
| C | 28 | Mesmo invólucro em FAVs diferentes | FAV digitada errada ou duplicata: conferir |

Em cada grupo, fica o registro com histórico (destinação, retirada ou ação no PCNET); depois o mais antigo; depois o id. O critério é fixo: rodar de novo depois de uma rodada de limpeza devolve as mesmas escolhas.

**Por que B1 não é "apagar":** o registro sem requisição carrega o invólucro antigo. Apagá-lo direto faz o vestígio perder um elo da cadeia de custódia. O invólucro vai para o registro que fica, com motivo "Rompimento de lacre para exame" ou "Correção de cadastro", e só então o outro é apagado.

### Como a lista virou planilha

O console do Easypanel não tem download e o chat corta mensagens longas. A saída foi compactar:

1. No console do `api`, um comando imprimiu a lista em gzip+base64 (~16 mil caracteres para 443 linhas), com contagem de linhas e hash no rodapé.
2. O bloco foi colado no chat e salvo num `.txt` local.
3. Um script local conferiu a integridade (recusa se contagem ou hash divergirem) e gerou o Excel: aba de instruções, aba com a lista, filtro, cores por ação e colunas para a técnica preencher.

A planilha de 2026-09-29 foi entregue ao usuário para a técnica. **Não é versionada** — tem dados de custódia.

Esse caminho virou rotina em 2026-10-08: o comando e o gerador daquele dia foram absorvidos por `server/scripts/conferencia-dados.cjs` e `scripts/gerar-planilha-conferencia.py`, conduzidos pelo agente `conferente-vestigios`. Ver `docs/plans/2026-10-08-conferente-vestigios-design.md`.

A limpeza é **manual, pela tela**, de propósito: a tela grava `deletedAt` e registra o operador nos Logs de Auditoria. Nenhum script apaga ou funde vestígios.

## 7. Achado pendente: duplo clique no cadastro — AGUARDA APROVAÇÃO

A FAV `2327575` foi cadastrada **duas vezes, pela mesma pessoa, no mesmo minuto** (16/09 13:16).

Causa em `client/components/VestigeFormModal.tsx` (`handleSubmit`): ao salvar, a tela primeiro chama `checkDuplicate` no servidor, e **durante essa chamada o botão continua habilitado** — `isSaving` só é ligado depois, em `performSave`. Um segundo clique nessa janela passa pela mesma checagem; as duas respondem "sem duplicata" (nenhum dos dois existe ainda) e os dois são gravados.

Correção proposta, **não aplicada**: trava síncrona (`useRef`) ligada no primeiro instante do `handleSubmit`, antes da checagem de duplicata, liberada só em caso de erro. Só `client/` — deploy do **web**. Não altera dados, auditoria nem a checagem de duplicata.

Enquanto não entrar, novas duplicatas desse tipo podem surgir durante a limpeza das antigas.

## 8. Outros achados de dados (não relacionados ao bug)

- **FAV `17366596`** (Balanças): 8 dígitos, fora da faixa das FAVs da base (até ~2,3 milhões). Provável erro de digitação.
- **FAV gravada como `x`** num vestígio de Armas Branca: o literal da planilha para "não informado". Nunca será encontrado por FAV.
- **Invólucro `1`** em três vestígios de FAVs diferentes (grupo C): placeholder, não número real.
- **Requisição com zero à esquerda:** `049199299` e `49199299` são o mesmo número, mas a busca numérica compara por igualdade exata (`useVestiges.ts`) — buscar um não encontra o outro. Candidato a normalização na busca.

## 9. Pendências

| | Item | Onde |
|---|---|---|
| 🔴 | Trava contra duplo clique no cadastro (seção 7) | `client/`, deploy do **web** — aguarda aprovação |
| 🟡 | Limpeza das 218 duplicatas pela tela | equipe, com a planilha |
| 🟡 | Busca ignorar zero à esquerda em requisição/invólucro | `client/hooks/useVestiges.ts` |
| 🟡 | Relatórios emitidos antes de 2026-09-29 podem ter contagem por categoria distorcida | reemitir se algum foi enviado para fora |
| ⚪ | Busca no servidor em vez de baixar a base inteira no navegador | a rota `GET /api/vestiges/search` já existe; hoje a tela baixa ~5.300 registros a cada busca |

## 10. Como repetir as verificações

Todos os comandos rodam no **console do serviço `api`** (Easypanel), em `/app`, e são **só leitura** (sessão com `default_transaction_read_only = on`):

```sh
node scripts/verificar-paginacao.cjs          # invisíveis por categoria, ordem antiga × atual
node scripts/conferencia-dados.cjs            # resumo: repetidos e os demais problemas de dados
node scripts/conferencia-dados.cjs --bloco    # relatório completo compactado, para gerar a planilha
```

Os scripts só existem no container depois do próximo deploy do `api` que os inclua.

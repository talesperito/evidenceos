# Conferente de vestígios: conferência periódica dos dados

**Data:** 2026-10-08 · **Status:** aprovado ("pode ser o 1", com a exigência de relatório completo em CSV ou Excel) e implementado · testado no banco local · **ainda não rodou em produção** (os scripts só existem no container depois de um deploy do `api`)

Origem: `docs/plans/2026-09-29-busca-paginacao-e-duplicatas.md`.

## 1. Objetivo

Rodar, de tempos em tempos, uma conferência que encontre vestígios repetidos, com dados incompletos ou com dados que o sistema aceita mas que indicam erro, e entregar **um relatório completo em planilha**: uma linha por problema, com o vestígio, o campo a corrigir e a ação sugerida.

A correção continua manual e pela tela, de propósito: é a tela que grava quem alterou nos Logs de Auditoria.

## 2. Decisão

| Caminho | Por que não (ou por que sim) |
|---|---|
| **1. Agente + script de leitura** (escolhido) | Barato, não muda nada do que a equipe usa, e deixa descobrir quais testes servem antes de fixá-los numa tela |
| 2. Tela "Conferência de dados" para ADMIN | Elimina o passo manual, mas é código de produção (rota, permissão, tela) e congela as regras cedo demais. Candidato para depois de duas ou três rodadas |
| 3. Restaurar o backup diário na máquina local | Dá acesso total ao agente, mas põe a base inteira, com os hashes de senha, no computador de desenvolvimento |

Dois princípios do desenho:

- **Quem detecta é um script, não o agente.** As regras são determinísticas e devolvem sempre o mesmo resultado. Um modelo comparando 5.300 linhas "no olho" erraria sem avisar. O agente conduz a rodada, compara com a anterior e explica.
- **O agente não enxerga a produção.** Cada rodada tem um passo manual: o usuário roda um comando no console do `api` e cola a saída num arquivo local.

## 3. As três peças

| Peça | Onde roda | O que faz |
|---|---|---|
| `server/scripts/conferencia-dados.cjs` | console do `api` (só leitura) | Aplica as regras e imprime o resumo, o CSV ou o bloco compactado |
| `scripts/gerar-planilha-conferencia.py` | máquina local | Confere a integridade do bloco, compara com a rodada anterior, aplica o que já foi conferido, gera Excel e CSV |
| `.claude/agents/conferente-vestigios.md` | Claude Code | Conduz os dois tempos da rodada, faz as conferências que dependem do código e relata |

Fluxo: `conferencia-dados.cjs --bloco` → colar em `database/conferencias/entrada.txt` → `gerar-planilha-conferencia.py gerar` → planilha para a técnica → planilha devolvida → `gerar-planilha-conferencia.py conferidos`.

## 4. As regras

| Aba | Regra | Certeza |
|---|---|---|
| Repetidos | Mesma FAV e mesmo conteúdo | Certo |
| | Troca de lacre lançada como registro novo | Provável |
| | Mesma FAV e categoria, com dados diferentes | Conferir |
| | FAV antiga cadastrada de novo no app | Conferir |
| | Mesma FAV em categorias diferentes | Provável legítimo |
| | Mesmo invólucro em FAVs diferentes | Conferir |
| Incompletos | Sem data de entrada, sem FAV, sem material, sem município, sem invólucro | Certo |
| Formato suspeito | FAV fora do padrão | Provável |
| | Invólucro fora do padrão; requisição fora do padrão | Indício |
| | Data de entrada impossível (futuro, ou ano anterior a 2000) | Certo |
| | Município fora da lista da unidade | Conferir (Provável se for só grafia) |
| Campos trocados | FAV igual ao invólucro; mesmo número no invólucro e na requisição | Provável |
| | Data de entrada posterior ao cadastro (só cadastros do app) | Provável |
| | FAV e data não combinam | Indício |
| Auditoria e retiradas | Cadastro, edição ou exclusão sem registro nos Logs de Auditoria | Conferir |
| | Retirada agendada vencida há mais de um dia e ainda aberta | Certo |
| Munições (em lote) | Aba Munições com colunas deslocadas | Certo |

Na aba Repetidos, quando as cópias foram cadastradas pelo mesmo operador com até dois minutos de diferença, a observação acrescenta "provável duplo clique".

### O que não é tratado como erro, de propósito

- **Vestígio sem requisição.** É situação de negócio, com acompanhamento próprio.
- **A mesma requisição em FAVs diferentes.** Uma requisição cobre vários objetos.
- **Data antiga em FAV recente.** Ver a calibragem abaixo.
- **Registros da aba Munições** nas regras comuns. Eles disparariam três regras cada um; ficam numa aba só, com a instrução de não corrigir à mão, porque há correção em lote preparada e pausada (`corrigir-municoes.cjs`).

### Calibragem (banco local, importação de abril, 4.602 vestígios)

- **Padrões medidos:** FAV com 5 a 7 dígitos (4.583 de 4.602); invólucro com 7 dígitos (4.174) ou letra + 9 dígitos (24); requisição com 8 dígitos (2.970) ou 9 começando com zero.
- **Invólucro "curto" não é regra.** Os 96 invólucros de menos de 5 caracteres eram quase todos "-" ou "X": isso é vestígio sem invólucro, não formato errado.
- **FAV × data só numa direção.** A ideia inicial (data distante da das FAVs de número próximo) marcou 258 vestígios, e 214 deles tinham a data **antes** das vizinhas. Pela amostra, é o padrão de material de 2009 a 2015 que só ganhou FAV no PCNET em 2023, e não erro. Ficou só "data mais de 365 dias **depois** da mediana das 20 FAVs vizinhas", que marca 23 e acerta a causa: FAVs de 6 dígitos com data de 2025 (`183332`, `178306`, `169546`), quando as FAVs de 2025 têm 7 dígitos. É dígito faltando.
- **Edição sem log** exclui vestígios de retirada concluída: a conclusão grava `updated_by` e tem log próprio (`WITHDRAWAL_COMPLETED`).
- **Exclusão sem log** só olha exclusões a partir do marco inicial (2026-09-11): antes dele, o `sync-apply` gravava um único log `SYNC_DRIVE` para o lote.

Os três testes de auditoria deram zero no banco local examinando registros reais (2 cadastros, 2 edições, todos com log). Não foi zero por olhar para o vazio.

## 5. O bloco

O console do Easypanel não tem download, então o relatório sai como texto compactado (JSON em gzip + base64, linhas de 100 caracteres).

- **Integridade:** cada parte carrega o hash do conteúdo inteiro. O gerador recusa bloco truncado, com linha faltando ou com parte ausente, e não grava nada nesse caso.
- **Tamanho:** cada vestígio e cada texto de regra entram uma vez só, e o id vai encurtado para 12 caracteres (aumenta sozinho se dois vestígios da base coincidirem nesse trecho). Com isso, os 1.040 achados do banco local cabem em cerca de 440 linhas (eram 600).
- **Partes:** acima de 600 linhas o bloco se divide, e o script diz quais comandos rodar em seguida. `--linhas-por-parte N` diminui o tamanho quando o terminal corta o começo.
- **Sobra antiga no arquivo:** vale sempre a execução mais recente. Uma sobra antiga completa nunca substitui uma rodada nova incompleta: o relatório sairia com dados velhos sem ninguém notar.

## 6. Histórico e marcações

Tudo em `database/conferencias/<unidade>__<banco>/`, fora do Git:

- `rodadas/<carimbo>.json`: o conteúdo de cada rodada. É a base de "Novo", "Já estava" e da aba "Resolvidos".
- `marcacoes.json`: o que a técnica marcou na coluna Conferência.
- `saida/`: Excel e CSV. `blocos/`: as entradas já processadas.

A pasta leva o nome do banco para um teste local não virar a "rodada anterior" da produção.

| Marcação | Efeito na rodada seguinte |
|---|---|
| Conferido - está certo | O achado sai das abas e passa a constar em "Já conferidos". Nada some em silêncio, e `desfazer --fav` traz de volta |
| Corrigido | Se o achado continuar aparecendo, vem como "Marcado como corrigido, mas continua" |

A marcação vale enquanto o que a técnica viu não mudar: num grupo de repetidos, o conjunto de registros do grupo (se entrar um terceiro, o grupo volta); nas demais regras, o valor apontado. O número do grupo (`A-016`) não serve de chave, porque muda quando outros grupos são resolvidos.

## 7. O que o script do servidor não consegue conferir

Se a correção da paginação (commit `150f3af`) continua no código. O script roda dentro do banco e não enxerga as rotas; medir "quantos ficariam invisíveis com desempate" é sempre zero e não prova nada. O agente confere no repositório que as consultas paginadas de `vestigeRoutes.ts`, `auditRoutes.ts` e `withdrawalRoutes.ts` terminam a ordenação em `id`. O `verificar-paginacao.cjs` continua disponível para medir a exposição.

## 8. Unidades

O plano de Campo Belo (`2026-10-08-unidade-campo-belo-design.md`) prevê uma instância por unidade, escolhida por `UNIT`. O script já lê `UNIT` (sem ela, assume `lavras`, que é a realidade de hoje) e guarda num bloco só o que é próprio de cada unidade: lista de municípios, data do marco inicial e a regra de Munições. Numa unidade sem bloco próprio, essas três regras não rodam e o resumo diz isso. Quando existir `server/src/config/unit.ts`, a lista de municípios deve vir de lá.

Por ser só leitura, o script não precisa da trava por unidade que o plano de Campo Belo põe nos scripts de escrita.

## 9. Resumo de Impacto de Segurança e Auditoria

- **Escrita no banco:** nenhuma. A sessão abre com `default_transaction_read_only = on`.
- **Código em uso pela equipe:** não muda. Entra um script em `server/scripts/`; rotas, autenticação e tela ficam como estão.
- **Dados de custódia:** blocos, histórico e planilhas ficam em `database/conferencias/`, incluído no `.gitignore`. A planilha traz nome de quem cadastrou: circula só por canal institucional.
- **Agente:** sem ferramenta de escrita em arquivos do projeto e proibido de rodar os scripts que alteram dados.
- **Implantação:** deploy do **api** para o script existir no container. **web** e **db** sem ação. Sem migration.

## 10. Testes feitos (banco local)

| Teste | Resultado |
|---|---|
| Repetidos contra a lógica validada em 29/09 | Os mesmos 418 registros nos mesmos grupos |
| Bloco colado com espaços a mais | Integridade confere |
| Três partes coladas fora de ordem | Aceito |
| Parte faltando; bloco cortado; uma linha perdida; arquivo vazio | Recusado com a instrução do que refazer; nada gravado |
| Sobra antiga completa + rodada nova incompleta | Recusado |
| Mesma execução copiada duas vezes com tamanhos de parte diferentes | Aceito |
| Segunda rodada com 5 achados a mais, 1 a menos, 3 aceitos e 1 "corrigido" que continua | 5 novos, 1 resolvido, 3 ocultos, 1 cobrado |
| Fórmulas do resumo | Todas apontam para as colunas de mesmo nome; totais esperados conferidos por contagem direta |

## 11. Limites e pendências

- **Primeira rodada em produção ainda não feita.** Os limiares foram calibrados com os dados de abril; em produção os números serão outros e alguma regra pode precisar de ajuste.
- **As fórmulas da planilha não foram recalculadas** aqui (sem LibreOffice na máquina). São `COUNTIF`/`COUNTIFS`, e o arquivo pede recálculo ao abrir.
- **Não se sabe quantas linhas o terminal do Easypanel guarda.** Se o começo do bloco sumir, usar `--linhas-por-parte`.
- **A conferência só acha o que os dados denunciam.** Um município válido, mas errado, passa. Não substitui o PCNET nem a prateleira.
- **Regra nova ou falso positivo** se resolve no script, com teste e novo deploy do `api`. O agente não improvisa regra.

## 12. Como rodar

Pedir ao Claude Code: "rodar a conferência dos vestígios". Ou, à mão:

```sh
# console do serviço api, em /app
node scripts/conferencia-dados.cjs            # resumo
node scripts/conferencia-dados.cjs --bloco    # relatório completo, para colar em database/conferencias/entrada.txt

# máquina local, na raiz do projeto
python scripts/gerar-planilha-conferencia.py gerar database/conferencias/entrada.txt
python scripts/gerar-planilha-conferencia.py conferidos "<planilha devolvida pela técnica>"
```

Frequência sugerida: semanal enquanto durar a limpeza das duplicatas, mensal depois, e sempre após uma operação em lote.

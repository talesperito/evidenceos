# Múltiplas requisições + motivo de inclusão (invólucro e requisição)

**Data:** 2026-09-10 · **Status:** aprovado ("pode executar") e implementado

## Problema

O vestígio já aceitava vários invólucros (divisão em embalagens, troca de lacre), mas só **uma** requisição — e é comum o mesmo vestígio ter dois exames distintos, com duas requisições. Além disso, nada registrava **por que** um invólucro ou requisição foi incluído.

Dois defeitos no código anterior tornavam isso inviável:

1. A edição **apagava e recriava** todos os invólucros (`deleteMany` + `create`). Qualquer dado guardado no item sumiria na primeira edição, e um invólucro rompido podia ser apagado sem rastro.
2. A auditoria da edição gravava só a lista nova, sem a anterior.

## Regras de negócio (definidas pelo usuário)

- **O item guarda só número + motivo.** Sem data, sem nome, sem observação, sem vínculo "substitui X". Quem rompeu o lacre, quando e para quê fica na **FAV do PCNET** — repetir aqui gera confusão.
- **Cadastro:** aceita vários invólucros e várias requisições (é muito comum). Todos entram como **Registro inicial**, sem pergunta.
- **Edição:** incluir um item novo exige escolher o motivo. Itens já gravados aparecem fixos (número não se edita); para corrigir, remove-se e inclui-se com "Correção de cadastro".
- **Remoção:** botão simples, sem pergunta. Por dentro é **remoção lógica** (`removed_at`) — o registro nunca é apagado.
- **Troca de lacre:** o invólucro antigo continua na lista; o novo entra embaixo. A ordem mostra qual é o atual.

### Motivos

| Invólucro | Requisição |
|---|---|
| Divisão do material (`DIVISAO_MATERIAL`) | Novo exame pericial (`NOVO_EXAME`) |
| Rompimento de lacre para exame (`ROMPIMENTO_LACRE`) | Exame complementar (`EXAME_COMPLEMENTAR`) |
| Embalagem danificada (`EMBALAGEM_DANIFICADA`) | Reiteração/substituição pela autoridade (`REITERACAO_AUTORIDADE`) |
| Correção de cadastro (`CORRECAO_CADASTRO`) | Correção de cadastro (`CORRECAO_CADASTRO`) |

Automáticos, nunca escolhidos na tela: `REGISTRO_INICIAL` (cadastro) e `LEGADO` (tudo o que existia antes, e o que os scripts de importação gravam). Não há "Outro": sem campo de texto ele não diria nada — caso novo entra na lista.

A lista existe em dois lugares, que precisam ficar iguais: `server/src/services/vestigeItemService.ts` (validação) e `client/types.ts` (rótulos).

## Implementação

**Banco** — migration `20260910_0001_add_vestige_requisicoes_e_motivo`:
- `vestige_involucros` ganha `motivo` (default `LEGADO`) e `removed_at`.
- Nova tabela `vestige_requisicoes`, mesmo formato.
- Backfill: a requisição de cada vestígio (inclusive excluídos) vira uma linha `LEGADO`, com o valor como está.
- A coluna `vestiges.requisicao` **não foi removida**: fica congelada como cópia de segurança, mapeada no Prisma como `requisicaoLegado` para que nenhum código a use por engano.

**API** (`vestigeRoutes.ts`):
- Invólucros e requisições trafegam como `{ numero, motivo }[]`.
- `POST`: ignora o motivo enviado e grava tudo como `REGISTRO_INICIAL`.
- `PUT`: o servidor compara a lista enviada com os itens ativos (`planUpdate`). Número que sumiu → `removed_at`; número novo → inclusão com motivo obrigatório; número existente → intocado. Tudo numa transação. Vestígio excluído logicamente → 404.
- Números novos só com dígitos (antes a regra existia só na tela). Legado fora do padrão não é revalidado.
- Auditoria do `UPDATE` grava `antes`, `depois`, `incluidos` e `removidos` de cada lista que mudou.
- **Trava de bundle antigo:** payload com `requisicao` (texto) ou invólucros como strings recebe 400 pedindo `Ctrl+Shift+R`. Sem isso, a tela em cache gravaria vestígios sem requisição, em silêncio, durante a janela entre o deploy do `api` e o do `web`.
- Busca, alerta de duplicata e listagens consideram só itens ativos.

**Tela:** formulário com lista dinâmica para as duas coisas (motivo só na edição, para itens novos); confirmação de edição mostra os incluídos com o motivo; card, solicitação de retirada, prompt da IA e indicador "sem requisição" passam a usar a lista.

## Implantação

| Serviço | Ação |
|---|---|
| **api** | Reimplantar. Depois, no console do serviço `api`: `cd /app && npx prisma@7.7.0 migrate deploy` |
| **web** | Reimplantar. Depois, `Ctrl+Shift+R` no navegador |
| **db** | Nenhuma ação |

Ordem: `api` (com a migration) e `web` em seguida. Até o `web` subir, quem salvar com a tela antiga recebe a mensagem para recarregar — nada é gravado pela metade.

**Conferência:** editar um vestígio incluindo uma requisição com motivo e ver em Logs de Auditoria o `UPDATE` com `requisicoes.incluidos`. Para o backfill, as consultas de contagem estão no fim da migration.

## Pendências

- **Remover a coluna `vestiges.requisicao`** em migration futura, depois de conferir as contagens em produção.
- **`server/scripts/corrigir-municoes.cjs` (ainda não executado) precisa ser adaptado antes de rodar.** Ele lê e grava `vestige.requisicao` e apaga/recria invólucros. Depois do backfill, os 403 vestígios da aba Munições têm uma requisição `LEGADO` com a natureza da munição ("Necropsia" etc.) — o script tem de substituir esse item em `vestige_requisicoes`. Hoje ele falha com erro do Prisma antes de gravar qualquer coisa.
- `cadastrar-favs-pendentes.cjs` e `_phase2-common.cjs` são históricos (já executados) e também falham com erro explícito se rodados de novo. Os scripts de sincronização (`_sync-common`, `sync-dryrun`, `sync-apply`) foram adaptados.

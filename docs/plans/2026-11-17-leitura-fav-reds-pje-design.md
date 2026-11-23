# Leitura das FAVs no PCNET: REDS e Nº PJe

**Data:** 2026-11-17 · **Revisado:** 2026-11-23 (leitura por linha, texto bruto guardado, piloto ao vivo) ·
**Status:** plano, sem execução · nada implementado

Origem: pedido de 17/11 (item 3: "integrar com o PCNET, da mesma forma que ele faz hoje, via URL, mas lendo outros
dados"). Relaciona-se com `docs/plans/2026-07-24-integracao-pcnet.md` (botões "Ver FAV" e "Movimentar") e com o plano
de Campo Belo (`docs/plans/2026-10-08-unidade-campo-belo-design.md`, versão do ramo `campobelo`). A decisão D13 daquele plano (REDS como lista) **foi substituída** pela P6 deste.

> **FAVs de amostra (para quem for analisar ou testar a leitura):** estão em **`c:\tmp\pcnet-favs-amostra\`**, fora
> do repositório, e não na raiz do projeto, onde foram entregues em 17/11. São 7 arquivos, cada um com o número da
> FAV no nome: `FAV2351072.pdf`, `FAV2397628.pdf`, `FAV2399621.pdf`, `FAV2406799.pdf`, `FAV2408071.pdf`,
> `FAV2317127.pdf` e `FAV2200920.pdf` (as duas últimas, entregues direto na pasta em 23/11, têm dois REDS). Os SHA-256
> dos 5 primeiros foram conferidos depois da cópia. Os arquivos contêm nomes, matrículas e uma senha de aparelho:
> - leia só o texto, nesta máquina;
> - não copie para o repositório, para `docs/` ou para a planilha;
> - não cite nomes no plano ou nas respostas.
>
> Para ler: `python -E -P <script> <caminho do pdf>`. Não use `-I`: com essa opção o Python não acha o módulo `fitz`
> (PyMuPDF), que está instalado no site-packages do usuário. Se a pasta estiver vazia, os arquivos já foram apagados
> (seção 5.4); peça novas amostras ao usuário em vez de procurar em outro lugar.

## 1. Objetivo

Para cada vestígio de Lavras que tem FAV, abrir a FAV no PCNET, ler dois números do cabeçalho e trazê-los para o
EvidenceOS:

- **Nº REDS**: sempre presente na FAV.
- **Nº PJe**: só aparece nas FAVs mais novas. Quando não existir, fica vazio.

Antes de qualquer gravação, o resultado sai numa **planilha para conferência**. Ela também alerta as FAVs com mais de
uma requisição e compara as requisições da FAV com as do EvidenceOS.

## 2. Decisões

| # | Assunto | Decisão | Situação |
|---|---|---|---|
| P1 | Nº PCnet | **Fora do escopo.** O número varia muito e dá erro; não é lido nem gravado | Definido pelo usuário em 17/11 |
| P2 | REDS | Lido do cabeçalho da FAV, formato `AAAA-NNNNNNNNN-SSS` (ano com 4 dígitos, 9 dígitos, sequência `001`, `002`…). Gravado completo, com ano e sequência | Definido em 17/11 |
| P3 | Nº PJe | Lido do cabeçalho quando existir. Guardado com os 20 dígitos, sem pontuação; a tela mostra formatado (`NNNNNNN-DD.AAAA.J.TR.OOOO`) | "ok" do usuário em 17/11 |
| P4 | PJe ausente | Na planilha aparece **"Não informado"** (não "XXX"). No banco o campo fica **vazio**, para não entrar em buscas e contagens como se fosse um número. A tela mostra "Não informado" | Definido em 17/11 |
| P5 | Quantos vestígios por número | **REDS e PJe se repetem entre vestígios**: uma ocorrência e um processo costumam ter vários vestígios. Nenhum dos dois é exclusivo e repetição **não é duplicata**. A única regra de exclusividade é **uma FAV por vestígio** | Definido pelo usuário em 17/11 |
| P6 | Um REDS por vestígio | **Campo simples**, como o PJe: cada vestígio guarda **um** REDS. Quando a FAV trouxer dois, grava-se **o primeiro** (o da esquerda); a planilha mostra os dois e alerta. Vale para as duas unidades e substitui a D13 de Campo Belo (lista de REDS) | Campo simples: 17/11. "Qualquer um serve, adote um padrão": 23/11 |
| P7 | PJe por vestígio | Um campo simples: cada vestígio tem no máximo um PJe, que pode ser o mesmo de muitos outros vestígios | Decorre de P3 e P5 |
| P8 | Requisições | A planilha tem espaço para **até 5 requisições** por FAV e **alerta** as FAVs com mais de uma. Mostra também quais requisições da FAV não estão no EvidenceOS. **Não são gravadas** por este plano | Até 5 e alerta: 17/11. Só na planilha: 23/11 |
| P12 | REDS fora do padrão | **Na tela:** aviso, sem bloquear a gravação. **Na importação:** não grava; a linha vai para o relatório de erros (aba **Erros**, 5.5) | Definido em 23/11 |
| P13 | REDS obrigatório | **Obrigatório no cadastro de vestígio novo** a partir do deploy. Na edição de vestígio antigo ainda sem REDS, não bloqueia. Todo vestígio que terminar a importação sem REDS (sem FAV, FAV sem REDS, REDS fora do padrão, erro de leitura) entra no mesmo relatório de erros | Definido em 23/11 |
| P14 | Novas leituras | **Não haverá.** Depois do deploy, REDS e PJe são digitados no cadastro dos vestígios novos. PJe que surgir depois num vestígio antigo é lançado à mão, pela tela | Definido em 23/11 |
| P15 | Navegador | **Firefox** (o usuário usa o Mozilla com o PCNET). O Playwright usa o Firefox dele próprio, instalado uma vez, em janela e perfil separados do Firefox do dia a dia | Definido em 23/11 |
| P9 | Origem da lista de FAVs | Backup recente de Lavras restaurado num Postgres descartável neste PC. **A produção não é consultada** | "ok" em 17/11 |
| P10 | Login no PCNET | O usuário entra à mão no navegador que o script abre. O script nunca vê usuário, senha ou código | "ok" em 17/11 |
| P11 | Quais FAVs | Todas as de Lavras, inclusive de vestígios já retirados | "ok" em 17/11 |

> **Dois REDS (resolvido em 23/11):** o usuário conferiu que qualquer um dos dois serve e pediu um padrão. Grava-se o
> **primeiro**. A escolha fica num parâmetro único (`REDS_ESCOLHIDO = 1`), usado pelo leitor (5.3), pelo gerador da
> importação (7.1) e pelo importador de Campo Belo, e não espalhada pelo código.

Continua valendo a premissa de 24/07: **o EvidenceOS (backend) nunca guarda, recebe ou manipula login, senha ou sessão
do PCNET**. A leitura roda num script local, no computador do usuário, com a sessão dele.

## 3. O que as FAVs mostram

Conferido em 7 FAVs reais, extraindo o texto com PyMuPDF. As duas últimas (`FAV2317127.pdf` e `FAV2200920.pdf`,
entregues em 23/11) são os modelos de FAV com dois REDS.

- O PDF é gerado pelo PCNET no momento em que é pedido (iText 5.5.3; data de criação igual à hora do download).
  Ler a FAV é ler a situação atual.
- O PDF tem texto pesquisável; não é imagem. Não precisa de OCR.
- O cabeçalho da página 1 tem três linhas seguidas: `Nº PCnet:`, `Nº REDS:` e `Nº PJe:`. Quando o número não existe,
  o rótulo continua lá e o valor fica em branco. **A posição na página muda de uma FAV para outra:** nas 5 primeiras
  os rótulos estão em x ≈ 68 e y ≈ 143/161/179; nas duas FAVs com dois REDS (2 e 3 páginas) estão em x ≈ 139 e
  y ≈ 143/167/191.
  O leitor procura o rótulo e lê o que está na altura dele; nunca usa coordenada fixa.
- Logo abaixo vêm `FICHA DE ACOMPANHAMENTO DE VESTÍGIO N.º: 00NNNNNNN` (FAV com 9 dígitos, zeros à esquerda),
  `Número/Descrição invólucro atual:` e `Exame pericial (nº requisição):`.
- Requisições vêm como `2026-059354601` (ano + 9 dígitos). Mais de uma, **separadas por vírgula** na mesma linha. Com
  5 requisições a linha pode quebrar; a leitura junta as linhas até a seção `COLETA`.
- **PJe** é o número único de processo do CNJ (20 dígitos). Ele tem **dígito verificador** (módulo 97), conferido nas
  quatro FAVs que o tinham. Os 4 últimos dígitos são o código da comarca (`0382` Lavras; `0080` e `0236` outras).
- **Dois REDS**: nas duas FAVs-modelo aparecem **na mesma linha, separados só por espaço**, sem vírgula.
  - FAV 2317127: dois REDS diferentes (`2026-038416566-001  2026-045010560-001`).
  - FAV 2200920: o **mesmo** REDS com duas sequências, **a 002 antes da 001** (`2025-054543092-002
    2025-054543092-001`), e de ano diferente do PCnet. A ordem impressa não segue a sequência; pela regra P6 grava-se
    o que vem primeiro na linha (aqui, o `-002`). O usuário confirmou que qualquer um dos dois serve.
  - Se outra FAV trouxer vírgula ou quebra de linha, o texto bruto guardado (5.4) permite corrigir a regra e
    reprocessar sem baixar as FAVs de novo.
- Uma das FAVs (veículo) não tinha PCnet nem unidade de origem, e o invólucro era `X`, mas tinha REDS.
- O PDF traz nomes, matrículas e, na descrição do material, às vezes senhas de aparelhos. Por isso **os PDFs não são
  guardados** (seção 5.4).
- Os caracteres acentuados saem trocados na extração (fonte sem tabela Unicode), mas os números saem limpos. As
  expressões de leitura não dependem dos acentos.

| Caso | REDS | PJe | Requisições |
|---|---|---|---|
| A | presente | vazio | 1 |
| B | presente | vazio | **2** (alerta) |
| C | presente | presente, DV ok | 1 |
| D (veículo, sem PCnet) | presente | vazio | 1 |
| E | presente | presente, DV ok | 1 |
| F (2 páginas, layout deslocado) | **dois**, na mesma linha (alerta; grava o 1º) | presente, DV ok | 1 |
| G (3 páginas, layout deslocado) | **dois**, mesmo número com `-002` e `-001` (alerta; grava o 1º, `-002`) | presente, DV ok | **2** (alerta) |

## 4. Visão geral das etapas

| Etapa | Onde roda | Toca a produção? | Resultado |
|---|---|---|---|
| A. Lista de FAVs | este PC, backup restaurado | Não | `lista-favs.csv` |
| B. Leitura no PCNET | este PC, navegador com login do usuário | Não | resultado bruto, retomável |
| C. Planilha e conferência | este PC | Não | `.xlsx` para o usuário conferir |
| D. Estrutura no EvidenceOS | código + migration, ensaiados no backup restaurado | Só no deploy (backup antes) | campos REDS e PJe na tela |
| E. Gravação | console do `api` de Lavras | **Sim**, com auditoria | REDS e PJe preenchidos |

As etapas A–C podem ser feitas e repetidas sem nenhum risco para a produção. D e E só começam depois de o usuário
aprovar a planilha. Não há etapa de novas leituras (P14).

**Em resumo:** o script lê as FAVs e gera a planilha; o usuário confere; só então outro script grava no banco de
Lavras o REDS e o PJe das linhas aprovadas. Nada é gravado sem a conferência.

## 5. Etapas A–C: leitura e planilha

### 5.1 Etapa A: a lista de FAVs

1. O usuário faz o backup manual de sempre (roteiro de `backup-manual`, com cópia no PC e no Drive).
2. Restauração num Postgres 16 **descartável** (container próprio, nome e porta diferentes do banco de desenvolvimento,
   nunca sobre o banco do `npm run dev:full`): `pg_restore --no-owner`. Isso também cumpre o teste de restauração que
   nunca foi feito.
3. Uma consulta só de leitura gera `lista-favs.csv`: id do vestígio, FAV, categoria, município, destinação, invólucros
   ativos, requisições ativas, data do backup.
4. Vestígios excluídos (`deleted_at`) ficam fora. Vestígios sem FAV não são lidos no PCNET, mas entram na aba
   **Erros** da planilha como "Sem FAV: REDS não encontrado" (P13).
5. FAVs repetidas no EvidenceOS (duas linhas com a mesma FAV, o que viola a regra de exclusividade) são lidas uma vez
   e marcadas na planilha como **"FAV repetida no EvidenceOS"**, para limpeza manual pela tela.

O banco descartável é apagado ao final da etapa E (ou mantido só até lá para ensaios).

### 5.2 Etapa B: o script de leitura

`scripts/pcnet-leitura-fav.py` (Python + Playwright, já instalados neste PC). O código vai para o repositório; dados
nunca.

- **Navegador:** **Firefox** (P15). O Playwright não comanda o Firefox instalado no Windows; usa uma versão própria,
  instalada uma vez com `python -m playwright install firefox` (hoje só o Chromium está instalado). Abre numa janela
  separada, com **perfil próprio** guardado fora do repositório (`c:\tmp\pcnet-leitura\perfil\`), sem as senhas e
  favoritos do Firefox do dia a dia.
- **Login:** o PCNET **não pede certificado**, mas o GET da FAV só funciona com a sessão logada (confirmado pelo
  usuário em 23/11). Estar logado no Firefox do dia a dia **não vale** para a janela do script: são perfis separados,
  com sessões separadas. Por isso o usuário faz o login **dentro da janela que o script abre**, do mesmo jeito que faz
  no Firefox de sempre. O script espera até a sessão estar ativa. Se a sessão expirar no meio da rodada, o script
  para, pede novo login nessa mesma janela e continua de onde parou.
- **Pedido:** para cada FAV única, a mesma URL do botão "Ver FAV":
  `https://www.pcnet.mg.gov.br/PCnet/cadeiacustodiasel.do?evento=gerarFav&idMaterial=<FAV>`, buscada com a sessão do
  navegador. Nada de URL nova ou de outra página do PCNET.
- **Sessão caída:** se a resposta não começar com `%PDF` (página de login, erro), o script **para**, avisa e espera o
  usuário entrar de novo. Não tenta logar sozinho e não insiste.
- **Ritmo:** uma FAV a cada 2–3 segundos, em lotes de 500, com pausa entre lotes. Cerca de 5.000 FAVs levam de 3 a
  4 horas, que podem ser divididas em vários dias.
- **Retomada:** cada FAV lida é gravada na hora num arquivo de progresso (`progresso.jsonl`). Se a janela fechar ou o
  PC desligar, a nova execução continua de onde parou.
- **Conferência da FAV certa:** o número da FAV impresso no PDF tem de ser igual ao pedido (ignorando zeros à
  esquerda). Se não for, a linha sai como erro.

### 5.3 Regras de leitura

| Campo | Onde | Regra | Se falhar |
|---|---|---|---|
| FAV | `FICHA DE ACOMPANHAMENTO DE VESTÍGIO N.º:` | igual à pedida, sem zeros à esquerda | erro "FAV diferente da pedida" |
| REDS | **na mesma linha** do rótulo `Nº REDS:` | separar por espaço ou vírgula; cada número `^\d{4}-\d{9}-\d{3}$`; se houver dois, os dois são lidos na ordem em que aparecem e grava-se o primeiro (P6) | vazio: erro "FAV sem REDS"; fora do formato: erro "REDS fora do padrão" (valor lido vai para a planilha, nada é gravado); mais de dois: erro "FAV com mais de dois REDS" |
| PJe | **na mesma linha** do rótulo `Nº PJe:` | 20 dígitos e dígito verificador CNJ válido | nada na linha: "Não informado"; DV inválido: erro "PJe com dígito inválido" |
| Requisições | `Exame pericial (nº requisição):` até `COLETA` | separar por vírgula; cada uma `^\d{4}-\d{9}$` | fora do formato: aviso, valor lido vai para a planilha |
| Invólucro atual | `Número/Descrição invólucro atual:` | texto | só para conferência |

As expressões aceitam qualquer caractere no lugar do `º` e dos acentos, que saem trocados na extração.

**Leitura por linha, não "o que vem depois do rótulo".** Quando o PJe não existe, o rótulo `Nº PJe:` fica sozinho na
linha e a linha seguinte é `FICHA DE ACOMPANHAMENTO...`. Uma leitura simples (`PJe:\s*(...)`) pula a quebra de linha e
devolve esse texto como se fosse o PJe: aconteceu em 3 das 5 amostras (testado em 23/11). O DV impediria a gravação,
mas a FAV sairia como erro em vez de "Não informado". Por isso o leitor pega as palavras que estão **na mesma altura**
do rótulo (o PyMuPDF dá a posição de cada palavra). A altura é a do rótulo encontrado em cada FAV, não um número fixo:
ela muda entre FAVs (seção 3). Nada nessa altura = campo vazio. A mesma regra vale para o REDS.

Ordem dos testes antes da rodada completa:

1. **Disco:** o leitor roda nas FAVs de `c:\tmp\pcnet-favs-amostra\` (sem acessar o PCNET) e o resultado é conferido
   contra a tabela da seção 3, incluindo "Não informado" nas três sem PJe e os dois REDS das FAVs 2317127 e 2200920.
2. **Piloto ao vivo:** com o usuário logado, o script busca **5 a 10 FAVs reais** no PCNET. Confere que a resposta é
   um PDF (começa com `%PDF`), que a sessão do navegador é reaproveitada sem novo login e que a FAV impressa é a pedida.
   A URL só tinha sido testada clicando no botão "Ver FAV"; o piloto confirma que a busca automática responde igual.
   Se falhar, nada mais roda até entender o motivo.
3. **Amostra de 50 FAVs** de anos diferentes, para pegar mudanças de layout antigas.
4. Rodada completa.

### 5.4 O que fica guardado

- **Os PDFs não são gravados em disco.** O script lê o PDF na memória, extrai os campos da tabela acima e descarta.
- O arquivo de progresso guarda só: FAV, REDS, PJe, requisições, invólucro atual, situação e hora da leitura. Nada de
  nomes, matrículas ou descrição do material.
- **Guarda também o texto bruto** das linhas de REDS, PJe e requisições, exatamente como saíram do PDF. São só
  números. Se uma regra de leitura se mostrar errada depois (por exemplo, o caso dos dois REDS), corrige-se a regra e
  roda-se `--reprocessar`, que refaz a interpretação a partir do arquivo de progresso, em segundos e **sem acessar o
  PCNET**. Sem isso, seria preciso baixar todas as FAVs de novo.
- Tudo fica em `c:\tmp\pcnet-leitura\<data>\`, fora do repositório. A planilha final segue a regra das outras: fora do
  repositório; o usuário decide onde arquivar.
- As 7 FAVs de amostra ficam em `c:\tmp\pcnet-favs-amostra\` (5 movidas da raiz do repositório em 17/11) e servem de
  teste do leitor (5.3). Elas são apagadas depois que a etapa B rodar com sucesso, com o aviso ao usuário.

### 5.5 Etapa C: a planilha

Arquivo `.xlsx`, uma linha por vestígio, todas as células de número como **texto** (para não perder zero à esquerda).

| Coluna | Conteúdo |
|---|---|
| FAV | número da FAV |
| Categoria, Município, Destinação | do EvidenceOS (backup) |
| REDS 1 (FAV) / REDS 2 (FAV) | lidos da FAV, na ordem em que aparecem; REDS 2 vazio quase sempre |
| REDS a gravar | o primeiro (P6) |
| PJe (FAV) | lido da FAV, formatado; **"Não informado"** quando não existir |
| Qtde requisições (FAV) | número |
| **Alerta** | "Mais de uma requisição" quando > 1; "FAV com dois REDS" quando houver REDS 2 (os dois alertas podem aparecer juntos) |
| Requisição 1 … Requisição 5 | da FAV, no formato original (`2026-059354601`) |
| Demais requisições | se houver mais de 5, as excedentes separadas por vírgula |
| Requisições no EvidenceOS | as ativas, como estão gravadas |
| Requisições da FAV ausentes no EvidenceOS | comparação ignorando ano e zeros à esquerda |
| Invólucro atual (FAV) / Invólucros no EvidenceOS / Invólucro confere? | conferência |
| Situação | `OK`, `Erro: …`, `Sessão caída`, `FAV repetida no EvidenceOS` |
| Conferido | coluna vazia para o usuário marcar |

Abas extras: **Resumo** (totais por situação, quantos com PJe, quantos com alerta) e **Erros**. Filtro e cabeçalho
congelado em todas.

A aba **Erros** é o **relatório dos vestígios que ficam sem REDS** (P12 e P13). Nenhuma dessas linhas é gravada. Ela
reúne:

- vestígios sem FAV no EvidenceOS (não há o que ler);
- FAV sem REDS;
- REDS fora do padrão (com o valor lido, para o usuário ver);
- FAV com mais de dois REDS;
- FAV diferente da pedida, PJe com dígito inválido e qualquer outro erro de leitura;
- FAV repetida no EvidenceOS.

Cada linha traz FAV, id do vestígio, categoria e o motivo. Com ela o usuário completa ou corrige à mão, pela tela.

O usuário confere e devolve a planilha. Só as linhas com situação `OK` (ou corrigidas e marcadas por ele) seguem para
a gravação.

## 6. Etapa D: estrutura no EvidenceOS

### 6.1 Banco (migration nova, escrita à mão)

`server/prisma/migrations/2026MMDD_0001_add_reds_pje/migration.sql`, idempotente (`ADD COLUMN IF NOT EXISTS`),
porque o `migrate dev` falha com P3014:

- Coluna `vestiges.numero_reds` (texto, opcional) com índice.
- Coluna `vestiges.numero_pje` (texto, opcional) com índice.
- **Sem índice único** em nenhuma das duas (P5). Nenhuma tabela nova (P6).

Antes do deploy, a migration é ensaiada no banco descartável da etapa A, que tem a estrutura real de Lavras (o
`migrate deploy` do zero não recria o schema; ver `migrations-incompletas`).

### 6.2 Código

| Peça | Mudança |
|---|---|
| `schema.prisma` | `numeroReds` e `numeroPje` em `Vestige` |
| `server/src/services/vestigeItemService.ts` | sem mudança: REDS não é lista (P6) |
| `server/src/routes/vestigeRoutes.ts` | listagem, busca e detalhe devolvem `numeroReds` e `numeroPje`; criação e edição aceitam os dois. **REDS obrigatório na criação** (P13), opcional na edição. REDS fora de `^\d{4}-\d{9}-\d{3}$` **não é recusado** pelo servidor (P12): o aviso fica na tela. PJe validado (20 dígitos + DV). Mudanças nos dois entram na auditoria da edição, com antes e depois |
| `client/services/dataService.ts` | `mapVestige` traz REDS e PJe |
| `client/components/VestigeCard.tsx` | mostra REDS e PJe formatado; "Não informado" no que estiver vazio |
| Formulário e `ConfirmEditModal.tsx` | dois campos de texto, REDS e PJe, que entram na conferência de edição. REDS obrigatório no cadastro novo. REDS fora do padrão mostra aviso ("REDS fora do padrão AAAA-NNNNNNNNN-SSS. Confira antes de salvar.") e deixa salvar |
| `client/hooks/useVestiges.ts` (busca rápida) | procura também em REDS e PJe, ignorando hífen e pontos. Buscar um REDS ou PJe traz **todos** os vestígios ligados a ele |
| `/check-duplicate` | sem mudança: continua só para FAV e invólucro. REDS e PJe repetidos não geram alerta (P5) |

O relatório/PDF e a futura planilha por categoria (item 2) ficam como estão; podem passar a mostrar REDS e PJe depois.

### 6.3 Resumo de Impacto de Segurança e Auditoria

- **Autenticação e permissões:** sem mudança. Os campos novos seguem as permissões de edição de vestígio que já
  existem.
- **Cadeia de custódia:** REDS e PJe são **identificação** do vestígio, não movimentação. Nenhuma regra de destinação,
  retirada, invólucro ou requisição muda.
- **Auditoria:** toda alteração de REDS ou PJe, pela tela ou pela importação, gera registro com antes e depois. A importação usa `auditService.logInTransaction` dentro da mesma transação da gravação
  (`CUSTODY_TX_OPTIONS`): se a auditoria falhar, nada é gravado.
- **Valor anterior:** como REDS e PJe são campos simples, o valor trocado pela tela não fica na tabela de vestígios;
  fica no registro de auditoria da edição (antes e depois), que é onde se consulta o histórico.
- **PCNET:** o backend não ganha nenhuma chamada ao PCNET e não recebe credencial ou sessão.
- **Dados sensíveis:** os PDFs não são armazenados; nada de nomes ou matrículas sai do PDF.

## 7. Etapa E: gravação em Lavras

### 7.1 Do PC até o servidor

1. Um script local (`scripts/pcnet-gerar-importacao.py`) lê a planilha conferida e gera `importacao-reds-pje.json`
   (id do vestígio, FAV, REDS escolhido pela regra P6, PJe) e o SHA-256 do arquivo.
2. O usuário copia o arquivo para a VPS com o mesmo `scp` do backup e, de lá, para dentro do container do `api`. O
   agente não conecta na VPS.
3. No console do `api`, o SHA-256 é conferido antes de qualquer outra coisa.

O arquivo de importação não vai para o repositório.

### 7.2 O importador

`server/scripts/importar-reds-pje.cjs`, no padrão de `cadastrar-favs-pendentes.cjs`:

- **Sem argumentos, não grava nada:** mostra o que seria feito e os conflitos.
- `OPERADOR_EMAIL=… node scripts/importar-reds-pje.cjs --confirmar` grava. Sem `OPERADOR_EMAIL`, recusa.
- **Uma transação por vestígio**, com o registro de auditoria dentro dela (ação `IMPORT_FAV_PCNET`, detalhes com FAV,
  REDS e PJe gravados e a origem "FAV lida no PCNET em <data>").
- O vestígio é localizado pelo id **e** a FAV tem de continuar igual. Se o vestígio foi excluído ou a FAV mudou desde
  o backup, a linha é pulada e listada.
- **Só preenche, nunca troca:**
  - REDS e PJe: cada um é gravado só se o campo estiver vazio. Se já houver um valor diferente (lançado pela tela),
    **não sobrescreve** e lista o conflito.
- **Pode rodar de novo** sem duplicar nada: o que já está gravado é reconhecido e pulado.
- No fim, imprime totais (gravados, já existentes, pulados, conflitos) para conferir com a planilha.
- Por último, lista **todos os vestígios de Lavras que continuam sem REDS** no banco de produção (só id, FAV e
  categoria). Isso pega também os vestígios cadastrados entre o backup da etapa A e o deploy, que não estavam na
  planilha e foram criados quando o REDS ainda não era obrigatório. Essa lista completa o relatório de erros (5.5).

### 7.3 Ordem do deploy (só Lavras)

1. Backup manual (obrigatório: há migration), com cópia no PC e no Drive.
2. `git push` da `main` e conferência com `git ls-remote` antes de implantar.
3. Deploy do **`api`** de Lavras e, no console do `api`: `cd /app && npx prisma@7.7.0 migrate deploy`.
4. Deploy do **`web`** de Lavras.
5. Conferência pela tela: um vestígio editado à mão com REDS e PJe e o registro dele em Logs de Auditoria.
6. Importação: primeiro sem `--confirmar`, conferência dos totais, depois com `--confirmar`.
7. Conferência por amostra: 10 vestígios abertos na tela contra a planilha.

`db` não recebe deploy; só a migration, pelo `api`. **Campo Belo (`api-cb`, `web-cb`, `pg-cb`): nenhuma ação.**

## 8. Depois da importação: sem novas leituras

A leitura no PCNET é feita **uma vez** (P14). Depois do deploy:

- vestígio novo já é cadastrado com REDS (obrigatório) e, se houver, PJe;
- PJe que surgir depois num vestígio antigo, quando o processo for distribuído, é lançado à mão, pela edição do
  vestígio;
- vestígios que ficaram sem REDS (aba Erros e lista final do importador) são completados à mão.

O script não terá modo `--pendentes`.

## 9. Riscos

| Risco | Tratamento |
|---|---|
| PCNET mudar o layout da FAV | Regras de formato e DV: qualquer leitura estranha vira erro na planilha, não dado gravado |
| Ler a FAV errada | Número da FAV impresso no PDF conferido com o pedido |
| PJe vazio lido como a linha de baixo | Leitura pela altura da linha do rótulo (5.3), testada nas amostras sem PJe |
| Regra de leitura errada descoberta depois | Texto bruto guardado; `--reprocessar` sem acessar o PCNET (5.4) |
| Busca automática responder diferente do botão | Piloto com 5–10 FAVs antes de tudo (5.3) |
| Sessão cair no meio | Para, espera novo login, retoma do arquivo de progresso |
| Excesso de pedidos ao PCNET | Uma FAV a cada 2–3 s, em lotes, com pausa |
| Backup desatualizado na hora da gravação | Importador confere id + FAV; o que mudou é pulado e listado |
| Sobrescrever dado lançado à mão | Importador só preenche vazio; conflito é listado, não gravado |
| Dados sensíveis espalhados | PDFs não gravados; arquivos fora do repo; PDFs de amostra apagados no fim |
| Layout da FAV mudar de posição | Leitor procura o rótulo em cada FAV; nunca coordenada fixa (já visto nas FAVs 2317127 e 2200920) |
| Vestígio cadastrado entre o backup e o deploy ficar sem REDS | Lista final do importador, lida direto no banco de produção (7.2) |
| Migration quebrar Lavras | Ensaiada antes no backup restaurado; idempotente; backup obrigatório |

## 10. Fora deste plano

- Nº PCnet (P1) e qualquer outro dado da FAV.
- Gravar no EvidenceOS as requisições que estão na FAV e faltam no sistema (só aparecem na planilha).
- Campo Belo (item 1) e a planilha por categoria (item 2), decididos depois.
- Novas leituras periódicas no PCNET (P14).

## 11. Pontos em aberto

Decididos em 23/11 e levados para a tabela da seção 2: qual REDS guardar (P6: o primeiro), REDS fora do padrão (P12),
REDS obrigatório (P13), requisições só na planilha (P8), sem novas leituras (P14), Firefox (P15).

Login no PCNET também resolvido em 23/11: sem certificado; o usuário loga na janela do script (5.2).

Resta:

1. **Efeito em Campo Belo:** pela D2 (estrutura idêntica), Campo Belo recebe `numero_reds` e `numero_pje` da `main`.
   A **D13 foi substituída em 17/11**: o REDS deixa de ser lista e a tabela `vestige_reds` não existe mais. A linha da
   planilha de Campo Belo com dois REDS na mesma célula guarda um só, pela mesma regra P6. Os motivos de inclusão de
   REDS (seção 7.1 daquele plano) deixam de existir. **O plano de Campo Belo, no ramo `campobelo`, já foi atualizado
   em 17/11** (nova decisão D24, seções 1, 3.1, 4, 7, 8.1, 9, 10 e 12). Falta acrescentar lá que grava-se o primeiro
   REDS (P6, 23/11) e que o REDS é obrigatório no cadastro novo (P13).

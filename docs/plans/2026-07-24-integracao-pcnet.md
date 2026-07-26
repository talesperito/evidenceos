# Plano de Integração com o PCNET

**Data:** 2026-07-24
**Status (atualizado em 2026-07-25):** 🏁 **PLANO CONCLUÍDO.** ETAPAS 0, 1, 2, 3, 5, 6 e 7 ✅ · ETAPA 4 ⛔ descartada (UI.Vision não foi necessário). Os 2 botões ("Ver FAV" e "Movimentar FAV") estão implementados, testados localmente pelo usuário e com auditoria verificada no banco. Commitado (`b45a71f`), enviado para a `main` e **implantado em produção em 2026-07-25**, com o funcionamento confirmado pelo registro de auditoria real (ver seção "Implantação em produção" no fim deste documento). **Todos os cenários previstos foram testados**, inclusive o de sessão do PCNET expirada — nada ficou como suposição. Ver os achados na nota da ETAPA 7.
**Escopo original:** mapeamento do que já existe hoje na consulta de vestígio + estrutura do plano de integração + mapeamento da tela "Movimentação FAV" do PCNET + plano de execução passo a passo (Parte 4)

> ## 📍 Para o agente que for executar este plano
> Vá direto para a **Parte 4 — Plano de Execução**. Cada etapa tem um bloco `**Status:**` — é a primeira coisa a checar ao retomar o trabalho, e a primeira coisa a atualizar antes de sair (mesmo que a etapa não tenha terminado). Não pule etapas: a ordem existe porque etapas de escrita (5 em diante) dependem de infraestrutura e aprovação que as anteriores estabelecem. **Nunca marque uma etapa de escrita como concluída sem a aprovação explícita exigida nela** — isso é a Regra de Ouro do CLAUDE.md deste projeto, não uma formalidade.
>
> ### 🔖 Onde o trabalho parou (2026-07-25)
> **Arquitetura final, já validada por testes reais — leia isto antes de qualquer coisa:** a integração é apenas **abrir a tela certa do PCNET em outra aba**, via link direto por FAV. Sem extensão de navegador, sem UI.Vision, sem automação, sem scraping. Confirmado que tanto `cadeiacustodiasel.do?evento=gerarFav&idMaterial=<FAV>` (leitura) quanto `sobcustodiaman.do?evento=x&idMaterialCustodiado=<FAV>` (escrita) aceitam o `registroFav` do EvidenceOS diretamente.
>
> **Já pronto e funcionando:** model `PcnetActionLog` + migration aplicada (ETAPA 1); rotas `POST`/`GET /api/vestiges/:id/pcnet-actions` (ETAPA 2); botão "Ver FAV" no `VestigeCard.tsx` + `buildPcnetUrl()`/`logPcnetAction()` no `dataService.ts` (ETAPA 3, **testado pelo usuário em 2026-07-25, abre a FAV certa**); Resumo de Impacto de Segurança e Auditoria escrito e **aprovado explicitamente** (ETAPA 5); botão "Movimentar FAV" no `VestigeCard.tsx` (ETAPA 6, implementado, type-check ok).
>
> **O que falta:** quase nada. Só o item 1 da **ETAPA 7** — testar com o PCNET deslogado e confirmar que a tela de login do próprio PCNET aparece na aba nova. A auditoria (item 2) já foi conferida no banco em 2026-07-25: 9 linhas em `PcnetActionLog` e 9 em `AuditLog`, pareando certo. **Nenhum gate de aprovação pendente** — a ETAPA 5 já liberou o que faltava. As alterações ainda **não foram commitadas** e o repositório está na `main`.
>
> **Armadilha conhecida do ambiente:** `npx prisma migrate dev` falha com `P3014` neste projeto (o usuário `evidenceos_app` do Postgres local não pode criar shadow database). Escreva a migration SQL à mão e aplique com `npx prisma migrate deploy` — ver detalhe na Nota de retomada da ETAPA 1.

> ## ⚠️ Premissa fundamental da integração — ler antes de qualquer outra coisa
>
> **Esta integração NUNCA vai armazenar, receber ou manipular login/senha do usuário no PCNET.** Isso foi decidido explicitamente pelo usuário e não é negociável em nenhuma fase deste plano.
>
> **Pré-requisito obrigatório para qualquer um dos 2 botões (Ver FAV, Movimentar FAV) funcionar: o usuário precisa estar logado no PCNET, manualmente, em outra aba/janela do próprio navegador** — incluindo o 2FA do PCNET, feito por ele mesmo, como já faz hoje.
>
> A integração **não autentica no PCNET por conta própria** — ela reaproveita a sessão que o usuário já abriu manualmente. A arquitetura final (ver ETAPA 4 da Parte 4 — Plano de Execução) é a mais simples possível: **o EvidenceOS só abre a tela certa do PCNET numa nova aba** (link direto por FAV, confirmado por teste real). Não há extensão de navegador, UI.Vision ou automação nenhuma — o usuário preenche e salva manualmente dentro do PCNET, exatamente como já faz hoje.
>
> Se o usuário não estiver logado no PCNET em outra aba no momento do clique, a ação simplesmente não funciona (deve falhar de forma clara na UI, nunca tentar autenticar sozinha).
>
> Qualquer implementação futura que desvie disso (ex.: pedir senha do PCNET no EvidenceOS, guardar cookie de sessão no backend, ou qualquer forma de autenticação automática no PCNET) **contraria uma decisão já tomada** e não deve ser feita sem voltar a discutir com o usuário.

---

## Parte 1 — Como funciona hoje a consulta de um vestígio no EvidenceOS

### 1.1 Onde acontece

Não existe uma "tela de detalhe" dedicada (sem rota `/vestige/:id`, sem modal "ver detalhes"). O que hoje funciona como consulta é:

- **`SearchBar.tsx`** → usuário filtra (categoria, cidade, requisição, FAV, intervalo de datas etc.).
- **`SearchResults.tsx`** → lista os vestígios encontrados.
- **`VestigeCard.tsx`** → cada resultado é exibido como um card com todos os campos já visíveis, sem precisar abrir nada. Esse card *é*, na prática, a tela de consulta.
- **`VestigeFormModal.tsx`** → só é aberto para editar/criar, reaproveita os mesmos campos.

O backend já expõe `GET /api/vestiges/:id`, que retorna o vestígio completo e **registra auditoria `VIEW_DETAIL`** — mas o front-end atual não chama esse endpoint (carrega tudo via lista paginada e filtra localmente). Isso é relevante: já existe uma base de auditoria de "quem consultou o quê" pronta para ser aproveitada quando criarmos uma tela de detalhe de verdade.

### 1.2 Campos que aparecem hoje no card de um vestígio

| Campo exibido | Origem no banco (`schema.prisma` / model `Vestige`) |
|---|---|
| Categoria | `category` (relação com `VestigeCategory`) |
| Material | `material` |
| **Requisição** | `requisicao` (string livre, sem tabela própria) |
| Invólucro(s) | `VestigeInvolucro[]` (1:N) |
| **FAV** | `registroFav` (string livre, sem tabela própria) |
| **Município (rotulado hoje como "Cidade")** | `municipio` |
| Data de entrada | `dataColeta` |
| Tempo de custódia | calculado no front a partir de `dataColeta` |
| Conservação | `estadoConservacao` |
| Destinação (+ observação) | `destinacao`, `destinacaoObs` |

Campos que existem no banco mas **não aparecem** na consulta hoje: `observacoes`, `tipoMaterial`, `destinacaoChangedBy/At` (usados só internamente).

Existe também `GET /:id/destination-history`, já implementado no backend e no `dataService.ts` do client, mas **nenhuma tela chama essa função hoje** — é histórico de mudança de status de destinação, pronto para uso futuro, mas não é uma cadeia de custódia completa (não tem elos de posse/transporte/armazenamento).

### 1.3 O que **não existe** hoje no sistema (gap real)

- Não existe modelo/entidade `Requisicao` — é só uma string solta no vestígio.
- Não existe modelo/entidade `FAV` — é só uma string solta (`registroFav`).
- Não existe conceito de **procedimento** (inquérito policial, BO) ligado ao vestígio.
- Não existe campo/entidade de **delegacia/unidade** nem **número de laudo**.
- "Cidade" hoje é só `municipio`, uma lista fixa de 14 cidades da região de Lavras/MG, hardcoded no front.
- A única menção ao PCNET no código hoje é **um texto de FAQ estático** (`client/data/faqData.ts`), explicando que o FAV é "gerado pelo sistema PCnet/Sinesp" — **não há nenhuma integração técnica real** (sem client HTTP, sem variável de ambiente, sem sincronização, sem job de import).

Esse último ponto é o motivo pelo qual a consulta de um vestígio hoje mostra **apenas o que foi digitado manualmente** no EvidenceOS (FAV e requisição como texto livre), sem qualquer garantia de que reflete o estado real do procedimento no PCNET.

---

## Parte 2 — Objetivo da integração com o PCNET

Permitir que, ao consultar um vestígio no EvidenceOS, o usuário visualize também os **dados reais e atualizados do PCNET** relacionados àquele item — não apenas os campos que hoje são digitados manualmente (FAV, requisição), mas **todo o procedimento** ao qual o vestígio pertence (contexto do inquérito/BO, partes envolvidas, andamento, delegacia de origem, etc., conforme o que o PCNET expuser).

### 2.1 Por que isso importa (rastreabilidade/auditoria)

Hoje o FAV e a requisição são texto livre digitado pelo usuário no EvidenceOS. Se o PCNET for a fonte de verdade desses números, a integração passa a permitir **validar/enriquecer** esses dados em vez de confiar apenas na digitação manual — o que impacta diretamente a integridade da cadeia de custódia e a confiabilidade da auditoria. Por isso essa integração se enquadra na Regra de Ouro do projeto (nada é implementado sem aprovação explícita, e qualquer alteração em lógica de evidência/auditoria exige Resumo de Impacto de Segurança antes de codar).

### 2.2 Mapeamento inicial do PCNET (a partir dos prints recebidos em 2026-07-24)

**Tela inicial** (`www.pcnet.mg.gov.br/APP/inicial.do`): portal geral do "PCnet — Sistema de Gerenciamento de Procedimentos Policiais via Web", identifica a unidade logada (ex.: "POSTO DE PERICIA INTEGRADA/LAVRAS") e o usuário autenticado. Login é por sessão web (usuário/senha próprios do PCNET), com expiração de sessão visível ("Sessão expira em: XX:XX") — **não há indício de API própria**, é uma aplicação web tradicional (padrão `.do` de Struts/JSP), o que aponta para integração via **automação de navegação (scraping) autenticado**, não uma API REST.

**Tela "Movimentação FAV"** (popup em `www.pcnet.mg.gov.br/PCnet/custodiasel.do?modoJanelaPlc=popup`) — esta é a tela-chave para a integração. É uma tela de **busca/pesquisa de FAV**, com os seguintes campos de filtro:

| Campo de busca no PCNET | Observação / equivalência no EvidenceOS |
|---|---|
| Número da FAV | equivale a `registroFav` no EvidenceOS |
| Número/Descrição do Lacre | equivale a um dos itens de `VestigeInvolucro` (invólucro) |
| Nº Requisição | equivale a `requisicao` no EvidenceOS |
| Nº REDS (3 campos) | **não existe no EvidenceOS hoje** — REDS é o identificador de Registro de Evento de Defesa Social (padrão de MG), provavelmente o elo entre o vestígio e o "procedimento"/ocorrência de origem |
| Nº Procedimento | **não existe no EvidenceOS hoje** — confirma que existe um número de procedimento próprio, distinto de FAV/requisição/REDS |
| Pesquisa Textual | busca livre — sem equivalência direta |
| Checkbox "Materiais Coletados" / "Materiais Acondicionados" | filtros por etapa da cadeia de custódia |
| Checkbox "Pesquisar dados do Lacre antigo" | suporte a lacres substituídos/históricos |

Resultado da busca é uma tabela com colunas: **Situação, Classificação, Descrição, Número da FAV, Número/Descrição do Lacre, Unidade Última Movimentação** — ou seja, o PCNET já entrega, por FAV, o status atual e a unidade onde o item está fisicamente.

Legenda de situação (badges): `CL` = Materiais já coletados, `AC` = Materiais já acondicionados, `EMD` = Pertence a procedimento que existe decisão judicial (Embargo/Decisão? — confirmar sigla exata com o usuário).

Botões de ação na tela (por FAV selecionada): **Fluxograma, Anexar Arquivo, Coleta, Acondicionamento, Sob Custódia, Destinação, Ver FAV** — cada um provavelmente abre uma sub-tela/relatório com o detalhe daquela etapa da cadeia de custódia. Isso é muito relevante: **o PCNET já modela nativamente os elos da cadeia de custódia** (coleta → acondicionamento → custódia → destinação), algo que o EvidenceOS hoje só tem parcialmente (só o campo único `destinacao`, sem os elos anteriores).

**Conclusão preliminar:** o PCNET parece ser hoje a fonte de verdade mais completa para cadeia de custódia (mais completa que o EvidenceOS atual), e o vínculo entre vestígio e procedimento passa por pelo menos 3 identificadores possíveis: FAV, Requisição e REDS/Nº Procedimento. Falta ainda ver a tela de **detalhe de uma FAV específica** (o que aparece ao clicar em "Ver FAV" ou nos botões de etapa) para saber exatamente quais dados trariam mais valor na consulta do EvidenceOS.

### 2.3 Direção de implementação proposta (com base no que já foi confirmado)

Conforme indicado pelo usuário: **não criar uma tela nova** — a ideia é que, na tela atual de resultado de busca do EvidenceOS (`SearchResults.tsx` / `VestigeCard.tsx`), cada vestígio ganhe **botões de ação que abrem/consultam o PCNET** para aquele item específico (provavelmente via FAV ou requisição como chave), similar aos botões que o próprio PCNET já tem (Ver FAV, Fluxograma, Coleta, Acondicionamento, Sob Custódia, Destinação).

Isso muda a direção do plano: em vez de "trazer e persistir dados do PCNET no banco do EvidenceOS", a primeira via mais simples e mais segura é **abrir uma consulta direta ao PCNET a partir do card do vestígio** (ex.: um botão "Ver no PCNET" que leva/consulta a FAV correspondente), sem duplicar dado sensível de procedimento policial no nosso banco. Persistência/cache viraria uma segunda fase, só se necessário.

### 2.4 Estrutura real do documento FAV (a partir do PDF gerado em "Ver FAV" — FAV 809320)

> Nota de tratamento de dado sensível: o PDF fornecido pelo usuário traz nomes reais e matrículas de peritos/policiais e endereço de unidade. Os valores abaixo estão **anonimizados** (nomes substituídos por "Responsável A/B/C", mantendo apenas o padrão estrutural). Números de FAV/REDS/procedimento/requisição foram mantidos por serem identificadores operacionais (já presentes no nosso banco de dev), não dados pessoais de indivíduo.

Cabeçalho / identificação:

| Campo no PDF | Exemplo (FAV 809320) | Observação |
|---|---|---|
| Nº PCnet | `2023-382-002966-024-013915583-91` | identificador composto — parece embutir ano, código de unidade/delegacia, sequencial e o **nº de procedimento** (`013915583` aparece também isolado mais abaixo, ver Situação do Material) |
| Nº REDS | `2022-049085152-001` | formato `AAAA-NNNNNNNNN-SEQ` — é o identificador de Registro de Evento de Defesa Social, ano de abertura do REDS diferente do ano do PCnet (2022 vs 2023) |
| Nº PJe | (vazio neste caso) | referência ao processo judicial eletrônico, quando existir |
| **Ficha de Acompanhamento de Vestígio N.º** | `000809320` | é o próprio `registroFav` do EvidenceOS, com zero-padding para 9 dígitos (`809320` no nosso banco == `000809320` no PCNET) |
| Unidade Origem | nome da delegacia de origem | dado novo, não existe no EvidenceOS |
| Natureza do vestígio | `Outros` | equivalente aproximado à `category`/`planilhaOrigem` do EvidenceOS, mas vocabulário próprio do PCNET |
| Material | descrição livre do item | equivalente a `material` no EvidenceOS |
| Número/Descrição invólucro atual | `5073649` | equivalente a `VestigeInvolucro.numero` |
| Exame pericial (nº requisição) | `2023-046500329` | é a `requisicao` do EvidenceOS, mas com prefixo de ano (`2023-`) — no nosso banco está salva sem o prefixo (`46500329`), confirma o ajuste nº 7 já registrado em `docs/plans/2026-04-28-ajustes-futuros-design.md` sobre formato de requisição |

Seções de custódia (cada uma um bloco de dados novo, que o EvidenceOS não tem hoje):

- **Coleta**: responsável (matrícula + nome), data/hora, endereço do fato/coleta, localização do vestígio.
- **Acondicionamento**: responsável, número do invólucro/lacre de segurança.
- **Cadeia de Responsabilidade** (tabela): data/hora, portador (matrícula/nome), finalidade (`Recebimento`, `Transporte`, `Distribuição`), local (unidade), observação livre. **Esta tabela é literalmente a cadeia de custódia com múltiplos elos** que hoje só existe de forma completa no PCNET — é o achado mais importante para o plano: o EvidenceOS só registra a mudança do campo único `destinacao`, sem elos intermediários de posse/transporte.
- **Situação do Material** (tabela): data/hora, **Nº Procedimento** (ex.: `12252184`, depois `13915583` — ou seja, um mesmo vestígio pode ter mais de um número de procedimento ao longo do tempo), responsável do procedimento, situação do material (`Enviado à perícia`, `Periciado`).
- **Rompimento de Lacre** (tabela): data/hora, portador, finalidade, nº novo lacre/descrição — histórico de troca de lacre.
- **Histórico de Alterações da Descrição do Material** (tabela, vazia neste exemplo): data/hora, matrícula do responsável, descrição do material — auditoria de edição da descrição.
- Rodapé com nº da FAV e código de barras (`000809320`) — sugere que a FAV também é identificável fisicamente por código de barras, relevante se algum dia quisermos leitura por leitor de código de barras no EvidenceOS.

**Implicação direta para o plano:** o PDF da FAV já é, sozinho, um documento de cadeia de custódia mais granular do que qualquer coisa que o EvidenceOS gera hoje. Ele reforça a proposta já registrada da skill `cadeia-custodia-pericial` (10 elos obrigatórios) — o PCNET parece já implementar isso na prática, então a integração pode servir tanto para exibir o link/PDF quanto, futuramente, para *inspirar* a estrutura de dados de custódia do próprio EvidenceOS.

### 2.5 Padrão de URL observado (importante para viabilidade técnica)

O link informado para gerar a FAV — `www.pcnet.mg.gov.br/PCnet/custodiasel.do?evento=gerarFav&jmodoJanelaPlc=popup` — **não contém o número da FAV como parâmetro de URL**. Isso indica que o PCNET identifica qual FAV gerar por **estado de sessão no servidor** (o que foi pesquisado/selecionado na tela de busca antes de clicar "Ver FAV"), não por um link direto e único por FAV.

Consequência prática: **provavelmente não é possível montar um link estático do tipo `.../gerarFav?fav=809320`** e abrir direto em nova aba — a integração precisaria reproduzir o fluxo (preencher nº da FAV → marcar a linha do resultado → clicar "Ver FAV") ou descobrir se existe uma variação de URL com o número da FAV como parâmetro GET que ainda não foi testada.

**Confirmado em 2026-07-24:** testado com uma segunda FAV (904527) — a URL de geração permaneceu **idêntica** (`custodiasel.do?evento=gerarFav&jmodoJanelaPlc=popup`, sem o número da FAV). Isso confirma que o PCNET não aceita a FAV como parâmetro de URL; a identificação é feita por estado de sessão/formulário no servidor. **Próximo passo técnico:** inspecionar a aba Rede (Network) do F12 durante o clique em "Ver FAV" para descobrir se a requisição é GET ou POST e onde o número da FAV é enviado (corpo do POST, cookie de sessão, etc.) — isso é essencial para saber se dá pra automatizar sem replicar o fluxo completo de navegação.

**Observação adicional (FAV 904527):** o campo "Nº PCnet" veio em branco neste caso, diferente da FAV 809320 (que tinha valor preenchido). Hipótese a confirmar: o "Nº PCnet" só é populado depois que a perícia é concluída (a FAV 904527 está em situação `CL/AC`, ainda não `Periciado`), já que na FAV 809320 esse número parecia incorporar o Nº de Procedimento do exame pericial concluído.

**Terceira confirmação (FAV 1757928, 2026-07-24):** URL de geração novamente idêntica (3 de 3 testes) — confirma que a FAV não é identificada via URL. Esta FAV trouxe o "Nº PCnet" completo: `2025-080-000932-005-017337704-31`. Comparando com o da FAV 809320 (`2023-382-002966-024-013915583-91`), o padrão de segmentos é: `AAAA-NNN-NNNNNN-NNN-[Nº Procedimento de 9 dígitos]-DV`. O penúltimo bloco de 9 dígitos bate com o Nº de Procedimento visto na seção "Situação do Material" — reforça a hipótese de que o Nº PCnet só é composto/preenchido depois de existir um procedimento de exame pericial vinculado à FAV. Esta FAV também trouxe "Nº PJe" preenchido (`50018071320258130080`), primeiro caso observado com esse campo não vazio — sugere existência de processo judicial eletrônico vinculado, o que pode ser outro identificador relevante dependendo do caso.

**Fluxo técnico confirmado via aba Rede do F12 (FAV 1757928, 2026-07-24) — achado mais importante até aqui:**

O acesso à FAV é, na verdade, uma sequência de **3 requisições HTTP**, não uma única chamada:

1. `POST custodiasel.do` (XHR) — disparado por "F9-Pesquisar"; retorna HTML com a tabela de resultados da busca (44,88 kB). O nº da FAV/filtros digitados vão no corpo desse POST.
2. `POST custodiasel.do?evento=abrirPopUp` (XHR) — disparado ao marcar a linha do resultado e clicar em "Ver FAV"; resposta pequena (4 B). **Hipótese: este passo grava em sessão qual FAV foi selecionada** (provavelmente a partir de um identificador da linha retornada no passo 1, não necessariamente só o número digitado).
3. `GET custodiasel.do?evento=gerarFav&jmodoJanelaPlc=popup` — só então gera e retorna o PDF (10,03 kB), lendo o que foi selecionado em sessão no passo 2. Confirma a ausência de qualquer parâmetro de FAV na URL.

**Implicação para viabilidade técnica:** uma integração automatizada não pode pular direto para o passo 3 com um link estático — precisaria manter cookies de sessão autenticada e replicar os passos 1 e 2 antes de buscar o PDF. Isso é factível (um cliente HTTP com jar de cookies consegue fazer isso), mas depende de entender o payload exato dos passos 1 e 2 — em especial se o passo 2 (`abrirPopUp`) exige algum ID interno de linha gerado dinamicamente pela busca (o que obrigaria sempre repetir o passo 1) ou se aceita diretamente o número da FAV.

**Cabeçalhos confirmados do POST `custodiasel.do` (2026-07-24):**

- Sessão via cookies: `JSESSIONID`, `ROUTEID`, `SERVERID`, `JSESSIONIDSSO` — qualquer automação precisaria manter esse conjunto de cookies (jar de sessão autenticada), não há acesso possível sem eles.
- `Server: Apache` / `X-Powered-By: Servlet 2.4; JBoss-4.2.3.GA` — aplicação Java antiga (JBoss/Servlet), reforça que não existe API REST moderna.
- `Content-Type: application/x-www-form-urlencoded` — confirma envio de formulário clássico (não JSON).

**Fluxo completo confirmado (mapeado com FAV 1757928, 2026-07-24), 4 requisições, mesmo endpoint `custodiasel.do` reaproveitado com campo `evento` diferente a cada etapa:**

| # | Requisição | Campo `evento` (corpo) | Payload relevante | Efeito |
|---|---|---|---|---|
| 1 | `POST custodiasel.do` | `"F9-Pesquisar"` | `numeroDaFAV_Arg: "1757928"` (demais filtros vazios) | Busca a FAV; servidor guarda o(s) resultado(s) em sessão como uma lista `itensPlc[]` |
| 2 | `POST custodiasel.do` | `"SelecionarItem"` | `itensPlc[0].flagSelecionada: "S"` | Marca o item de índice `0` da lista em sessão como selecionado (equivalente a marcar o checkbox da linha) |
| 3 | `POST custodiasel.do?evento=abrirPopUp` | (via query string) | corpo pequeno/irrelevante | Sinaliza ao servidor que o popup da FAV selecionada deve ser aberto |
| 4 | `GET custodiasel.do?evento=gerarFav&jmodoJanelaPlc=popup` | (via query string) | nenhum (GET puro) | Gera e retorna o PDF da FAV que está selecionada em sessão |

Todos os campos do formulário (`modoPlc: "consultaPlc"`, `lookupCorrentePlc`, `ordenacaoPlc`, `itensPlc[N].flagSelecionada` etc.) indicam um componente de grid com estado no servidor — nomenclatura `Plc` sugere um framework próprio da PRODEMGE (provável "Página de Lista de Consulta" ou similar) com padrão de postback completo tipo ViewState (cada ação reenvia o formulário inteiro, variando apenas o campo `evento` e o dado que mudou).

**Conclusão de viabilidade técnica:** a integração automatizada é **tecnicamente possível**, mas exige um cliente HTTP com estado (cookies de sessão) que replique as 4 requisições em sequência — não existe um link direto por FAV. Resumo do que uma automação precisaria fazer:
1. Reutilizar os cookies de sessão de um usuário já autenticado no PCNET (não há indício de API/token separado).
2. `POST` de busca com `numeroDaFAV_Arg` = FAV desejada.
3. `POST` de seleção do item de índice `0` (assumindo que a busca por FAV específica sempre retorna exatamente 1 resultado — a validar com um caso de FAV inexistente ou com múltiplos resultados).
4. `POST` de abertura do popup.
5. `GET` do PDF final.

**Achado colateral (chamada de telemetria):** existe uma segunda requisição em paralelo, `POST estatisticarequisicaoman.do`, que é só **telemetria interna** do PCNET (tempo de resposta, servidor, memória) — não faz parte do fluxo funcional. Ela expõe nomes de classes de domínio do backend do PCNET (ex.: classes relacionadas a Coleta, Acondicionamento, Material Custodiado, Categoria de Bem Material — nomenclatura em português, consistente com o que já vimos no PDF da FAV) e alguns identificadores internos (usuário, unidade, servidores de aplicação) — informação de infraestrutura do PCNET, mantida aqui apenas de forma genérica, sem os valores literais, por não ser dado nosso e não ter utilidade para o desenho da integração.

**Pendente:** validar o comportamento em dois cenários-limite: (a) busca por uma FAV que não existe, e (b) busca que retorna mais de 1 resultado (ex.: por Nº Requisição, que pode ter vários vestígios) — isso decide se o passo 2 sempre usa índice `0` ou se precisa identificar a linha correta por outro critério quando há múltiplos resultados.

### 2.5.1 Achado decisivo: planilha Excel/VBA de terceiro já implementa a integração (2026-07-24)

O usuário forneceu a planilha `Movimentar FAV (PPI TC).xlsm`, um dos dois sistemas artesanais da PCMG citados na seção 2.9 — inspecionada **sem habilitar macros** (Alt+F11, leitura de código apenas). Ela contém dois módulos VBA (`Módulo1`: lógica de integração com o PCNET; `Módulo2`: só uma função utilitária de número por extenso, sem relação com o PCNET). O `Módulo1` muda várias conclusões anteriores do plano:

**a) A leitura ("Ver FAV") não usa cliente HTTP — usa navegação direta de página, e aceita um identificador via URL:**

A `Sub AbrirFAV(FAV)` não replica os 4 passos mapeados manualmente na seção 2.5. Em vez disso, abre o navegador padrão do Windows (`VBA.Shell "Explorer.exe " & <endereço configurado na aba Endereços e Frases>`) e usa `SendKeys` para digitar e confirmar esta URL:

```
https://www.pcnet.mg.gov.br/PCnet/cadeiacustodiasel.do?evento=gerarFav&idMaterial=<ID>
```

Isso é um **endpoint diferente** do `custodiasel.do` testado manualmente, e **aceita o identificador direto como parâmetro GET** (`idMaterial=`). Contradiz a conclusão da seção 2.5 de que "não é possível montar um link estático por FAV".

**✅ CONFIRMADO em 2026-07-24 (teste real, ETAPA 0 do plano de execução):** `idMaterial` aceita diretamente o **número de FAV como o usuário digita** (não exige ID interno). Testado com duas FAVs conhecidas, colando a URL direto na barra de endereço, com o PCNET já logado em outra aba:
- `idMaterial=809320` → abriu a FAV 809320 correta (REDS `2022-049085152-001`, material "TELEFONE CELULAR - 01 celular Iphone de cor prata", invólucro `5073649` — todos batendo com os dados já documentados na seção 2.4).
- `idMaterial=904527` → abriu a FAV 904527 correta (REDS `2023-036085412-001`, material "TELEFONE CELULAR, marca REDMI...", invólucro `3190977`).

**Conclusão: a Ação 1 (Ver FAV) é, de fato, um link direto e simples — `window.open()` com a URL montada a partir de `registroFav`, sem nenhum passo de busca prévio, sem UI.Vision, sem extensão.** Isso simplifica a ETAPA 3 do plano de execução (Parte 4): não há mais dependência da ETAPA 0 completa para essa etapa específica, só desse item já confirmado.

**b) Não há problema de CORS/cookie cross-site nesse mecanismo — é navegação de página inteira, não fetch/XHR:**

Como a macro simplesmente abre uma URL no navegador (equivalente a digitar na barra de endereço ou clicar num link), o navegador aplica cookies de sessão do jeito normal — não é uma chamada JavaScript entre origens dentro de uma página do EvidenceOS. Isso **muda a avaliação da Opção C da tabela da seção 3.4**: para a Ação 1 (Ver FAV), abrir uma nova aba/janela apontando para essa URL a partir do EvidenceOS deve funcionar **sem exigir extensão de navegador**, desde que o navegador do usuário já tenha a sessão do PCNET ativa em alguma aba (mesmo perfil de navegador). Simplifica bastante a Ação 1 em relação ao que se pensava.

**c) O identificador usado nas ações de escrita é `idMaterialCustodiado`, obtido via scraping de uma busca por Requisição — não o número de FAV digitado:**

A `Sub AbrirReq(Req)` monta um script (formato UI.Vision, ver item "d") que abre `https://www.pcnet.mg.gov.br/APP/inicial.do?evento=iniciar`, navega até a pesquisa por **Nº de Requisição** (campo `id=identificador_id_Arg`, botão `id=btnPesquisar`), e clica num link/ícone dentro do resultado (xpath apontando pra uma `<img>` numa tabela) — isso indica que **é preciso passar pela tela de busca por requisição para obter o link/ID de cada material antes de poder abrir a FAV ou registrar movimentação diretamente por ID**. Ou seja: `idMaterialCustodiado`/`idMaterial` não é digitado pelo usuário, é **extraído da página de resultado da busca**. Isso é coerente com o modelo de estado em sessão (`itensPlc[]`) já mapeado na seção 2.5, só que agora sabemos que existe, além do fluxo por sessão, **um identificador estável (`idMaterialCustodiado`) que pode ser reutilizado depois** para pular direto para as telas de FAV/escrita sem repetir a busca — mas só depois de uma primeira busca que revele esse ID.

**d) As ações de escrita usam automação de navegador via UI.Vision (RPA), não POST HTTP direto — e isso é evidência real do padrão institucional que faltava (seção 2.9):**

A `Sub GerarCodUIVision` monta um script em JSON no formato do **UI.Vision** (ferramenta de RPA / sucessora do Selenium IDE, distribuída como extensão de navegador para Chrome/Firefox) e grava esse script num arquivo/planilha para ser executado pela extensão. O script contém passos de `open` (navegar até a URL), `storeText`/`if`/`throwError` (lê o número da FAV exibido na página e aborta com erro se não bater com o esperado — checagem de segurança que vale reaproveitar no EvidenceOS), `click` em rádio/campos, `type` em textarea, e `click` final em `btnGrava`.

Isso **confirma tecnicamente** que pelo menos um dos dois sistemas artesanais da PCMG já usa exatamente o padrão de "extensão de navegador rodando dentro da origem autenticada" recomendado na seção 2.8 — só que usando uma ferramenta de RPA genérica (UI.Vision) já existente no mercado, em vez de uma extensão própria. Vale avaliar se o EvidenceOS deveria integrar com UI.Vision (ou ferramenta equivalente) em vez de desenvolver uma extensão própria do zero.

**Endpoints e nomes de campos de escrita confirmados a partir do código (sem precisar testar contra produção):**

| Ação | Endpoint | Campo de finalidade (rádio, atributo `id`/`name=finalidade`) |
|---|---|---|
| Recebimento | `sobcustodiaman.do?evento=x&idMaterialCustodiado=<ID>` | `finalidade0` |
| Transporte (caso "positivo", material com invólucro) | `sobcustodiaman.do?evento=x&idMaterialCustodiado=<ID>` | `finalidade1` |
| Exame Pericial | `sobcustodiaman.do?evento=x&idMaterialCustodiado=<ID>` | `finalidade2` |
| Transporte/Destinação (caso "consumido"/negativo) | `destinacaoman.do?evento=x&idMaterialCustodiado=<ID>` | `finalidade5` |

Demais campos do formulário: `observacao` (textarea, texto livre da movimentação), `houveRompimentoLacre0`/`houveRompimentoLacre1` (rádio Não/Sim), `involucroNumero` (texto, número do lacre), `involucroNaoSeAplicaStr` (checkbox "não se aplica"), `involucroDescricao` (textarea, usado quando não há número de invólucro, ex. "Todo o material enviado a exames foi consumido"), botão `btnGrava` (submete o formulário), seguido de um clique de confirmação numa imagem dentro do próprio formulário (`xpath=//*[@id="form"]/table/tbody/tr/td/img`) — indica que existe uma **segunda confirmação visual após o Salvar**, relevante para o desenho do nosso próprio modal de confirmação (o PCNET já tem uma etapa de confirmação nativa; nosso modal seria anterior a isso, do lado do EvidenceOS).

**Ponto de atenção de segurança — não replicar esse comportamento no EvidenceOS:** o script gerado por `GerarCodUIVision` executa a sequência completa (abrir → preencher → `btnGrava` → confirmar) **para todas as linhas marcadas de uma vez, em lote, sem pausa para confirmação individual**. Isso é o oposto da decisão já tomada na seção 2.6 (modal de confirmação por ação, mostrando os dados da FAV, antes de cada escrita). Ao desenhar a extensão/integração do EvidenceOS, cada ação de escrita deve manter sua própria confirmação explícita, mesmo que tecnicamente fosse possível automatizar em lote como a planilha faz.

**Pendências geradas por este achado:**
- Confirmar se `idMaterial`/`idMaterialCustodiado` pode ser derivado do número de FAV (`registroFav`) diretamente, ou se **sempre** exige um passo de busca prévio (por Requisição ou por FAV) para ser descoberto — isso decide se a Ação 1 do EvidenceOS pode ser um link direto por FAV ou precisa de um passo de busca primeiro.
- Mapear o significado completo dos índices de `finalidade` (0=Recebimento, 1=Transporte, 2=Exame Pericial confirmados; falta confirmar 3, 4 e 5 — a lista de finalidades do PCNET tinha 5 opções: Recebimento, Transporte, Exame Pericial, Distribuição, Guarda).

**Viabilidade do UI.Vision confirmada (pesquisa em 2026-07-24) — recomendação técnica:**

- **Gratuito e sem limitação para uso comercial**: é open-source ("free for personal and commercial use"). Automação de navegador (abrir página, preencher formulário, clicar, salvar) é ilimitada na versão gratuita. Os planos pagos (Pro US$299/ano, Enterprise US$999/ano, Enterprise Player US$1.499/ano) só adicionam suporte prioritário, gestão de atualização e licença para rodar em várias máquinas sem criar macro nova — **não são necessários** para o caso de uso do EvidenceOS.
- **Navegadores suportados:** Chrome, Firefox e Edge, via lojas oficiais de extensão.
- **Existe mecanismo oficial e documentado para disparar macros a partir de um site externo**: uma página web pode enviar o JSON do macro via JavaScript diretamente para a extensão UI.Vision já instalada no navegador do usuário, que then executa a automação dentro da aba correta. A extensão pede confirmação numa caixa de diálogo antes de rodar (pode ficar como segunda camada de confirmação, além do nosso próprio modal de escrita) ou o domínio do EvidenceOS pode entrar numa whitelist para pular esse aviso.
- **Conclusão:** o UI.Vision é uma opção real e recomendada para a arquitetura da seção 2.8, evitando desenvolver e manter uma extensão de navegador própria do zero — o EvidenceOS ficaria responsável só por gerar o JSON do macro (reaproveitando os endpoints/campos já mapeados acima) e enviá-lo via JS para a extensão já instalada no navegador do usuário.
- **Pendente:** validar na prática o fluxo de disparo (JS do EvidenceOS → UI.Vision → PCNET) num ambiente de teste, e decidir se o EvidenceOS deve orientar/exigir a instalação do UI.Vision como pré-requisito (documentar isso na tela de configuração/ajuda), já que ainda depende de instalação manual por máquina, igual uma extensão própria teria.

### 2.6 Mudança de escopo: ações de escrita no PCNET (não só leitura)

Até aqui, o mapeamento cobriu apenas **"Ver FAV"**, que é uma ação de **leitura** (gera e retorna um PDF, sem alterar nada no PCNET).

Em 2026-07-24 o usuário mostrou que a intenção também inclui ações de **escrita**: registrar movimentações de custódia diretamente no PCNET a partir do EvidenceOS — especificamente **Sob Custódia, Recibo, Transporte e Destinação Final** (os mesmos botões que aparecem na tela "Movimentação FAV" do PCNET, ao lado de "Ver FAV").

Primeira tela mapeada — **"Sob Custódia"** (popup em `www.pcnet.mg.gov.br/PCnet/sobcustodiaman.do?evento=x&multMateriais=S&modoJanelaPlc=popup`):

| Campo | Tipo | Observação |
|---|---|---|
| Finalidade | rádio (única escolha) | opções: `Recebimento`, `Transporte`, `Exame Pericial`, `Distribuição`, `Guarda` — bate exatamente com os valores da coluna "Finalidade" da tabela "Cadeia de Responsabilidade" vista no PDF da FAV |
| Observação | texto livre (textarea) | vira o texto da coluna "Observação" na cadeia de responsabilidade |
| Houve rompimento do lacre? | rádio Sim/Não | relacionado à seção "Rompimento de Lacre" do PDF |
| Bens Selecionados | tabela somente leitura | mostra os itens já selecionados na tela anterior (Classificação, Descrição, Nº da FAV, Nº/Descrição do Lacre) — confirma que a seleção de item feita na tela de busca é reaproveitada aqui, reforçando o modelo de estado em sessão (`itensPlc`) já mapeado na seção 2.5 |

Botões: `Salvar` (grava a movimentação — ação de escrita) e `Fechar`.

**Implicação para o plano (importante):** ao contrário do "Ver FAV", esta e as próximas telas (Recibo, Transporte, Destinação Final) **escrevem dados no PCNET em nome do usuário**. Isso muda a classificação de risco do projeto:

- Deixa de ser só "exibir link/PDF de terceiro" e passa a ser "o EvidenceOS aciona uma ação que altera o registro oficial de cadeia de custódia de outro sistema (PCMG)".
- Cai diretamente na Regra de Ouro do CLAUDE.md deste projeto: qualquer lógica que toque cadeia de custódia exige **Resumo de Impacto de Segurança e Auditoria** antes de qualquer implementação, com aprovação explícita.
- Perguntas que precisam de resposta antes de implementar:
  - Quem tem permissão, no EvidenceOS, para disparar uma escrita no PCNET (todos os perfis ou só ADMIN/PERITO)?
  - Se a escrita falhar no meio do fluxo (sessão expirada, erro de validação do PCNET), como o EvidenceOS soube e informa o usuário — e evita duplicar o registro?
  - O EvidenceOS deve manter seu próprio log de auditoria de "quem mandou gravar o quê no PCNET, quando", independente do log do próprio PCNET?
  - Existe risco de o usuário do EvidenceOS registrar uma movimentação no PCNET achando que é só uma anotação interna do EvidenceOS, sem perceber que está alterando o sistema oficial?

**Decisões confirmadas pelo usuário (2026-07-24):**
1. **Permissão:** todos os perfis podem disparar ações no PCNET a partir do EvidenceOS — não há restrição adicional por perfil, porque a própria condição de funcionamento (estar logado no PCNET em outra aba) já é uma barreira natural: quem não tiver login/permissão no PCNET simplesmente não consegue completar a ação, independente do perfil no EvidenceOS.
2. **Falha no meio do fluxo:** deve retornar erro claro na UI do EvidenceOS, nunca falhar silenciosamente nem tentar recuperar sozinho. O usuário confirma que **é comum o PCNET perder a sessão** (expira / desloga sozinho) — esse é o cenário de erro mais esperado, não uma exceção rara. **⭐ Nota (2026-07-24, arquitetura final — ver ETAPA 4/6 do plano de execução):** com a decisão de não automatizar o preenchimento (o EvidenceOS só abre a tela do PCNET, o usuário preenche e salva manualmente), essa preocupação passou a ser resolvida "de graça" — se a sessão caiu, quem mostra a tela de login é o próprio PCNET, na aba aberta, do mesmo jeito que já acontece quando o usuário navega manualmente. O EvidenceOS não precisa (e não tem como) detectar isso programaticamente.
3. **Auditoria própria:** confirmado — o EvidenceOS deve manter seu próprio log de auditoria de "quem mandou gravar o quê no PCNET, quando", independente do log do PCNET. Com a arquitetura final, esse log registra a **solicitação/abertura** da tela, não a confirmação de que o usuário de fato salvou (ver ETAPA 1/2).
4. **Confirmação antes de escrever:** deve aparecer um aviso antes de abrir a tela de ação de escrita (Recebimento/Transporte), mostrando a FAV e avisando que a movimentação será gravada no PCNET se o usuário salvar lá dentro. **⭐ Ajuste (2026-07-24):** o usuário optou por um **aviso leve** (não um modal pesado) nessa versão simplificada, já que quem efetivamente confirma a escrita agora é o próprio PCNET (sua própria tela de "Salvar" + confirmação) — ver ETAPA 6 do plano de execução.

**Pendente:** usuário vai enviar, para cada uma das telas restantes (Recibo, Transporte, Destinação Final), o link/URL e os prints do F12 (Requisição) — mesmo processo já usado para "Ver FAV" e "Sob Custódia".

### 2.7 Restrição confirmada para testes de escrita (2026-07-24)

O usuário não pode testar ao vivo as ações de escrita (Sob Custódia/Recebimento, Transporte, Destinação Final etc.) clicando em "Salvar" no ambiente real do PCNET, porque:

- Ele está logado no PCNET com seu próprio usuário/credencial real.
- Qualquer "Salvar" de teste **move de verdade** a FAV no sistema oficial da PCMG, registrando a movimentação **em nome dele** na cadeia de responsabilidade real daquele vestígio.
- Isso não é reversível de forma simples (é um registro oficial de cadeia de custódia), então não dá para "simular" a escrita sem consequência real.

**Impacto direto no plano:** o mapeamento dos payloads de escrita (Recebimento, Transporte, Sob Custódia, Destinação Final) **não pode ser obtido pela mesma técnica usada até aqui** (preencher e clicar "Salvar" observando o F12), porque isso executaria a ação de verdade. Isso reforça ainda mais a gravidade do ponto já levantado na seção 2.6 — qualquer automação futura que dispare essas ações a partir do EvidenceOS terá o mesmo efeito real e irreversível no PCNET, em nome de qual usuário estiver autenticado.

**Alternativas a considerar para completar o mapeamento sem gerar movimentação real:**
- Perguntar à PCMG/equipe responsável pelo PCNET se existe ambiente de homologação/teste separado do ambiente de produção.
- Mapear os campos do formulário (via inspeção do HTML/JS da página, sem submeter) para inferir os nomes dos campos do POST sem precisar efetivamente clicar em "Salvar" — dá pra ver os `name` dos inputs no HTML sem enviar o formulário.
- Se o usuário tiver acesso a alguma FAV de teste/descartável (um vestígio real mas de baixíssima relevância, ciente do registro), considerar um teste único e controlado, deixando claro que é irreversível.
- Aguardar confirmação futura sobre se a integração de escrita é realmente necessária na primeira fase, ou se a fase inicial do produto deve ficar restrita a ações de leitura (Ver FAV), deixando escrita para uma fase 2 com mais garantias.

### 2.8 Arquitetura técnica proposta: extensão de navegador (2026-07-24)

O usuário esclareceu um ponto que redireciona a arquitetura: **não se trata de guardar credenciais do PCNET no EvidenceOS**. A condição é apenas que o usuário esteja **logado no PCNET em outra aba/janela do navegador** (login manual dele, incluindo o 2FA do PCNET). O usuário relatou que **já existem dois outros sistemas da PCMG que funcionam sob essa mesma condição** — o que aponta fortemente para uma arquitetura conhecida:

**Extensão de navegador com content script**, em vez de qualquer chamada direta do backend/frontend do EvidenceOS ao PCNET:

1. O usuário faz login manualmente no PCNET numa aba comum do navegador (com 2FA, como sempre).
2. Uma extensão de navegador instalada na máquina do usuário tem permissão declarada para rodar um "content script" dentro da origem `www.pcnet.mg.gov.br` — isso contorna CORS porque o código roda *dentro* da origem do PCNET, usando a sessão (cookies) que já está ativa naquela aba. A extensão nunca vê nem manipula login/senha/token — só reaproveita uma sessão já autenticada pelo próprio usuário.
3. O EvidenceOS (rodando em outra aba/origem) manda uma mensagem para a extensão (via mecanismo de mensageria de extensão do navegador) pedindo uma ação, ex.: "registrar Recebimento na FAV 1757928".
4. A extensão localiza a aba do PCNET já logada e executa ali, programaticamente, a mesma sequência de passos já mapeada manualmente nas seções 2.5/2.6 (busca → seleção → preencher formulário → salvar) — como se fosse o próprio usuário interagindo, só que automatizado.
5. A extensão devolve o resultado (sucesso/erro) para o EvidenceOS, que registra em auditoria.

**Isso explica todos os pontos que o usuário levantou:**
- Não precisa guardar senha — a extensão só herda uma sessão já autenticada pelo usuário.
- Resolve o 2FA — o 2FA acontece uma vez, no login manual do usuário na aba do PCNET; a extensão nunca precisa refazer login.
- Exige o PCNET aberto e logado em outra janela — é exatamente a dependência de uma extensão que herda sessão de aba, não cria sessão própria.

**Consequência para o plano:** a implementação deixa de ser "só frontend/backend do EvidenceOS" e passa a incluir o desenvolvimento (ou reaproveitamento) de uma **extensão de navegador** como peça de infraestrutura própria. Isso é um projeto técnico à parte, com escopo, manutenção e distribuição próprios (a extensão precisa ser instalada em cada máquina que for usar a funcionalidade).

**Pendente/ação recomendada:** identificar quem desenvolve/mantém os dois outros sistemas da PCMG que já usam esse padrão, e verificar se existe uma extensão institucional já em uso que dê para reaproveitar ou estender (evitar duplicar esse desenvolvimento do zero, e herdar validações de segurança que aquele projeto já tenha passado).

**Atualização (2026-07-24):** o usuário confirmou que **não existe nada institucional/oficial** por trás desses dois sistemas — não são mantidos por uma equipe formal da PCMG que se possa contatar. São dois exemplos artesanais, cada um com uma abordagem diferente:

1. **Programa instalado na máquina** (não é SaaS) — arquitetura desconhecida, provavelmente um app desktop (Windows) que também depende de o usuário estar logado no PCNET no navegador, ou que replica sessão de outra forma. Sem mais detalhes por ora.
2. **Planilha Excel** — o usuário clica em "Ver FAV" na planilha e ela **abre o PDF da FAV direto do PCNET**. Ou seja, já é a prova de que o fluxo de leitura (Ação 1, seção 3.1) é replicável fora de uma extensão de navegador, quase certamente via uma **macro VBA** que reproduz as mesmas 4 requisições HTTP já mapeadas na seção 2.5 (busca → seleção → abrir popup → GET do PDF), aproveitando cookies de sessão do Windows/Internet Explorer ou fazendo a chamada HTTP diretamente com o `JSESSIONID` capturado de alguma forma.

**Ação recomendada, alta prioridade:** pedir esse arquivo `.xlsx` ao usuário e abrir o editor VBA (`Alt+F11`) para ler o código-fonte da macro de "Ver FAV". Isso pode: (a) confirmar/documentar o payload exato das 4 requisições sem precisar testar contra produção; (b) revelar como a macro obtém a sessão autenticada (indício de mecanismo alternativo à extensão de navegador, possivelmente mais simples de implementar para leitura); (c) servir de referência de como um cliente HTTP com estado (cookie jar) resolveria isso no EvidenceOS, caso se opte por uma abordagem sem extensão para a Ação 1 (Ver FAV). Não invalida a necessidade da extensão para as Ações 2/3 (escrita), mas pode simplificar a Ação 1.

### 2.9 Próximos passos

1. Descobrir quem mantém os dois sistemas da PCMG que já usam essa arquitetura de extensão + sessão do PCNET, e se há uma extensão institucional reaproveitável (ver 2.8).
2. Mapear os campos de "Recibo/Recebimento" e "Transporte" **sem submeter o formulário de verdade** — usar a aba "Inspetor" do F12 (não "Ver código-fonte", que está bloqueado nesse popup) para ler o atributo `name` dos inputs de Finalidade, Observação e Rompimento de Lacre.
3. Confirmar o padrão de URL/fluxo para "Recibo" e "Transporte" (provavelmente reaproveitam o mesmo `sobcustodiaman.do`, variando o valor de Finalidade) e para "Destinação Final" (URL ainda não mapeada).
4. Confirmar qual identificador vamos usar para linkar vestígio ↔ FAV no PCNET — `registroFav` do EvidenceOS bate com o "Nº da FAV" do PCNET (confirmado: `809320` ⇄ `000809320`, só difere no zero-padding).
5. Desenhar os botões de ação na `VestigeCard.tsx` (Ver FAV, Receber Vestígio, Transportar Vestígio, e futuramente Destinação Final), cientes de que cada um depende da extensão de navegador estar instalada e do PCNET estar logado em outra aba — desenhar também o estado de "indisponível" quando a extensão não estiver presente.
6. Avaliar se cabe também replicar informações-chave do PCNET (situação, unidade da última movimentação) como complemento no próprio card do EvidenceOS — isso já seria trazer dado do PCNET para dentro do nosso sistema, não só linkar.
7. Levantar Resumo de Impacto de Segurança e Auditoria antes de qualquer implementação de código — tanto pelo lado das ações de escrita (irreversíveis, em nome do usuário autenticado) quanto pela introdução de uma extensão de navegador com acesso à sessão de um sistema de terceiros (superfície de segurança nova, exige revisão de permissões declaradas pela extensão).

---

## Parte 3 — Escopo consolidado: as 3 ações-alvo e como implementar cada uma

Consolidando tudo mapeado até 2026-07-24. O escopo confirmado da integração são estas **3 ações**, todas disparadas a partir do card do vestígio no EvidenceOS (`VestigeCard.tsx`, sem tela nova):

### 3.1 Ação 1 — Abrir/Ver FAV (leitura)

- **O que faz:** gera e exibe o PDF oficial da Ficha de Acompanhamento de Vestígio no PCNET (documento completo: coleta, acondicionamento, cadeia de responsabilidade, situação do material, rompimento de lacre).
- **Natureza:** leitura pura — não altera nada no PCNET.
- **Fluxo mapeado e confirmado (4 requisições, mesmo endpoint `custodiasel.do`, ver seção 2.5 para detalhe completo):**
  1. `POST custodiasel.do`, `evento: "F9-Pesquisar"`, `numeroDaFAV_Arg: "<FAV>"` → busca, popula `itensPlc[]` em sessão.
  2. `POST custodiasel.do`, `evento: "SelecionarItem"`, `itensPlc[0].flagSelecionada: "S"` → seleciona o resultado.
  3. `POST custodiasel.do?evento=abrirPopUp` → sinaliza abertura do popup da FAV selecionada.
  4. `GET custodiasel.do?evento=gerarFav&jmodoJanelaPlc=popup` → retorna o PDF.
- **Status do mapeamento:** completo para o caso de 1 único resultado (índice `0`). Falta validar cenário de busca sem resultado e com múltiplos resultados (ver pendência na seção 2.5).
- **Identificador de link:** `registroFav` do EvidenceOS ⇄ "Número da FAV" do PCNET, mesmo valor com zero-padding (`809320` ⇄ `000809320`).

### 3.2 Ação 2 — Movimentar FAV (escrita) — ⭐ consolidação final (2026-07-24)

> **Nota:** esta seção descrevia originalmente duas ações separadas, "Dar Recebimento" (Ação 2) e "Dar Transporte" (Ação 3), cada uma com sua própria tela/botão previstos no EvidenceOS. Em 2026-07-24, depois de confirmar que a tela do PCNET é **a mesma para as duas** (só muda qual rádio de Finalidade o usuário marca — e isso passou a ser feito manualmente pelo próprio usuário, não mais automatizado, ver seção 3.4 e ETAPA 6 do plano de execução), as duas ações foram **unificadas num único botão "Movimentar FAV"** no EvidenceOS. O conteúdo abaixo foi atualizado para refletir isso.

- **O que faz:** abre a tela "Sob Custódia" do PCNET, já carregada com a FAV certa, onde o usuário escolhe manualmente a Finalidade (Recebimento, Transporte, Exame Pericial, Distribuição ou Guarda), escreve a observação, ajusta invólucro/lacre se precisar, e clica "Salvar" — tudo dentro do PCNET, exatamente como já faz hoje.
- **Natureza:** o EvidenceOS **não escreve nada** — só abre a tela certa. A escrita de fato (irreversível, oficial, em nome do usuário autenticado) acontece quando o próprio usuário clica "Salvar" dentro do PCNET. O EvidenceOS não tem como confirmar programaticamente se isso aconteceu (ver ETAPA 6).
- **Tela mapeada:** "Sob Custódia", acessível diretamente via `www.pcnet.mg.gov.br/PCnet/sobcustodiaman.do?evento=x&idMaterialCustodiado=<registroFav>` — **confirmado por teste real em 2026-07-24** (ver ETAPA 0 item 4, seção 2.5.1): abre o formulário certo, com a FAV e os "Bens Selecionados" corretos, sem nenhum passo de busca prévio.
- **Campos da tela** (para referência, preenchidos manualmente pelo usuário, não pelo EvidenceOS): Finalidade (rádio — `finalidade0`=Recebimento, `finalidade1`=Transporte, `finalidade2`=Exame Pericial, `finalidade3`=Distribuição, `finalidade4`=Guarda — ordem confirmada na ETAPA 0 item 3), Observação (texto livre), Houve rompimento do lacre? (Sim/Não), tabela somente-leitura dos "Bens Selecionados".
- **Status do mapeamento:** ✅ completo para o propósito da integração (abrir a tela certa). O payload exato do POST de "Salvar" **não precisa mais ser mapeado** — deixou de ser relevante, já que o EvidenceOS nunca submete esse formulário (arquitetura simplificada, ver ETAPA 6).

### 3.4 Formas possíveis de implementar (arquitetura), com prós e contras

> Tabela mantida como registro histórico da análise que levou à decisão final (ver "⭐ Atualização final" logo abaixo dela). A Opção A, avaliada aqui como "parcial", acabou sendo a solução completa depois que os testes da ETAPA 0 confirmaram o link direto por FAV.

| Opção | Como funciona | Viável para leitura (Ação 1)? | Viável para escrita (Ação 2)? | Prós | Contras |
|---|---|---|---|---|---|
| **A. Link simples / abrir aba do PCNET** | Botão no EvidenceOS abre uma nova aba na URL do PCNET; usuário refaz manualmente busca/seleção/ação | Parcial — não existe link direto por FAV (ver 2.5), usuário ainda digitaria a FAV de novo | Parcial, mesma limitação | Zero risco técnico, zero infraestrutura nova | Não é realmente automação — só um atalho; usuário ainda faz tudo manualmente |
| **B. Backend do EvidenceOS chamando o PCNET diretamente (HTTP)** | Servidor do EvidenceOS reproduz as requisições mapeadas, mantendo cookies de sessão | Só se o backend tiver a sessão do usuário no PCNET | Só se o backend tiver a sessão do usuário no PCNET | Automação completa, um clique | **Exigiria guardar/receber credenciais ou cookies de sessão do PCNET no nosso servidor** — rejeitado pelo usuário e pelo próprio 2FA do PCNET, que inviabiliza login automatizado pelo backend |
| **C. Formulário cross-origin direto do navegador (sem extensão)** | Página do EvidenceOS submete um formulário HTML direto para o PCNET, contando com o cookie de sessão já existente no navegador | Incerto — depende do atributo `SameSite` do cookie de sessão do PCNET (aplicação antiga, pode não declarar `SameSite`, o que faria o navegador assumir `Lax` e bloquear POST entre sites); testável sem risco, pois a busca é só leitura | Mesma incerteza, mas com risco real se testado incorretamente (pode disparar a escrita) | Não exige extensão nem projeto de infraestrutura novo | Não garantido que funcione (política de cookie); e mesmo funcionando, não dá para ler a resposta via JS (CORS) — funcionaria só como navegação, não como automação silenciosa |
| **D. Extensão de navegador com content script (recomendada, ver seção 2.8)** | Extensão instalada no navegador do usuário roda um script dentro da própria origem do PCNET, reaproveitando a sessão (cookies) já autenticada numa aba aberta pelo usuário; o EvidenceOS manda mensagens para a extensão pedindo a ação | Sim | Sim | Não guarda senha nem lida com 2FA (reaproveita sessão já aberta); contorna CORS porque roda dentro da origem do PCNET; é o padrão que, segundo o usuário, já é usado por dois outros sistemas da PCMG | Exige desenvolver/manter uma extensão de navegador (instalação por máquina, distribuição, atualização); ainda depende do usuário ter o PCNET aberto e logado em outra aba |

**Recomendação registrada (histórico):** a Opção D (extensão de navegador) foi inicialmente considerada a única que atenderia de forma confiável e sem armazenar credenciais tanto a Ação 1 (leitura) quanto as Ações 2 e 3 (escrita), e era consistente com o padrão que o usuário relatou já existir em outros sistemas da PCMG.

**Atualização (2026-07-24, achado intermediário):** dentro da Opção D, a recomendação concreta passou a ser usar o **UI.Vision RPA** (extensão gratuita, open-source, para Chrome/Firefox/Edge — ver seção 2.5.1) em vez de desenvolver uma extensão própria do zero.

**⭐ ATUALIZAÇÃO FINAL (2026-07-24) — decisão de arquitetura efetivamente adotada, substitui as recomendações acima:** testes reais confirmaram que **tanto a leitura (`idMaterial=<FAV>`) quanto a escrita (`idMaterialCustodiado=<FAV>`) aceitam a FAV diretamente como parâmetro de URL** (ver seção 2.5.1 e ETAPA 0 do plano de execução, Parte 4). Isso significa que a **Opção A (link simples)**, inicialmente descartada como "parcial" na tabela acima, na verdade **resolve as 2 ações por completo** (Ver FAV + Movimentar FAV) — não só a leitura. **Nenhuma extensão de navegador, UI.Vision ou automação de qualquer tipo é necessária.** O EvidenceOS só abre a tela certa do PCNET (com a FAV já carregada) em uma nova aba; quem preenche e clica "Salvar" na ação de escrita é sempre o próprio usuário, dentro do PCNET, exatamente como já faz hoje — só que sem precisar buscar a FAV manualmente. Ver ETAPA 4 (Parte 4) para o registro formal dessa mudança de arquitetura e o motivo.

**A Ação 2 (Movimentar FAV, escrita) continua exigindo Resumo de Impacto de Segurança e Auditoria formal antes de qualquer implementação** (ver ETAPA 5, Parte 4), mesmo com a arquitetura simplificada — o EvidenceOS ainda está facilitando acesso a uma ação irreversível em nome do usuário autenticado, tocando cadeia de custódia oficial de terceiro (PCMG) — conforme a Regra de Ouro do CLAUDE.md deste projeto.

---

## Parte 4 — Plano de Execução (passo a passo)

Convenção de status usada em cada etapa: `⬜ Não iniciado` / `🟨 Em andamento` / `✅ Concluído` / `⛔ Bloqueado`. Ao retomar o trabalho, releia o `**Status:**` e a `**Nota de retomada:**` de cada etapa antes de continuar — não repita trabalho já feito, e não avance etapa sem que a anterior esteja `✅`.

Arquivos reais do projeto que as etapas abaixo vão tocar (confirmados por leitura direta do código em 2026-07-24, não hipotéticos):
- Frontend: `client/components/VestigeCard.tsx` (área de ações, linha ~178 `{/* Actions Area */}`), `client/services/dataService.ts` (client HTTP do front), `client/.env.local` (config de front).
- Backend: `server/src/routes/vestigeRoutes.ts` (padrão de rota a seguir), `server/src/services/auditService.ts` (`auditService.log(...)`, já pronto para reaproveitar), `server/prisma/schema.prisma` (models `Vestige`, `AuditLog`, `VestigeDestinationLog` — usar como referência de estilo para o novo model de log do PCNET).

### ETAPA 0 — Confirmações técnicas pendentes (sem escrever código)

**Status:** ✅ Concluído (4 de 4 itens resolvidos em 2026-07-24)

**Objetivo:** fechar as dúvidas técnicas que, se erradas, invalidam trabalho de código feito nas etapas seguintes. Todo item aqui é validável **sem gerar movimentação real** no PCNET (nenhum "Salvar").

**O que fazer:**
1. ✅ **CONCLUÍDO (2026-07-24):** Testado `https://www.pcnet.mg.gov.br/PCnet/cadeiacustodiasel.do?evento=gerarFav&idMaterial=<FAV>` colando direto na barra de endereço, com o PCNET logado em outra aba — testado com FAV `809320` e FAV `904527`, ambas abriram o PDF correto na primeira tentativa (dados batendo: REDS, material, invólucro, tudo conferido contra o que já estava documentado na seção 2.4). **Confirmado: o parâmetro `idMaterial` aceita o número de FAV digitado normalmente, sem precisar de ID interno nem busca prévia.** Detalhe completo na seção 2.5.1-a.
2. ✅ **Resolvido, mas a conclusão inicial estava invertida — corrigido em 2026-07-24 com esclarecimento do usuário.** Confirmado: **1 Nº de Requisição corresponde sempre a exatamente 1 vestígio/material** — isso continua valendo, e elimina o risco de "escolher a linha errada" numa busca por Requisição (o passo de seleção por índice fixo `itensPlc[0]` continua seguro por esse lado).
   **Porém a relação inversa é a real fonte de risco: 1 FAV/vestígio pode ter *várias* Requisições ao longo do tempo** (exemplo real dado pelo usuário: uma faca teve uma requisição de exame de eficiência e, uma semana depois, outra requisição de coleta de material para exame de DNA — mesma FAV, duas requisições diferentes em momentos diferentes). Isso tem duas consequências:
   - **Confirma uma limitação de modelo de dados já registrada na seção 1.3** ("Não existe modelo/entidade `Requisicao` — é só uma string solta no vestígio"): o campo `Vestige.requisicao` no EvidenceOS guarda **um único valor**, então não representa o histórico completo de requisições de um vestígio que teve mais de uma no PCNET. Fora do escopo desta integração por ora, mas relevante para qualquer decisão futura de modelar `Procedimento`/`Requisicao` como entidade própria (ver "Decisões em aberto" no fim do documento).
   - **Risco direto para o fluxo de escrita (ETAPAS 5/6):** o mecanismo mapeado na planilha (`Sub AbrirReq`) descobre o `idMaterialCustodiado` **buscando pela Requisição**, não pela FAV. Se a automação do EvidenceOS usar o valor salvo em `Vestige.requisicao` (que pode ser só uma entre várias requisições daquele vestígio, possivelmente desatualizada), corre o risco de buscar a requisição errada. **Ver item 4 abaixo, novo teste criado para resolver isso.**
3. ✅ **Resolvido em 2026-07-24, via a mesma tela usada no item 4** — a ordem visual dos rádios de Finalidade na tela "Sob Custódia" é, da esquerda pra direita: **Recebimento, Transporte, Exame Pericial, Distribuição, Guarda**. Como já tínhamos confirmado por código que `finalidade0`=Recebimento, `finalidade1`=Transporte, `finalidade2`=Exame Pericial (e nesse teste "Exame Pericial" veio marcado por padrão, batendo com `finalidade2`), a sequência confirma: **`finalidade3`=Distribuição, `finalidade4`=Guarda**. (Alta confiança pela ordem sequencial já validada nos 3 primeiros; se quiser 100% de certeza formal, dá pra confirmar depois com "Inspecionar elemento" nos dois rádios, sem necessidade de bloquear a ETAPA 5/6 por isso.)
4. ✅ **Resolvido em 2026-07-24 — achado importante, simplifica a ETAPA 6.** Testada a URL `https://www.pcnet.mg.gov.br/PCnet/sobcustodiaman.do?evento=x&idMaterialCustodiado=809320` diretamente na barra de endereço: **abriu o formulário "Sob Custódia" corretamente**, com a FAV 809320 e o mesmo material/invólucro (5073649) já confirmados antes na tabela "Bens Selecionados". **`idMaterialCustodiado` aceita a FAV diretamente**, do mesmo jeito que `idMaterial` na Ação 1 — **elimina por completo** a necessidade de buscar por Requisição para as ações de escrita, e junto com ela o risco do item 2 (1 FAV pode ter várias Requisições ao longo do tempo — deixou de importar, porque a automação nunca mais vai precisar do campo `requisicao`).

**Critério de conclusão:** ✅ **ETAPA 0 completa — todos os 4 itens resolvidos.** Nenhuma dúvida técnica pendente bloqueando as próximas etapas.

**Nota de retomada:** ETAPA 0 encerrada em 2026-07-24. Resumo dos achados que valem pra quem for direto pra ETAPA 6: usar `registroFav` diretamente como `idMaterialCustodiado` nas URLs de escrita (`sobcustodiaman.do?evento=x&idMaterialCustodiado=<registroFav>`), sem nenhum passo de busca prévio por Requisição. Índices de finalidade completos: 0=Recebimento, 1=Transporte, 2=Exame Pericial, 3=Distribuição, 4=Guarda (5=uso específico de `destinacaoman.do`, endpoint diferente).

---

### ETAPA 1 — Modelo de dados: log próprio de ações no PCNET

**Status:** ✅ Concluído (2026-07-24)

**Objetivo:** implementar a decisão já confirmada na seção 2.6 ("Auditoria própria: o EvidenceOS mantém log próprio de quem mandou gravar o quê no PCNET, quando"). Esta etapa é só schema + migration, sem UI nem chamada real ainda — pode ser feita em paralelo com a ETAPA 0.

**O que fazer:**
1. Em `server/prisma/schema.prisma`, criar um novo model `PcnetActionLog`, seguindo o estilo de `VestigeDestinationLog` (linha ~107) já existente:
   - Campos sugeridos: `id`, `vestigeId` (FK para `Vestige`), `action` (**`VIEW_FAV` | `MOVIMENTAR`** — reduzido de 3 para 2 valores após a consolidação dos botões de escrita num único "Movimentar FAV", ver ETAPA 6), `requestedBy` (FK para `User`), `requestedAt`, `status` (**`SOLICITADO`** — valor único esperado, dado que a arquitetura final, ver ETAPA 6, é só abrir a tela do PCNET numa nova aba; o EvidenceOS nunca confirma programaticamente se o usuário salvou algo lá dentro, então não há "SUCESSO"/"ERRO" reais para essa etapa), `pcnetIdentifier` (o `registroFav` usado na URL, para rastreabilidade). Campo `errorMessage` pode ser removido do desenho original — não há mais cenário de erro capturável pelo EvidenceOS nesta arquitetura (a sessão expirada, se acontecer, é tratada pelo próprio PCNET na aba aberta, fora do alcance do EvidenceOS).
   - Relação com `Vestige` (`vestige VestigeActionLog[]` no model `Vestige`, análogo a `destinationLogs`).
2. Rodar `npm run prisma:migrate` (comando já documentado no CLAUDE.md) para gerar a migration em dev.
3. **Não** criar ainda a rota HTTP que grava nesse log — isso é a ETAPA 2.

**Critério de conclusão:** migration criada e aplicada em dev, model visível no Prisma Client gerado.

**Nota de retomada:** ✅ Feito em 2026-07-24. Model `PcnetActionLog` criado em `server/prisma/schema.prisma` (campos: `vestigeId`, `action`, `status` default `SOLICITADO`, `pcnetIdentifier`, `requestedBy`, `requestedAt`; relações com `Vestige.pcnetActionLogs` e `User.pcnetActionLogs`). **Atenção para quem for rodar migrations neste projeto:** `npx prisma migrate dev` **falha** com erro `P3014` porque o usuário do banco local (`evidenceos_app`, definido no `docker-compose.yml`) não tem permissão para criar o shadow database. A solução usada foi escrever a migration SQL manualmente (mesmo padrão das migrations já existentes) em `server/prisma/migrations/20260724_0001_add_pcnet_action_log/migration.sql` e aplicar com `npx prisma migrate deploy`, que não usa shadow database. Depois, `npx prisma generate` para regenerar o client.

---

### ETAPA 2 — Backend: rota para registrar o resultado de uma ação no PCNET

**Status:** ✅ Concluído (2026-07-24)
**Depende de:** ETAPA 1 concluída ✅.

**Objetivo:** um endpoint que o frontend chama **logo depois de abrir a aba do PCNET** (ETAPA 3/6) — o backend do EvidenceOS **nunca fala com o PCNET diretamente** (ver Opção B rejeitada na seção 3.4) e não recebe confirmação de sucesso/erro de nada (arquitetura simplificada, sem automação — ver ETAPA 4/6). Esta rota só registra que a ação foi solicitada, para fins de auditoria.

**O que fazer:**
1. Criar `server/src/routes/pcnetRoutes.ts`, seguindo o padrão de `vestigeRoutes.ts` (hook `onRequest` com `request.jwtVerify()`, schema de validação com Zod).
2. Rota `POST /api/vestiges/:id/pcnet-actions` — body: `{ action: 'VIEW_FAV'|'MOVIMENTAR', status: 'SOLICITADO', pcnetIdentifier: string }`.
   - Grava no novo model `PcnetActionLog` (ETAPA 1).
   - Chama também `auditService.log(...)` (reaproveitar o serviço já existente em `server/src/services/auditService.ts`) com `action: 'PCNET_' + body.action` e `targetType: 'vestige'`, para que a ação apareça também no log de auditoria geral já existente (`AuditLog`), não só no log específico do PCNET.
3. Registrar a rota em `server/src/server.ts`, do mesmo jeito que `vestigeRoutes` já está registrado (procurar `server.register(vestigeRoutes` para replicar o padrão exato de prefixo).
4. Não é preciso `requireEditorAccess`/`requireAdminAccess` aqui — a seção 2.6 já confirmou que **todos os perfis** podem disparar ações no PCNET.

**Critério de conclusão:** rota testável via curl/Postman gravando uma linha em `PcnetActionLog` e em `AuditLog`.

**Nota de retomada:** ✅ Feito em 2026-07-24. Criado `server/src/routes/pcnetRoutes.ts` e registrado em `server/src/server.ts` com o mesmo prefixo `/api/vestiges` de `vestigeRoutes` (Fastify permite dois plugins no mesmo prefixo, desde que os paths não colidam). Endpoints:
- `POST /api/vestiges/:id/pcnet-actions` — valida body com Zod (`action`: `VIEW_FAV`|`MOVIMENTAR`; `status`: `SOLICITADO`, com default; `pcnetIdentifier`: string obrigatória), confirma que o vestígio existe (404 se não), grava em `PcnetActionLog` e também chama `auditService.log()` com `action: 'PCNET_<AÇÃO>'`. Retorna 201.
- `GET /api/vestiges/:id/pcnet-actions` — lista o histórico de ações PCNET daquele vestígio (útil para exibir na UI futuramente), já com nome/email do usuário.
- **Detalhe técnico:** `PcnetActionLog.id` é `BigInt`, que não serializa em JSON — por isso ambas as rotas convertem com `String(log.id)` antes de retornar (mesmo cuidado que `destination-history` já tinha).
- Verificado: `npx tsc --noEmit` passa sem erros; rota responde 401 sem token (confirmando que está registrada e protegida por JWT — rota inexistente no mesmo prefixo responde 404).

---

### ETAPA 3 — Frontend: botão "Ver FAV" (Ação 1, leitura)

**Status:** ✅ Concluído (2026-07-25 — teste funcional confirmado pelo usuário)
**Depende de:** ETAPA 0 item 1 ✅ (já concluído — URL confirmada) e ETAPA 2 concluída (para poder registrar o resultado). **Já pode ser iniciada** — não depende mais dos itens 2/3 da ETAPA 0, que só afetam escrita.

**Objetivo:** primeira ação visível ao usuário, e a de menor risco (leitura pura, sem UI.Vision necessário — achado da seção 2.5.1-b: é só navegação de página, sem CORS).

**O que fazer:**
1. Em `client/components/VestigeCard.tsx`, dentro do bloco `{/* Actions Area */}` (linha ~178), adicionar um botão "Ver FAV no PCNET" ao lado dos botões já existentes ("Agendar (Individual)", "Adicionar"/"Remover"). Seguir o mesmo padrão visual dos outros botões da área (`className` com `flex-1 sm:flex-none ...`).
   - Desabilitar/ocultar o botão se `vestige.fav` estiver vazio (não dá pra consultar sem FAV).
2. **Aviso obrigatório de pré-requisito (login no PCNET) — exigido pelo usuário em 2026-07-24, não é opcional:** o botão precisa deixar claro, **antes do clique**, que só funciona se o usuário já estiver logado no PCNET em outra aba. Implementar como:
   - `title="É necessário estar logado no PCNET em outra aba do navegador para esta ação funcionar."` no próprio `<button>` (tooltip nativo ao passar o mouse), **e**
   - um texto pequeno fixo abaixo/ao lado do botão (não só tooltip, porque tooltip é fácil de não ver), ex.: `<p className="text-[10px] text-zinc-500">Requer login no PCNET em outra aba</p>`, seguindo o padrão de texto pequeno já usado nos labels dos campos do card (`text-[10px] text-zinc-500 font-bold uppercase tracking-wider`).
   - Esse aviso é estático — o EvidenceOS não tenta detectar se o login está ativo (não tem como, é só navegação simples, sem retorno). Se o usuário não estiver logado, quem mostra a tela de login é o próprio PCNET, na aba nova.
3. `onClick`: abrir `window.open(\`https://www.pcnet.mg.gov.br/PCnet/cadeiacustodiasel.do?evento=gerarFav&idMaterial=${vestige.fav}\`, '_blank')`. Não usar `fetch`/XHR — é navegação de página normal, de propósito (ver seção 2.5.1-a, URL confirmada em teste real 2026-07-24).
4. Depois de abrir a aba, chamar `dataService` (novo método em `client/services/dataService.ts`, ex. `logPcnetAction(vestigeId, { action: 'VIEW_FAV', status: 'SUCESSO', pcnetIdentifier })`) para registrar a ação — como é leitura via navegação de página, o EvidenceOS não sabe com certeza se deu certo do lado do PCNET (não há retorno programático); registrar como "solicitado" é aceitável aqui, mas deixar isso explícito no comentário do código e na UI (ex.: tooltip "abrimos a consulta no PCNET — confira na nova aba").

**Critério de conclusão:** clicar no botão no ambiente de dev abre a FAV certa numa nova aba (validado manualmente pelo usuário, com uma FAV real, já que é ação de leitura sem risco) **e** o aviso de "requer login no PCNET" está visível perto do botão, não só em tooltip.

**Nota de retomada:** ✅ Concluída. Código implementado em 2026-07-24 (`npx tsc --noEmit` passa no client, layout aprovado visualmente pelo usuário) e **teste funcional de ponta a ponta confirmado pelo usuário em 2026-07-25** — o clique no botão "Ver FAV" abre a FAV correta no PCNET, em outra aba. Nada pendente nesta etapa. Arquivos alterados:
- `client/services/dataService.ts`: adicionados `buildPcnetUrl(action, fav)` (monta a URL das duas ações num só lugar, **já preparado para `MOVIMENTAR` da ETAPA 6** — não precisa duplicar essa lógica lá) e `logPcnetAction(vestigeId, action, pcnetIdentifier)` (chama a rota da ETAPA 2). Constante `PCNET_BASE_URL` isolada no topo do bloco.
- `client/components/VestigeCard.tsx`: importa `DocumentReportIcon` (ícone já existente no projeto) e as duas funções acima; adiciona `hasFav` e `handleVerFav`; botão "Ver FAV" na Actions Area, com `disabled` quando não há FAV e `title` explicativo (texto varia se tem ou não FAV).
- **Decisão de implementação:** a falha do `logPcnetAction` não bloqueia nem desfaz a abertura da aba (só loga no console) — a auditoria é importante, mas não deve impedir o usuário de consultar a FAV se a rota de log falhar. `window.open` usa `noopener,noreferrer` por segurança.
- **Ajuste de UX aplicado após feedback do usuário (2026-07-24):** a nota "Requer login no PCNET em outra aba" estava dentro da linha de botões (à esquerda), o que dava a impressão de valer também para "Agendar" e "Adicionar". Corrigido: agora há um **asterisco âmbar dentro do próprio botão** ("Ver FAV ✱") e a nota foi movida para uma **linha própria abaixo da Actions Area, alinhada à direita**, no formato "✱ Requer login no PCNET em outra aba". **Para a ETAPA 6:** o botão "Movimentar FAV" deve receber o mesmo asterisco — a nota já cobre os dois automaticamente, sem precisar alterá-la.

---

### ETAPA 4 — ⛔ DESCARTADA (2026-07-24): UI.Vision não é mais necessário

**Status:** ⛔ Descartada — não implementar

**Por que foi descartada:** o desenho original (ETAPAS 4-6) previa usar o UI.Vision para automatizar o preenchimento e envio do formulário "Sob Custódia" (marcar Finalidade, digitar Observação, clicar Salvar). Em 2026-07-24, o usuário propôs uma simplificação depois de vermos que `idMaterialCustodiado=<FAV>` abre o formulário **já pronto e correto** (mesma descoberta da ETAPA 0 item 4): **em vez de automatizar o preenchimento, o EvidenceOS só abre a tela do PCNET já certa, e o próprio usuário preenche e salva manualmente ali dentro** — exatamente como ele já faz hoje, só que sem precisar buscar a FAV na mão.

Isso elimina a necessidade de extensão de navegador **para as 3 ações** (não só para "Ver FAV"). Não há mais ETAPA de instalação/detecção de UI.Vision. As seções 2.8, 2.9 e 3.4 deste documento continuam registrando o histórico de como chegamos até essa conclusão (a investigação da planilha VBA foi o que revelou a URL direta que tornou essa simplificação possível) — não precisam ser reescritas, só não representam mais a arquitetura final escolhida para escrita.

**Nota de retomada:** nada a fazer aqui. Se no futuro alguma ação de escrita do PCNET *não* aceitar um identificador direto por URL (ex. Destinação Final, ainda não mapeada — ver ETAPA 7), a ideia do UI.Vision pode voltar a ser avaliada só para esse caso específico.

---

### ETAPA 5 — Resumo de Impacto de Segurança e Auditoria (obrigatório antes da ETAPA 6)

**Status:** ✅ Concluído — resumo apresentado e **aprovado explicitamente pelo usuário em 2026-07-25**
**Depende de:** ETAPAS 0, 1 e 2 concluídas. (Não depende mais da ETAPA 4, descartada.)

**Objetivo:** esta etapa é **documental, não código** — é o requisito da Regra de Ouro do CLAUDE.md antes de qualquer lógica que toque cadeia de custódia. Mesmo com a arquitetura simplificada (ETAPA 6), o EvidenceOS ainda está **facilitando o acesso a uma tela que grava movimentações oficiais e irreversíveis no PCNET, em nome do usuário autenticado** — o risco de "ação irreversível de terceiro" continua existindo, só que agora o clique final em "Salvar" é do usuário dentro do PCNET, não mais uma automação do EvidenceOS.

**O que fazer:**
1. Escrever um "Resumo de Impacto de Segurança e Auditoria" cobrindo: o que muda (adição de 2 botões que abrem uma tela de escrita do PCNET pré-carregada com a FAV certa), quem pode ser afetado (qualquer perfil, já que não há restrição — seção 2.6, decisão 1), o que pode dar errado, como é auditado, e a limitação de que o EvidenceOS **não sabe com certeza se o usuário de fato salvou algo no PCNET** depois de abrir a aba (mesma limitação já aceita para "Ver FAV" na ETAPA 3 — só registramos que a ação foi "solicitada"/aberta, não confirmada).
2. Cobrir explicitamente: (a) o aviso leve antes de abrir a aba (decisão do usuário em 2026-07-24: manter um aviso simples, sem modal pesado — ver ETAPA 6 item 2); (b) por que não há mais tratamento de "sessão PCNET expirada" do lado do EvidenceOS (deixou de ser necessário: sem automação, quem lida com sessão expirada é o próprio PCNET, mostrando sua tela de login normal, exatamente como já acontece hoje quando o usuário navega manualmente); (c) o log próprio implementado na ETAPA 1/2, e a limitação de que ele registra "abertura solicitada", não "gravação confirmada"; (d) o risco de o usuário confundir a ação do EvidenceOS com uma anotação interna (ponto já levantado na seção 2.6) — mitigado pelo aviso da ETAPA 6 item 2.
3. Apresentar esse resumo ao usuário e **aguardar aprovação explícita** ("ok", "pode executar", "vai em frente" etc., conforme definido no CLAUDE.md) antes de avançar para a ETAPA 6.

**Critério de conclusão:** resumo apresentado e aprovação explícita registrada (colar a resposta do usuário nesta seção, como evidência).

**Nota de retomada:** ✅ Etapa cumprida em 2026-07-25. Resumo apresentado ao usuário no chat, cobrindo os 4 pontos exigidos no item 2 (aviso leve, ausência de tratamento de sessão expirada, log próprio e sua limitação, risco de confusão com anotação interna), mais o checklist de segurança do CLAUDE.md.

**Conteúdo do resumo — pontos que ficam registrados como decisão/risco aceito:**
- A feature é **aditiva no nosso banco**: nenhum campo de `Vestige` é alterado, só são inseridas linhas de log. O EvidenceOS não faz nenhuma requisição ao PCNET (sem `fetch`/XHR), apenas `window.open`.
- **Nenhuma capacidade nova é concedida ao usuário** — ele já podia fazer a mesma movimentação navegando manualmente no PCNET. O que muda é o encurtamento do caminho.
- **Risco residual aceito conscientemente:** se o `registroFav` estiver digitado errado no EvidenceOS, o botão abre a tela de *outra* FAV, e o usuário pode movimentar o vestígio errado. Única barreira: a conferência visual do número da FAV no aviso e dos "Bens Selecionados" na própria tela do PCNET. Encurtar o caminho até uma ação irreversível também encurta o caminho até errá-la.
- **Limitação de auditoria assumida:** o log diz "tela de movimentação foi aberta", nunca "movimentação foi gravada" (`status` sempre `SOLICITADO`), e não registra qual Finalidade o usuário escolheu. Para conciliar o que de fato aconteceu com o vestígio, **a fonte de verdade continua sendo o PCNET**.
- **Falha do log não bloqueia a abertura da aba** (mesma decisão da ETAPA 3): existe uma janela em que a ação ocorre sem registro no nosso log. Aceito porque o PCNET tem log próprio e travar a operação por falha de auditoria seria pior operacionalmente.
- **Permissão:** mantida a decisão da seção 2.6 — todos os perfis. A pergunta de restringir a ADMIN/PERITO foi recolocada ao usuário em 2026-07-25 e ele optou por manter como estava.

**Aprovação explícita do usuário (2026-07-25), colada como evidência conforme o critério de conclusão:**

> etapa 5 aprovada. Pode implantar

---

### ETAPA 6 — Frontend: botão único "Movimentar FAV" (escrita) — arquitetura final simplificada

**Status:** ✅ Concluído (2026-07-25 — teste funcional local confirmado pelo usuário)
**Depende de:** ETAPA 5 aprovada explicitamente pelo usuário ✅ (aprovação de 2026-07-25 registrada na ETAPA 5).

**Objetivo (revisado em 2026-07-24 — consolidação final):** o desenho passou por duas simplificações sucessivas: primeiro trocou UI.Vision por link direto (ETAPA 4 descartada), depois o usuário decidiu consolidar os dois botões de escrita ("Dar Recebimento" e "Dar Transporte") em **um único botão "Movimentar FAV"**, já que os dois abririam exatamente a mesma URL — a escolha da Finalidade (Recebimento/Transporte/Exame Pericial/Distribuição/Guarda) é sempre feita pelo próprio usuário, dentro da tela do PCNET, nunca pelo EvidenceOS. **Decisão registrada:** o EvidenceOS abre mão de capturar a intenção do usuário no log (não sabe se ele foi lá para Recebimento ou Transporte) em troca de uma UI mais simples — 1 clique a menos, e o card do vestígio fica com só 2 botões de PCNET no total (Ver FAV + Movimentar FAV), não 3.

**O que fazer:**
1. Em `client/components/VestigeCard.tsx`, adicionar **um único botão "Movimentar FAV"** na Actions Area, ao lado do "Ver FAV" (ETAPA 3), com o mesmo padrão visual e a mesma condição de habilitação: desabilitado/oculto se `vestige.fav` estiver vazio. **Não depende de nenhuma extensão instalada** (ETAPA 4 descartada).
2. **Aviso leve antes de abrir a aba** (decisão do usuário em 2026-07-24: manter aviso simples, sem modal pesado de confirmação). Pode ser um `window.confirm()` nativo do navegador ou um toast/alerta rápido do próprio EvidenceOS, com texto do tipo: *"Isso vai abrir a tela de movimentação no PCNET para a FAV [registroFav] (Recebimento, Transporte, Exame Pericial, Distribuição ou Guarda). A movimentação só é gravada de fato se você escolher a opção certa e clicar em Salvar lá dentro."* — só depois de confirmar esse aviso é que a aba abre. Mesmo padrão de aviso estático de "requer login no PCNET" já usado na ETAPA 3 (tooltip + texto fixo) deve valer aqui também.
3. `onClick` (depois do aviso confirmado): abrir `window.open(\`https://www.pcnet.mg.gov.br/PCnet/sobcustodiaman.do?evento=x&idMaterialCustodiado=${vestige.fav}\`, '_blank')`. **Não** montar nenhum JSON de macro, não usar UI.Vision, não simular clique nenhum, não tentar pré-selecionar Finalidade.
4. Depois de abrir a aba, chamar a rota da ETAPA 2 (`POST /api/vestiges/:id/pcnet-actions`) com `action: 'MOVIMENTAR'`, `status: 'SOLICITADO'`. **Limitação assumida conscientemente:** o log não distingue qual Finalidade o usuário pretendia usar (Recebimento/Transporte/etc.) — só registra que a tela de movimentação foi aberta para aquela FAV, por aquele usuário, naquele momento. Mesmo princípio já usado no botão "Ver FAV".

**Critério de conclusão:** o botão "Movimentar FAV" abre a tela certa do PCNET (FAV correta, pronta para o usuário escolher a Finalidade e preencher), com o aviso leve aparecendo antes, e a ação sendo registrada como "solicitada" no log próprio (ETAPA 1/2). Validável com uma FAV real, sem nenhum risco, porque o EvidenceOS nunca clica em "Salvar" — quem decide se salva ou não, e o quê, é sempre o usuário, dentro do PCNET.

**Nota de retomada:** ✅ Concluída. Código implementado em 2026-07-25, type-check do client passa (`client/node_modules/.bin/tsc --noEmit -p client/tsconfig.json`, exit 0), e **teste funcional local confirmado pelo usuário em 2026-07-25** — o aviso aparece e a aba abre a tela de movimentação da FAV certa. Alterações, todas em `client/components/VestigeCard.tsx` (nenhuma mudança foi necessária no backend nem no `dataService.ts` — `buildPcnetUrl` já suportava `MOVIMENTAR` desde a ETAPA 3, como previsto):
- Novo handler `handleMovimentarFav`: `window.confirm()` com o número da FAV explícito no texto → só se confirmado, `window.open(buildPcnetUrl('MOVIMENTAR', vestige.fav), '_blank', 'noopener,noreferrer')` → `logPcnetAction(..., 'MOVIMENTAR', ...)`, cujo erro só vai para o console e não desfaz a abertura da aba (mesma decisão da ETAPA 3).
- Botão "Movimentar FAV" na Actions Area, logo após o "Ver FAV": mesmo padrão visual, mesmo `disabled={!hasFav}`, e o **mesmo asterisco âmbar** — a nota "✱ Requer login no PCNET em outra aba" já existente cobre os dois botões sem precisar ser alterada, exatamente como a ETAPA 3 tinha previsto.
- Ícone: SVG inline (setas de troca), seguindo o padrão dos botões "Adicionar"/"Remover", que também usam SVG inline em vez de um arquivo em `components/icons/`.
- **Verificado durante a implementação:** o `encodeURIComponent()` recomendado no Resumo de Impacto **já estava aplicado** em `buildPcnetUrl()` desde a ETAPA 3 — nada a corrigir.

---

### ETAPA 7 — Validação final e fechamento

**Status:** ✅ Concluída em 2026-07-25 — **todos os itens testados**, inclusive o cenário de sessão expirada, validado em produção
**Depende de:** ETAPAS 3 e 6 concluídas e testadas ✅.

**O que fazer:**
1. ✅ **Testado em produção em 2026-07-25 (o usuário desconectou do PCNET de propósito).** Confirmado o comportamento esperado: o clique em "Ver FAV" abriu a nova aba com **a tela de login do próprio PCNET**, sem nenhuma mensagem de erro do EvidenceOS — que é o correto, já que o EvidenceOS não tem como saber o que carregou na outra origem. Dois achados adicionais registrados abaixo. Item original: testar o cenário de sessão do PCNET expirada: abrir um dos botões (Ver FAV / Movimentar FAV) com o PCNET deslogado em todas as abas, e confirmar que a tela de login do próprio PCNET aparece normalmente na aba aberta pelo EvidenceOS (não é um erro do EvidenceOS tratar — é o comportamento nativo esperado, ver ETAPA 4/6).
2. ✅ **Verificado em 2026-07-25 (banco de dev, consulta de leitura via Prisma).** `PcnetActionLog` e `AuditLog` estão registrando corretamente. Resultado: **9 linhas em `PcnetActionLog` e 9 correspondentes em `AuditLog`**, pareando uma a uma — 3 `MOVIMENTAR` (FAVs 1789050, 1833323, 1833328, 1881014) gerados pelo teste da ETAPA 6, mais os `VIEW_FAV` da ETAPA 3. Todos com `status: 'SOLICITADO'`, `pcnetIdentifier` igual à FAV do vestígio, usuário correto, e o `AuditLog` geral com `action: 'PCNET_VIEW_FAV'`/`'PCNET_MOVIMENTAR'` e `targetType: 'vestige'`. **Nenhum registro faltando nem duplicado** — confirma que o `logPcnetAction` do frontend está de fato chegando ao banco, o que não era observável pela UI (por decisão da ETAPA 3, falha de auditoria não gera erro visível).
   - *Nota para quem for repetir essa consulta:* o Prisma 7 deste projeto **exige o adapter explícito** (`PrismaPg` + `Pool`, ver `server/src/db/connection.ts`); um `new PrismaClient()` sem argumentos falha com `PrismaClientInitializationError`.
3. Atualizar o `**Status:**` no topo deste documento para refletir o que foi implementado e o que ficou de fora (ex.: se algum dia fizer sentido diferenciar Recebimento/Transporte no log, isso ficaria pra uma iteração futura — ver ETAPA 6 sobre a limitação assumida conscientemente).

**Critério de conclusão:** os 2 botões (Ver FAV, Movimentar FAV) funcionando em produção, com auditoria própria confirmada.

**Nota de retomada:** ✅ Plano encerrado em 2026-07-25 com **todos os itens verificados**, nenhum deixado como suposição.

**Achados do teste de sessão expirada (executado em produção, 2026-07-25):**

1. **Comportamento confirmado:** com o PCNET desconectado, o clique em "Ver FAV" abre a nova aba na tela de login do próprio PCNET. O EvidenceOS não exibe (nem tem como exibir) mensagem de erro — a aba é de outra origem e a política de mesma origem do navegador impede ler seu conteúdo. Detectar isso exigiria a Opção B da seção 3.4 (backend falando com o PCNET usando a sessão do usuário), **rejeitada por decisão de não guardar credencial/cookie do PCNET**. A ausência de mensagem é, portanto, uma consequência aceita dessa decisão, não uma lacuna a corrigir.
2. **Após o login, o PCNET redireciona para `inicial.do` (tela inicial), descartando a URL da FAV pretendida.** O usuário precisa voltar ao EvidenceOS e clicar no botão de novo — o que funcionou na segunda tentativa. Vale considerar, numa iteração futura de UX, ajustar a nota do card para algo como "se a sessão do PCNET tiver caído, faça login e clique novamente".
3. **A limitação de auditoria foi observada na prática, não só documentada.** As três linhas `PCNET_VIEW_FAV` geradas no teste (23:50:36, 23:55:32 e 23:57:37, todas da FAV 1833328) são **indistinguíveis entre si**, embora a primeira tenha resultado apenas na tela de login e a última tenha de fato aberto a FAV. Confirma na prática que o log prova **que a tela foi solicitada, nunca que a FAV foi vista** — reforçando que, para conciliar o que realmente aconteceu com um vestígio, a fonte de verdade continua sendo o PCNET.

Itens 2 e 3 também concluídos. Os dois botões foram testados localmente e em produção, e a auditoria foi conferida tanto no banco de dev quanto no painel de produção.

**Achado colateral, fora do escopo deste plano (não corrigido):** durante a validação, apareceu no Firefox o aviso "O Firefox impediu este site de abrir uma janela ou aba". **Não são os botões do PCNET** — o usuário confirmou que ambos abrem de primeira, sem precisar liberar popup. O candidato provável é código pré-existente em `client/components/SearchResults.tsx:49-63` (`handlePrint`): no caminho "imprimir apenas os selecionados", há um `setTimeout(() => window.print(), 300)` depois de um `window.confirm()` — o atraso faz o Firefox perder a ativação do clique do usuário e bloquear o preview de impressão. O caminho "imprimir todos" (linha 62, `window.print()` direto) não sofre disso. **Não foi reproduzido nem corrigido** — fica como candidato a um ajuste futuro, junto com a sugestão de blindar `window.open` nos botões do PCNET (checar o retorno `null` antes de gravar o log, evitando registrar `SOLICITADO` para uma aba que não abriu — hoje isso não ocorre na prática, mas o código não verifica).

---

## Implantação em produção (2026-07-25)

Commit `b45a71f` enviado para a `main`. A implantação desta feature exigiu **os dois serviços de aplicação** do Easypanel, porque o commit tocou `server/` e `client/` — cada serviço tem build e botão "Implantar" próprios, e o push na `main` não implanta os dois de uma vez.

| Serviço | O que precisou | Status |
|---|---|---|
| **api** | Deploy + aplicar a migration manualmente | ✅ Feito. Confirmado no console do serviço `api`: `cd /app && npx prisma@7.7.0 migrate deploy` → `Applying migration 20260724_0001_add_pcnet_action_log` → `All migrations have been successfully applied.` (banco `evidenceos_prod`). O comando encontrou as 4 migrations, o que também **prova que o container do `api` já estava com o código do commit novo**. |
| **web** | Deploy (o frontend é compilado no build e servido como estático pelo nginx) | ✅ Feito em 2026-07-25. Confirmado: os botões passaram a aparecer no card em `evidenceos.investigacaoforense.com`. |
| **db** | Nada | — |

**Armadilha que ocorreu de verdade, registrada para não repetir:** logo após o deploy do `api` + migration, os botões **não apareceram em produção**. A causa foi ter reimplantado só o `api`: o `web` continuava servindo o bundle JavaScript antigo, compilado antes desta feature existir. Não houve erro nenhum na tela — a funcionalidade simplesmente não estava lá. Depois do deploy do `web` é preciso ainda dar **`Ctrl+Shift+R`**, porque o nginx serve estático com cache e um F5 comum pode continuar entregando o bundle velho.

**Detalhe do comando da migration:** o pacote `prisma` (CLI) é `devDependency`, então pode não existir na imagem de produção — por isso o `npx prisma@7.7.0`, com a versão fixada para casar com o `@prisma/client` do projeto. Sem fixar, o `npx` baixaria a versão mais recente, que pode divergir.

**Verificação que fecha o ciclo — ✅ executada e aprovada em 2026-07-25:** clicar em "Ver FAV" em produção e confirmar que aparece uma linha `PCNET_VIEW_FAV` em Logs de Auditoria. É o único teste que prova que a gravação funciona — por decisão da ETAPA 3, uma falha ao registrar o log **não gera erro visível na tela**, então "o botão abriu a aba" não prova que a auditoria está funcionando.

Resultado obtido: `25/07/2026, 23:50:36 | PCNET_VIEW_FAV | {"status":"SOLICITADO","registroFav":"1833328",...}` no ambiente de produção. Isso valida de uma vez os três elos da implantação: o `web` serviu o bundle novo (o botão existe e é clicável), o `api` está com a rota viva, e a migration foi aplicada (sem a tabela `pcnet_action_logs` a rota teria falhado e nenhuma linha apareceria).

**🏁 Integração 100% implantada e verificada em produção.**

*(Esta orientação de deploy foi replicada no `CLAUDE.md` do projeto, na seção "Infraestrutura & Deploy", para valer em qualquer implantação futura — não só nesta feature. O `CLAUDE.md` é local e não versionado.)*

---

## Riscos e pontos de atenção

- Dependência de sistema externo (PCNET) fora do nosso controle — disponibilidade, mudanças de layout/API sem aviso.
- Se não houver API oficial, qualquer automação de tela (scraping) é frágil e pode violar termos de uso do PCNET — precisa de validação explícita antes de seguir por esse caminho.
- Dados de procedimento policial são sensíveis — exige atenção redobrada a quem pode ver o quê (controle de acesso por perfil).
- Credenciais de acesso ao PCNET (se existirem) devem seguir a mesma regra de segredos do projeto: nunca hardcoded, sempre em variável de ambiente.
- Cache/persistência de dados do PCNET no nosso banco cria uma nova superfície de auditoria — precisa registrar quando e como os dados foram obtidos.

## Decisões em aberto

- Fonte técnica da integração: link/popup autenticado via sessão do usuário no PCNET (mais simples) vs. alguma API/integração formal da PCMG (a confirmar se existe) vs. scraping automatizado (mais frágil, avaliar necessidade real antes de seguir por aqui).
- **Confirmado pelo usuário:** não criar tela nova no EvidenceOS — os botões de ação para o PCNET entram na própria tela de resultado de busca (`VestigeCard.tsx`), no mesmo lugar onde já aparecem os dados do vestígio.
- Se, além do link/botão, vamos também **trazer e exibir** dados do PCNET dentro do card do EvidenceOS (ex.: situação CL/AC/EMD, unidade da última movimentação) — isso teria impacto diferente (leitura ativa de dado externo) do que apenas linkar para a tela do PCNET.
- Se os dados do PCNET, caso trazidos, serão cacheados no banco do EvidenceOS ou consultados em tempo real a cada visualização.
- Escopo do "procedimento": ainda em aberto se o EvidenceOS precisa modelar `Procedimento`/REDS como entidade própria, ou se basta linkar por FAV/Requisição sem persistir isso.
- Qual identificador (FAV, Requisição ou Nº Procedimento/REDS) será a chave principal de busca no PCNET a partir do vestígio do EvidenceOS.

### Já resolvidas (2026-07-24)

- **Permissão de escrita:** todos os perfis do EvidenceOS podem disparar ações no PCNET — a barreira real é o próprio login do usuário no PCNET, não o perfil no EvidenceOS.
- **Tratamento de falha:** erro explícito na UI sempre que a requisição ao PCNET não completar (cenário mais comum: PCNET derruba a sessão do usuário sozinho) — nunca falha silenciosa, nunca retry automático que possa duplicar um registro de custódia.
- **Auditoria própria:** o EvidenceOS mantém log próprio de "quem mandou gravar o quê no PCNET, quando", independente do log do PCNET.
- **Confirmação de escrita:** ações de escrita (Recebimento, Transporte) exigem modal de confirmação prévio, exibindo os dados da FAV, antes de disparar a requisição real ao PCNET.
- **Não existe extensão institucional reaproveitável:** os dois sistemas PCMG citados pelo usuário são soluções artesanais (um programa desktop, e uma planilha Excel com macro que abre o PDF da FAV) — não há equipe/projeto formal para contatar. Ação recomendada: obter o arquivo Excel e inspecionar a macro VBA de "Ver FAV" para validar/documentar o fluxo HTTP de leitura antes de implementar (ver seção 2.9, item 1).

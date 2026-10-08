# Segunda unidade: URC Campo Belo no EvidenceOS

**Data:** 2026-10-08 · **Status:** campos adicionais e regras de importação definidos (seções 7 e 8). Pendentes: as
decisões marcadas ⏳ na seção 3 e o diagnóstico das quatro planilhas — os arquivos **serão pedidos ao usuário no
início da execução** (8.3). **Nada implementado.**

## 1. Objetivo

A URC de Campo Belo/MG passa a usar o EvidenceOS. O que o usuário definiu:

- mesmo código e mesma VPS de Lavras;
- banco de dados separado;
- usuário de uma unidade não acessa a outra; só o coordenador (ADMIN) acessa as duas;
- a tela identifica a unidade ("URC Campo Belo/MG" no lugar de "URC Lavras/MG"); o rodapé com os nomes dos
  desenvolvedores e todo o resto da interface ficam iguais nas duas;
- Campo Belo precisa de quatro campos a mais no cadastro do vestígio: PCNET, REDS, nome da caixa e prateleira. O
  REDS aceita mais de um por vestígio (seção 7);
- os dados atuais de Campo Belo estão em **quatro planilhas** do Google Sheets, cada uma com **uma aba por cidade**
  (seção 8).

## 2. Arquitetura

Um repositório, um código, **duas cópias rodando**. Toda alteração continua sendo um commit só na `main`; o que dobra
é a implantação.

```
GitHub (main) ──┬─> api      ──> banco evidenceos_prod        (Lavras)
                ├─> web
                ├─> api-cb   ──> banco evidenceos_campobelo   (Campo Belo)
                └─> web-cb
                      db = um Postgres só, dois bancos, um usuário de banco por unidade
```

| Serviço no Easypanel | O que é | Situação |
|---|---|---|
| `api` | backend de Lavras | já existe; ganha 2 variáveis de ambiente (seção 6.2) |
| `web` | frontend de Lavras | já existe; sem mudança de configuração |
| `api-cb` | backend de Campo Belo | **novo**, mesmo repositório e mesma branch do `api` |
| `web-cb` | frontend de Campo Belo | **novo**, mesmo repositório e mesma branch do `web` |
| `db` | PostgreSQL | já existe; ganha um segundo banco e um segundo usuário |

**Por que assim.** A conexão com o banco é criada uma única vez quando a api sobe, a partir de um único
`DATABASE_URL` (`server/src/db/connection.ts:9-24`), e o objeto `prisma` é importado direto por todas as rotas e
serviços. Rodando duas cópias, esse código não é tocado e a api de Campo Belo simplesmente não tem como alcançar o
banco de Lavras.

**Alternativas descartadas.**

- *Uma api só, escolhendo o banco a cada requisição (seletor no login).* Um deploy só, mas exige reescrever como
  autenticação, vestígios, retiradas e auditoria acessam o banco. Um ponto esquecido grava vestígio na unidade errada,
  sem erro. Passa a valer a pena com muitas unidades ou se for preciso um painel somando todas.
- *Um banco só, com coluna de unidade em cada tabela.* Toda consulta teria de filtrar por unidade; descartado pelo
  mesmo risco, e o usuário já pediu banco separado.
- *Mesmo endereço com `/lavras` e `/campobelo`.* O token de acesso fica no `localStorage`
  (`client/services/apiClient.ts:5`) e a sessão em cookie; os dois são por endereço. No mesmo endereço, o login de uma
  unidade sobrescreveria o da outra. Em subdomínios o navegador isola sozinho.

## 3. Decisões

| # | Decisão | Definição | Situação |
|---|---|---|---|
| **D1** | Arquitetura | Uma instância (api + web + banco) por unidade, mesmo código | ✅ |
| **D2** | Estrutura do banco | **Idêntica** nas duas unidades. Campos que só Campo Belo usa existem nos dois bancos, opcionais, e ficam ocultos em Lavras por configuração | ✅ |
| **D3** | Nome exibido | "URC Campo Belo/MG", no mesmo padrão de "URC Lavras/MG". Rodapé dos desenvolvedores (`client/components/Dashboard.tsx:296-327`) igual nas duas | ✅ (confirmar a grafia) |
| **D4** | Endereço de Campo Belo | Proposta: `evidenceos-campobelo.investigacaoforense.com`. Lavras continua em `evidenceos.investigacaoforense.com`, ninguém de lá troca de endereço | ⏳ |
| **D5** | Tela de escolha da unidade | Recomendado: em vez de uma página à parte, a tela de login mostra o nome da unidade em destaque e um link "Acessar outra unidade". Não cria serviço novo e resolve o caso de alguém cair no endereço errado | ⏳ |
| **D6** | Municípios de Campo Belo | São os nomes das abas das quatro planilhas (Aguanil é uma). A lista completa e o município padrão ("Campo Belo", a confirmar) saem do diagnóstico | ⏳ planilhas |
| **D7** | Campos adicionais de Campo Belo | Quatro novos, todos opcionais: PCNET, Caixa e Prateleira como texto simples; **REDS como lista**, um ou mais por vestígio (D13). Mais o campo Observações, que já existe no banco e passa a aparecer na tela (D15). Entram no formulário, no card, na conferência de edição e na busca rápida; ficam fora do relatório/PDF por enquanto (seção 7) | ✅ |
| **D8** | Remetente do e-mail de recuperação de senha | Recomendado começar com a mesma conta Gmail de Lavras: o remetente já aparece como "EvidenceOS – Não Responda". O rodapé do e-mail traz o nome da unidade certa | ⏳ |
| **D9** | Categorias de Campo Belo | A categoria é a **planilha**: "BALÍSTICA" e as outras três. Em Lavras a categoria é a aba; em Campo Belo a aba é o município | ✅ (faltam os três nomes) |
| **D10** | Marco inicial de Campo Belo | Data em que a planilha deixa de ser alimentada e o EvidenceOS vira a fonte de verdade, como foi 10/09/2026 em Lavras | ⏳ |
| **D11** | Deploy automático | Avaliar ligar o deploy automático por push nos quatro serviços de aplicação, para reduzir o risco de uma unidade ficar para trás. Migration continua manual | ⏳ opcional |
| **D12** | Formato da requisição | **Desconsiderar os quatro primeiros dígitos e o hífen**, que são o ano: `2023-047176200` entra como `047176200`. É o mesmo padrão de Lavras, onde a requisição já é gravada sem o prefixo do ano (`docs/plans/2026-07-24-integracao-pcnet.md`, seção 2.4). A validação do cadastro e da edição não muda: continua aceitando só dígitos (`server/src/services/vestigeItemService.ts:61-65`), e o perito de Campo Belo digita o número sem o ano. **O zero inicial é mantido:** a requisição fica com 9 dígitos, como na planilha e no PCNET. Regras da importação em 8.1. *Definido pelo usuário em 08/10.* | ✅ |
| **D13** | Mais de um REDS no mesmo vestígio | **É possível e tem de ser preservado.** O REDS é uma **lista**, no mesmo modelo das requisições e dos invólucros: tabela própria, um ou mais números por vestígio, inclusão e remoção pela tela, remoção lógica. Como a estrutura existe nos dois bancos (D2), **Lavras pode passar a registrar REDS no futuro só habilitando o campo na configuração**, sem migration nova e sem mudança de código. Detalhes em 7.1. A proposta anterior, de guardar como texto único, foi descartada. *Definido pelo usuário em 08/10.* | ✅ |
| **D14** | DATA DE SAÍDA e RESPONSÁVEL PELA RETIRADA | **Não são levadas para o banco.** Nem como campo novo, nem como texto em observação: as duas colunas são ignoradas pela importação. O EvidenceOS já tem ferramentas próprias para isso (situação do vestígio, solicitação de retirada e histórico de destinação). *Definido pelo usuário em 08/10.* | ✅ |
| **D17** | Situação das linhas que têm saída preenchida | **Entram como "Retirado (ver FAV)"**, porque o material não está mais na URC. Só a situação é gravada; data e responsável continuam fora (D14). Vale para a linha com DATA DE SAÍDA **ou** RESPONSÁVEL PELA RETIRADA preenchido; o diagnóstico lista à parte as que têm só um dos dois, para conferência. *Definido pelo usuário em 08/10.* | ✅ |
| **D15** | OBSERVAÇÃO | **Entra.** A coluna da planilha é importada para o campo `observacoes`, que já existe no banco das duas unidades (não precisa de migration), e o campo passa a aparecer na tela de Campo Belo. Em Lavras fica oculto até ser habilitado na configuração, caso a unidade passe a precisar. Detalhes em 7.2. *Definido pelo usuário em 08/10.* | ✅ |
| **D16** | Como os dados das planilhas circulam | **Por arquivo.** As planilhas não são abertas por link: o usuário baixa os quatro `.xlsx` e coloca na pasta indicada em 8.3. **Quem executar o plano pede os arquivos ao usuário no início da etapa de importação.** O envio do arquivo conferido ao servidor segue 8.3 e é confirmado na hora da carga. *Definido pelo usuário em 08/10.* | ✅ |
| **D18** | Requisição com 9 dígitos nas duas unidades | Campo Belo já nasce com 9 dígitos (D12). **Recomendação registrada a pedido do usuário: passar Lavras também para 9 dígitos**, completando com zero inicial as requisições que hoje estão com 8. É alteração de dado de vestígio em produção: fica para uma mudança própria, com levantamento, simulação, registro em auditoria e aprovação (seção 12) | ✅ recomendação · execução fora deste plano |

## 4. Onde mora a configuração da unidade

Uma variável de ambiente nova na api, `UNIT` (`lavras` ou `campobelo`), escolhe uma entrada de um arquivo versionado,
`server/src/config/unit.ts`:

```ts
// esboço — a lista de municípios de Campo Belo sai do diagnóstico das planilhas (D6)
lavras:    { name: 'URC Lavras/MG',     defaultCity: 'Lavras',     cities: [/* os 14 de hoje */], extraFields: [] }
campobelo: { name: 'URC Campo Belo/MG', defaultCity: 'Campo Belo', cities: [/* D6 */],
             extraFields: ['numeroPcnet', 'reds', 'caixa', 'prateleira', 'observacoes'] }
```

O frontend busca isso em uma rota pública nova, `GET /api/unit`, ao abrir (a tela de login precisa do nome antes de
haver sessão). A resposta não tem nada sensível: nome da unidade, municípios e campos habilitados.

Consequências:

- a lista de municípios (com acentos) fica no código, revisada em commit, e não em um campo de texto do Easypanel;
- o bundle do frontend é igual nas duas unidades; `web` e `web-cb` só diferem em `VITE_API_URL`;
- **sem valor padrão:** se `UNIT` faltar ou for desconhecida, a api se recusa a subir. Nenhuma unidade cai em "Lavras"
  por esquecimento. Por isso a variável tem de ser criada no `api` de Lavras **antes** do deploy desse código
  (seção 10, passo 2).

*Alternativa considerada:* variáveis `VITE_*` no build do frontend. Descartada porque duplicaria nome e municípios em
dois serviços por unidade, com risco de divergirem.

## 5. Mudanças no código

Nenhuma delas altera regra de login, de sessão, de custódia ou a regra das 24h.

| Arquivo | Hoje | Passa a ser |
|---|---|---|
| `server/src/config/unit.ts` (novo) | — | mapa das unidades; lê `UNIT`; derruba o boot se faltar |
| `server/src/server.ts` | `cors({ origin: true })` (linha 22) aceita qualquer origem | origem vem de `CORS_ORIGINS`; nova rota pública `GET /api/unit` |
| `server/src/routes/vestigeRoutes.ts:278` | `municipio` com padrão `'Lavras'` | município padrão da unidade |
| `server/src/services/emailService.ts:17` | sem `APP_URL`, o link de redefinição de senha aponta para o endereço de Lavras | `APP_URL` obrigatória; sem ela a api não sobe |
| `server/src/services/emailService.ts:108` | "URC Lavras/MG" fixo no rodapé do e-mail | nome da unidade |
| `server/.env.example` | — | `UNIT`, `APP_URL`, `CORS_ORIGINS` |
| `client/services/unitService.ts` (novo) | — | busca `/api/unit` uma vez ao abrir |
| `client/components/Header.tsx:32` | "URC Lavras/MG" fixo | nome da unidade |
| `client/components/Login.tsx:84` | idem | idem (e o link de D5, se aprovado) |
| `client/components/ResetPasswordPage.tsx:132` | idem | idem |
| `client/index.html:7` e `:199` | título da aba e rodapé de impressão do relatório fixos | definidos ao carregar a configuração |
| `client/hooks/useVestiges.ts:29-44` | `OFFICIAL_CITIES` fixa com os 14 municípios de Lavras; alimenta o cadastro e o filtro da busca | lista da unidade |
| `client/components/VestigeFormModal.tsx:151`, `client/services/dataService.ts:50` e `:93` | `'Lavras'` como município inicial | município padrão da unidade |
| Scripts de manutenção de Lavras (`sync-apply`, `corrigir-municoes`, `normalizar-municipios`, `cadastrar-favs-pendentes`, `seed-from-snapshot`, `phase2-run`) | gravam no banco que estiver em `DATABASE_URL` | recusam rodar se `UNIT` não for `lavras` |

A lista de municípios não é cosmética: sem ela, o perito de Campo Belo só conseguiria escolher cidades da região de
Lavras no cadastro.

**Não muda:** fluxo de login, cookie de sessão (continua sem atributo `domain`, que é o que o mantém preso a um
endereço só), chave do `localStorage`, rodapé dos desenvolvedores, link do PCNET (é estadual) e o padrão `'Lavras'` da
coluna no banco (`server/prisma/schema.prisma:64`) — a rota sempre envia o município, e o importador de Campo Belo
terá de enviar explicitamente.

## 6. Infraestrutura

### 6.1 Serviço `db` — banco e usuário novos

Comandos para o usuário rodar no console do serviço **`db`**. Isto **não é migration**: só cria o banco vazio e o dono
dele. As tabelas são criadas pelo Prisma, no `api-cb` (6.4).

```sql
-- conferir antes o nome real do banco de Lavras com \l (os planos anteriores citam evidenceos_prod)
CREATE ROLE evidenceos_cb_app LOGIN PASSWORD '<senha forte gerada; guardar só no Easypanel>';
CREATE DATABASE evidenceos_campobelo OWNER evidenceos_cb_app;

-- Por padrão o Postgres deixa qualquer usuário CONECTAR em qualquer banco. Fechar nos dois sentidos.
REVOKE CONNECT ON DATABASE evidenceos_campobelo FROM PUBLIC;
GRANT  CONNECT ON DATABASE evidenceos_prod TO <usuário que o api de Lavras usa>;   -- sempre ANTES da linha de baixo
REVOKE CONNECT ON DATABASE evidenceos_prod FROM PUBLIC;
```

A última linha mexe no acesso ao banco de Lavras. Conexões já abertas não caem; se uma nova falhar, desfaz na hora com
`GRANT CONNECT ON DATABASE evidenceos_prod TO PUBLIC;`. Conferir `/api/health` do `api` de Lavras logo depois.

### 6.2 Variáveis de ambiente

No serviço **`api`** (Lavras), acrescentar: `UNIT=lavras` e `CORS_ORIGINS` com os dois endereços por onde Lavras é
acessada hoje (`https://evidenceos.investigacaoforense.com` e `https://evidenceos-web.2bwwuq.easypanel.host`),
separados por vírgula. Confirmar que `APP_URL` já existe.

No serviço **`api-cb`**:

| Variável | Valor | Observação |
|---|---|---|
| `UNIT` | `campobelo` | |
| `DATABASE_URL` | `postgresql://evidenceos_cb_app:<senha>@<host interno do db>:5432/evidenceos_campobelo?schema=public` | host interno: copiar do `api` de Lavras |
| `JWT_SECRET` | segredo novo, gerado, **diferente do de Lavras** | obrigatório, ver seção 9 |
| `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN_DAYS`, `PORT` | iguais aos do `api` | |
| `NODE_ENV` | `production` | é o que marca o cookie de sessão como `Secure` |
| `APP_URL` | endereço público do `web-cb` | usado no link de redefinição de senha |
| `CORS_ORIGINS` | endereço público do `web-cb` | |
| `SMTP_USER`, `SMTP_PASS` | conforme D8 | |

No serviço **`web-cb`**: `VITE_API_URL` com o endereço público do `api-cb`. É lida no build; trocar exige reimplantar.

### 6.3 Domínio

Criar o registro DNS do endereço de D4 apontando para a VPS e associá-lo ao `web-cb` (SSL automático pelo Easypanel).
Para o `api-cb`, **repetir o esquema que o `api` de Lavras usa hoje** (domínio próprio ou caminho `/api` no mesmo
domínio do web) — conferir no Easypanel antes de criar.

### 6.4 Primeira carga do `api-cb`

1. Implantar o **`api-cb`**. No console dele: `cd /app && npx prisma@7.7.0 migrate deploy`. Deve aplicar todas as
   migrations do zero.
2. Conferir `GET /api/health` (banco conectado) e `GET /api/unit` (devolve Campo Belo).
3. Ainda no console do **`api-cb`**, criar o ADMIN com `scripts/bootstrap-admin.cjs` e uma senha provisória; trocar a
   senha no primeiro login pela tela.
4. Implantar o **`web-cb`**, abrir o endereço, entrar como ADMIN e criar os usuários de Campo Belo pela tela.

O banco nasce sem categorias e sem normas: o seletor de categoria fica vazio até a importação ou o cadastro manual, e
o FAQ mostra as 6 perguntas padrão do código. Uma delas descreve os armários de Lavras
(`client/data/faqData.ts:26`); o ADMIN de Campo Belo ajusta pela tela "Gerenciar Normas/FAQ".

### 6.5 Conferências na VPS

- A rotina de backup do serviço `db` cobre **o banco novo**, e não só o de Lavras.
- Memória e disco da VPS depois que os dois serviços novos estiverem no ar.
- Se o `web` ainda for servido por `vite preview` em algum cenário, o endereço novo precisa entrar em
  `client/vite.config.ts` (`allowedHosts`). Servido por nginx, como está documentado, não é necessário.

## 7. Campos adicionais de Campo Belo

Definidos pela amostra enviada em 08/10 (planilha "BALÍSTICA", aba "Aguanil", 12 linhas). São quatro, todos
opcionais: três campos simples de texto e o REDS, que é uma lista.

| Coluna da planilha | Rótulo na tela | Onde fica no banco | O que a amostra mostra |
|---|---|---|---|
| PCNET | PCNET | coluna `vestiges.numero_pcnet` | número de 7 ou 8 dígitos; **repete** entre vestígios da mesma ocorrência |
| REDS | REDS | tabela nova `vestige_reds`, um ou mais por vestígio (7.1) | formato `2023-036108763-001`; uma linha traz **dois** números na mesma célula |
| NOME DA CAIXA | Caixa | coluna `vestiges.caixa` | códigos como `AGAR1` e `AGB1` |
| PRATELEIRA | Prateleira | coluna `vestiges.prateleira` | vazia nas 12 linhas |

PCNET, caixa e prateleira são texto, e não número, porque são identificadores: não se faz conta com eles.

O nome `numero_pcnet` evita confusão com a integração que já existe: os botões "Ver FAV" e "Movimentar" abrem o PCNET
pela FAV (`client/components/VestigeCard.tsx:95` e `:116`) e continuam funcionando igual em Campo Belo.

### 7.1 REDS: um ou mais por vestígio (D13)

Dois REDS para o mesmo vestígio é uma situação real e tem de ficar registrada. O REDS segue o modelo que o sistema já
usa para requisições e invólucros (`docs/plans/2026-09-10-multiplas-requisicoes-motivo-design.md`):

- **Tabela própria**, `vestige_reds`, com a mesma estrutura de `vestige_requisicoes`: número, motivo da inclusão, data
  de criação e remoção lógica. REDS lançado por engano sai da tela, mas a linha continua no banco.
- **Mesmo serviço de regras** (`server/src/services/vestigeItemService.ts`), que ganha o tipo `reds` ao lado de
  `involucro` e `requisicao`: no cadastro, todos entram como registro inicial; na edição, número novo é inclusão,
  número que sumiu da lista é remoção lógica e número que já existia fica intocado.
- **Mesma tela:** no formulário, a lista de REDS funciona como a de requisições e aceita vários já no cadastro
  inicial; a conferência de edição mostra os números incluídos e removidos.
- **Formato:** o REDS é gravado completo, `AAAA-NNNNNNNNN-SEQ`, com ano e sequência. Ao contrário da requisição
  (D12), aqui o ano faz parte do identificador oficial. Número novo digitado na tela é validado nesse formato; o que
  vier da planilha fora do padrão não é revalidado, é listado no diagnóstico.
- **Busca:** procurar um REDS traz todos os vestígios ligados a ele, tenha o vestígio um REDS ou vários.

**Uso futuro em Lavras.** A tabela passa a existir nos dois bancos na mesma migration (D2). Se Lavras começar a
registrar REDS, basta incluir `reds` no `extraFields` da unidade: sem migration nova e sem mudança de código.

**Motivos ao incluir um REDS numa edição:** só dois, **"Ocorrência relacionada"** e **"Outro"** (códigos
`OCORRENCIA_RELACIONADA` e `OUTRO`). No cadastro inicial não se pergunta motivo, como já é hoje com requisição e
invólucro. *Definido pelo usuário em 08/10.*

### 7.2 Observações (D15)

A coluna OBSERVAÇÃO das planilhas entra no banco e na tela.

- **Banco:** nada a criar. O campo `observacoes` já existe em `vestiges` nas duas unidades, e as rotas de cadastro e
  de edição já o aceitam (`server/src/routes/vestigeRoutes.ts:280` e `:339`). O que falta é a tela: hoje nenhum
  componente mostra nem edita esse campo.
- **Tela:** texto livre no formulário, exibido no card quando preenchido e incluído na conferência de edição.
  Habilitado por unidade, como os demais campos desta seção.
- **Rótulo:** a tela já tem um campo chamado "Observação", que é a observação **da destinação** (`destinacaoObs`,
  mostrado quando o vestígio saiu da URC). Para não confundir os dois, o campo novo aparece como "Observações do
  vestígio".
- **Lavras:** fica oculto até a unidade habilitar na configuração. Antes de habilitar, conferir o que já está gravado
  nesse campo: scripts antigos escreveram nele (por exemplo `server/scripts/cadastrar-favs-pendentes.cjs`), e esse
  texto passaria a aparecer na tela.

### 7.3 Por onde os campos passam

- **Banco:** uma migration, escrita à mão e aplicada com `migrate deploy` (o `migrate dev` falha neste projeto com
  `P3014`), acrescentando três colunas opcionais em `vestiges` e a tabela `vestige_reds`. Roda no `api` **e** no
  `api-cb`. Em Lavras ficam vazias.
- **Configuração:** `extraFields` de Campo Belo lista os quatro campos novos e as observações; o de Lavras fica
  vazio. Se Lavras quiser usar REDS, caixa, prateleira ou observações um dia, basta acrescentar na configuração.
- **Servidor:** `server/src/routes/vestigeRoutes.ts`, nos esquemas de cadastro (linhas 272-283) e de edição
  (331-343). PCNET, caixa e prateleira entram como campos simples; o REDS entra como lista, pelo mesmo caminho de
  `involucros` e `requisicoes`. Os quatro só são aceitos na unidade que os habilita; nas demais o valor enviado é
  descartado. As rotas de listagem já devolvem todas as colunas do vestígio e passam a incluir a lista de REDS.
- **Tela:** `client/types.ts` e `client/services/dataService.ts` (mapeamento), `VestigeFormModal` (três campos e a
  lista de REDS), `VestigeCard` (mostra os preenchidos) e `ConfirmEditModal.tsx:55-73` (entram na conferência
  "antes → depois" da edição).
- **Busca rápida** (`client/hooks/useVestiges.ts:131-145`): passa a procurar também em PCNET, REDS e caixa. Buscar um
  PCNET ou um REDS traz todos os vestígios da mesma ocorrência; buscar `AGAR1` traz tudo o que está naquela caixa, o
  que serve para conferência de inventário.
- **Auditoria:** cadastro e edição já gravam no log todos os campos enviados (`details: { ...data }` nas ações
  `CREATE` e `UPDATE`), então troca de caixa ou de prateleira fica registrada com autor e horário. Inclusão e remoção
  de REDS ficam no log do mesmo jeito que as de requisição e invólucro.
- **Relatório/PDF:** os quatro campos ficam fora por enquanto.

## 8. Importação das planilhas de Campo Belo

### 8.1 Estrutura, pela amostra

São **quatro planilhas** do Google Sheets, cada uma com **uma aba por cidade**. A amostra é a aba "Aguanil" da
planilha "BALÍSTICA". O modelo atual do banco atende sem mudança: em Lavras a aba é a categoria e o município é uma
coluna; em Campo Belo a **planilha é a categoria** (D9) e a **aba é o município** (D6).

| Na planilha | Destino no EvidenceOS | Regra |
|---|---|---|
| *nome da planilha* | categoria (`vestige_categories`) | quatro categorias, criadas pelo importador |
| *nome da aba* | `municipio` | grafia conferida contra a lista da unidade |
| DATA DE ENTRADA | `dataColeta` — o mesmo campo da coluna DATA de Lavras, que o card mostra como "Data Entrada" | `DD/MM/AAAA`; vazia ou inválida fica nula e é listada no diagnóstico |
| FAV | `registroFav` | |
| INVÓLUCRO | `vestige_involucros`, motivo `LEGADO` | mais de um número na célula vira mais de um item |
| REQUISIÇÃO | `vestige_requisicoes`, motivo `LEGADO` | idem; grava só o número depois do ano e do hífen (D12); marcador de vazio não vira item |
| DESCRIÇÃO | `material` | |
| REDS | `vestige_reds`, motivo `LEGADO` | mais de um número na célula vira mais de um item (D13); gravado completo, com ano e sequência |
| PCNET, NOME DA CAIXA, PRATELEIRA | colunas novas em `vestiges` (seção 7) | |
| OBSERVAÇÃO | `observacoes`, campo que já existe (7.2) | texto importado como está (D15) |
| DATA DE SAÍDA, RESPONSÁVEL PELA RETIRADA | o conteúdo **não é importado** (D14); a linha preenchida entra com `destinacao = RETIRADO` (D17) | as demais entram como "Na URC"; vazias nas 12 linhas da amostra |

O que a amostra já mostrou:

- **"NÃO CONSTA" na requisição** (1 das 12 linhas). É marcador de vazio, como o `x` e o `N/I` da planilha de Lavras:
  o vestígio entra **sem requisição**, nunca com uma requisição de número "NÃO CONSTA". A lista completa de marcadores
  sai do diagnóstico.
- **PCNET e REDS repetidos entre linhas** são o normal (vários vestígios da mesma ocorrência), não duplicata. Duplicata
  se mede por FAV e por invólucro.
- **Dois REDS na mesma célula** (1 das 12 linhas, separados por vírgula): viram dois itens em `vestige_reds` (D13).
  O diagnóstico lista os separadores encontrados, os REDS fora do formato `AAAA-NNNNNNNNN-SEQ` e as células de PCNET
  com mais de um número, se houver.
- **Requisição no formato `AAAA-NNNNNNNNN`** (D12). Regras da importação:
  - célula no formato `AAAA-número`: grava só o número, **com o zero à esquerda** que estiver na planilha
    (`2023-047176200` → `047176200`);
  - célula que já é só dígitos: grava como está;
  - qualquer outro formato: não é transformado em silêncio; vai para o relatório do diagnóstico, para decisão caso a
    caso.
- **O número sem o ano continua único?** Nas 11 requisições da amostra a numeração cresce de um ano para o outro sem
  reiniciar (`047…` em 2023, `048…` e `051…` em 2024, `057…` em 2026), o que indica sequência única. O diagnóstico
  confere isso nas quatro planilhas: lista qualquer número que apareça com dois anos diferentes.
- **Zero inicial: mantido** (D12). As 11 requisições da amostra têm 9 dígitos depois do ano. O diagnóstico lista as
  que tiverem outra quantidade de dígitos.
- **Busca.** A busca numérica compara por igualdade exata, então `47176200` não encontra `047176200`, e colar
  `2023-047176200` não encontra o número gravado sem o ano. Recomendado ajustar a busca para ignorar o zero inicial e o
  prefixo do ano. Vale para as duas unidades e já estava anotado como pendência de Lavras em
  `docs/plans/2026-09-29-busca-paginacao-e-duplicatas.md`.
- **Para o padrão de 9 dígitos se manter**, o cadastro e a edição precisam completar com zero inicial a requisição
  digitada com menos dígitos; senão a mistura volta com o uso. É mudança na validação de requisição
  (`server/src/services/vestigeItemService.ts`) e depende de aprovação própria. *A confirmar.*

### 8.2 Roteiro

A importação de Lavras não serve como está: lê de um endereço fixo de Apps Script
(`server/scripts/_phase2-common.cjs:10`) e trata a aba como categoria. Campo Belo terá um importador próprio, sem
mexer nos scripts de Lavras, seguindo o roteiro que funcionou lá.

O roteiro roda **duas vezes**. Agora, com as planilhas ainda em uso, para conhecer a estrutura e os problemas e dar
tempo de a equipe corrigir na origem. E de novo no marco inicial (D10), sobre uma cópia tirada no momento em que a
equipe para de alimentar as planilhas: é essa cópia final que vai para produção.

1. **Arquivos.** Pedir ao usuário que baixe as quatro planilhas em `.xlsx` e as coloque em
   `c:\tmp\campobelo-planilhas\<data>\` (8.3). Cada `.xlsx` baixado do Google Sheets já traz todas as abas.
2. **Conversão e diagnóstico, na máquina local, sem gravar em banco nenhum.** Um script local (Python + openpyxl, o
   mesmo ferramental de `scripts/gerar-planilha-conferencia.py`) lê os quatro arquivos e gera um arquivo único de
   importação em `database/` (pasta cujos `.json` já ficam fora do versionamento), mais um relatório: linhas por
   planilha e por aba; abas com cabeçalho diferente do esperado ou colunas deslocadas; linhas sem FAV; marcadores de
   vazio encontrados; datas inválidas; células com mais de um invólucro, requisição ou REDS; FAVs e invólucros
   repetidos, na mesma aba e entre abas; linhas com saída preenchida; nomes de aba para a lista de municípios (D6);
   nomes de caixa distintos.
3. **O usuário confere o relatório** e decide os casos duvidosos antes de qualquer gravação.
4. **Ensaio no banco local de Campo Belo**, com conferência das contagens por categoria e município contra o
   relatório.
5. **Produção, no console do serviço `api-cb`.** O importador só roda com `UNIT=campobelo`, confere o nome do banco,
   confere o hash do arquivo, grava tudo em uma transação e registra a importação no log de auditoria (contagens, hash
   do arquivo e operador). Rodar de novo não duplica: cada linha tem identificador próprio derivado de planilha, aba
   e linha.
6. **Validação.** Contagens por categoria e município na tela iguais às do relatório, e uma amostra de FAVs conferida
   pela equipe de Campo Belo.

### 8.3 Como os dados circulam (D16)

São dois trechos, com riscos diferentes.

**Das planilhas para a máquina local (diagnóstico e ensaio): por arquivo.** Decidido em 08/10. As planilhas não são
abertas por link.

- **Quem executa pede ao usuário**, no início de cada rodada, que baixe as quatro planilhas. Em cada uma: Arquivo →
  Fazer download → Microsoft Excel (`.xlsx`). O arquivo já traz todas as abas.
- **Pasta:** `c:\tmp\campobelo-planilhas\`, com uma subpasta por rodada, nomeada pela data (`AAAA-MM-DD`). Fica fora
  do repositório e recebe só os quatro arquivos; os scripts ficam no repositório.
- Os arquivos não são versionados nem copiados para dentro do projeto.
- *Alternativa descartada:* abrir as planilhas por link. Funcionaria, mas os links ficariam gravados no histórico da
  conversa e o compartilhamento tenderia a ficar aberto entre as duas rodadas, com dados de vestígios (FAV, REDS,
  PCNET, armas com número de série).

**Da máquina local para o servidor (carga em produção).** A produção é só leitura para o agente: quem executa a carga
é o usuário, no console do serviço `api-cb`, com o importador e o arquivo já conferidos.

O arquivo que vai para produção é **o mesmo que foi diagnosticado e conferido**, e não uma nova leitura da planilha:
assim o que entra no banco é exatamente o que foi aprovado, mesmo que alguém edite a planilha no intervalo, e o
servidor não precisa de biblioteca para ler `.xlsx`.

O console do Easypanel não transfere arquivos. Recomendado: disponibilizar o arquivo de importação por um link
temporário, baixá-lo de dentro do `api-cb` com o endereço passado **na linha de comando**, conferir o hash e remover o
link logo depois. O endereço nunca entra no código nem no repositório — na importação de Lavras o endereço público do
Apps Script ficou versionado (`server/scripts/_phase2-common.cjs:10`), e é isso que se quer evitar.

### 8.4 O que falta para fechar esta seção

- As quatro planilhas em `.xlsx`, a pedir ao usuário quando a execução começar (8.3). Delas saem os três nomes de
  categoria que faltam (D9) e a lista de municípios (D6).
- Confirmar se o cadastro passa a completar a requisição com zero inicial até 9 dígitos (8.1).
- Confirmar, na hora da carga, a forma de enviar o arquivo conferido ao servidor (8.3).

## 9. Resumo de Impacto de Segurança e Auditoria

**Isolamento entre as unidades, em quatro camadas independentes:**

1. **Banco:** cada api só tem a credencial do próprio banco, e o usuário de banco de uma unidade não consegue nem
   conectar no banco da outra (6.1).
2. **Token:** o perfil (ADMIN/PERITO/VISUALIZADOR) é lido de dentro do token, sem consulta ao banco
   (`server/src/routes/userRoutes.ts:11-13`). Com o mesmo `JWT_SECRET`, um token de ADMIN de Lavras seria aceito como
   ADMIN em Campo Belo. Com segredos diferentes, o token de uma unidade é inválido na outra.
3. **Navegador:** endereços diferentes; cookie de sessão e `localStorage` não se misturam.
4. **Origem (CORS):** hoje `origin: true` com `credentials: true` aceita chamadas de qualquer site. Os dois endereços
   ficam sob o mesmo domínio, então o cookie `SameSite=Lax` não separa um do outro; a lista de origens por instância é
   o que impede uma página de uma unidade de usar a sessão da outra.

**Autenticação:** login, renovação e revogação de sessão não mudam. Mudam o CORS (item 4) e a obrigatoriedade de
`APP_URL`. A rota nova `GET /api/unit` é pública e só devolve nome, municípios e campos habilitados.

**Trilha de auditoria:** cada unidade tem a sua tabela `audit_logs`; os registros não se misturam. O coordenador tem
uma conta em cada unidade, e o que fizer em Campo Belo fica registrado em Campo Belo. A importação inicial grava
registro próprio.

**Cadeia de custódia:** nenhuma regra muda. Regra das 24h, histórico de destinação, solicitações de retirada e
registro de ações do PCNET ficam como estão, em cada banco. Os quatro campos novos (seção 7) são gravados e
auditados pelo mesmo caminho dos demais campos do vestígio. O REDS segue a regra das requisições e dos invólucros:
remover é marcar como removido, nunca apagar a linha. A data de saída e o responsável pela retirada que constam
nas planilhas não são importados (D14): daqui para frente, saída de material se registra pelas ferramentas do próprio
sistema. O vestígio que a planilha registra como já saído entra como "Retirado" (D17), para o acervo não mostrar na
URC um material que não está lá. Essa situação vem da planilha, não de uma ação no sistema: a importação não cria
linha no histórico de destinação em nome de quem importou, e a quantidade de vestígios que entraram como retirados
fica no registro de auditoria da importação.

**Checklist:** nome da unidade e municípios vêm de arquivo versionado, não de entrada do usuário (sem risco novo de
XSS na tela ou no e-mail); nenhum segredo neste documento nem no código; senhas e segredos só no Easypanel.

**Riscos e mitigação:**

| Risco | Mitigação |
|---|---|
| Uma unidade fica com código ou migration atrás da outra | Rotina da seção 11; aviso pós-push passa a listar os cinco serviços; D11 |
| Coordenador logado nas duas opera na unidade errada | Nome da unidade no cabeçalho, no título da aba e na tela de login |
| Script de Lavras rodado contra o banco de Campo Belo (ou o contrário) | Trava por `UNIT` em cada script (seção 5) e no importador (seção 8) |
| Deploy do código novo derruba Lavras por falta de `UNIT` | Variáveis criadas no `api` antes do deploy (seção 10, passo 2) |
| `REVOKE` no banco de Lavras bloqueia o próprio `api` | `GRANT` antes, conferência do `/api/health`, reversão em uma linha (6.1) |
| Backup não inclui o banco novo | Conferência em 6.5 antes de importar dados |
| Dados das planilhas expostos ou versionados durante a importação | Arquivo fora do repositório, link temporário, endereço só na linha de comando (8.3) |
| Importar algo diferente do que foi conferido | O arquivo diagnosticado é o que vai para produção, com hash conferido (8.3) |

## 10. Ordem de execução

Cada passo só começa com aprovação explícita.

1. **Ensaio local.** Segundo banco no Postgres local, `migrate deploy` do zero, api com `UNIT=campobelo` em outra
   porta. Conferir: cabeçalho e municípios certos; vestígio criado cai só no banco de Campo Belo; usuário de Lavras não
   entra; token de uma api é recusado pela outra; api sem `UNIT` não sobe. *(No navegador, usar `localhost` para uma e
   `127.0.0.1` para a outra: cookie não distingue porta, e as duas sessões locais se sobrescreveriam.)*
2. **Código da seção 5 em Lavras.** Antes: criar `UNIT` e `CORS_ORIGINS` no serviço `api`. Depois: implantar `api`,
   em seguida `web` (`Ctrl+Shift+R`). Conferir que Lavras está igual: login, cabeçalho, municípios, relatório em PDF,
   registro em Logs de Auditoria. `db`: nenhuma ação.
3. **Serviço `db`:** banco e usuário de Campo Belo (6.1).
4. **Serviços `api-cb` e `web-cb`:** criação, variáveis, domínio, migrations, ADMIN (6.2 a 6.4).
5. **Teste de isolamento em produção:** usuário de Lavras não entra em Campo Belo e vice-versa; vestígio de teste
   criado em Campo Belo não aparece em Lavras; log de auditoria aparece só na unidade certa.
6. **Campos adicionais** (seção 7): migration no `api` **e** no `api-cb`.
7. **Importação** (seção 8) e definição do marco inicial (D10).
8. **Documentação:** tabela de serviços do `CLAUDE.md` e nota de deploy do `README.md` passam de três para cinco
   serviços.

## 11. Rotina depois que as duas unidades estiverem no ar

| O commit mexeu em | Implantar | Passo extra |
|---|---|---|
| `server/` | `api` **e** `api-cb` | migration nova: `cd /app && npx prisma@7.7.0 migrate deploy` no console do `api` **e** no do `api-cb` |
| `client/` | `web` **e** `web-cb` | `Ctrl+Shift+R` em cada endereço |
| qualquer um | `db` | nenhuma ação |

As duas unidades não ficam em versões diferentes de um dia para o outro.

## 12. Observado, fora deste plano

- A rota de login não tem limite de tentativas na aplicação (não há `@fastify/rate-limit` no projeto). Com duas telas
  de login públicas, vale tratar em uma alteração própria.
- **Lavras com requisição de 9 dígitos (D18).** Recomendação: completar com zero inicial as requisições de Lavras que
  estão com 8 dígitos, para as duas unidades ficarem no mesmo padrão (hoje convivem `46500329` e `058177195`). Antes
  de qualquer alteração: levantar quantas requisições há por quantidade de dígitos, tratar à parte o que não for só
  dígitos (legado da planilha) e o que tiver menos de 8, simular, e só então aplicar, com registro em auditoria. Mexe
  em dado de vestígio em produção: exige plano e aprovação próprios.
- O agente `sincronizador-drive` e os scripts `sync-*` são da planilha de Lavras e não se aplicam a Campo Belo.
- O endereço do Apps Script da importação de Lavras continua no código (`server/scripts/_phase2-common.cjs:10`). Se o
  script ainda estiver publicado, ele entrega a base antiga sem autenticação; despublicar encerra a pendência.

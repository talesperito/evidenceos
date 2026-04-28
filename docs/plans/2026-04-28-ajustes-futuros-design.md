# Planejamento de Ajustes Futuros

**Data:** 2026-04-28
**Status:** rascunho inicial
**Escopo de hoje:** leitura de contexto e preparação do documento de planejamento

---

## Contexto lido em `.agent`

- O projeto mantém contexto estratégico em `.agent/rules/evidenceos-strategic-context.md`.
- Há skills locais para brainstorming, escrita de planos, execução de planos e verificação antes de conclusão.
- A orientação local prioriza planejamento, análise de impacto e validação antes de qualquer mudança de código.

## Objetivo deste documento

Centralizar os pedidos de ajuste que serão detalhados nas próximas conversas, sem iniciar implementação nesta etapa.

## Premissas atuais

- Hoje não haverá alterações de código.
- Os próximos pedidos serão usados para definir escopo, impacto, riscos e abordagem.
- Quando o escopo estiver fechado, este documento pode ser refinado ou desdobrado em planos de implementação mais específicos.

## Pedidos a registrar

### 1. Ajuste

- Descrição: implementar fluxo de recuperação/reset de senha para usuários que não conseguem mais acessar a conta.
- Motivação: hoje o sistema só permite troca de senha para usuário autenticado; não existe fluxo de "esqueci minha senha", o que cria dependência operacional manual e risco de indisponibilidade de acesso.
- Área afetada: autenticação, back-end de usuários, interface de login e procedimento operacional de suporte.
- Restrições:
  - preservar auditoria de ações sensíveis;
  - evitar exposição de senha em texto puro;
  - definir expiração, uso único e rastreabilidade se houver token de recuperação.
- Critérios de sucesso:
  - usuário sem sessão autenticada consegue iniciar recuperação de senha por fluxo controlado;
  - o sistema registra auditoria da solicitação e da conclusão do reset;
  - o processo não exige consulta manual ao banco nem alteração direta em script.

### 2. Ajuste

- Descrição: remover senhas e credenciais default hardcoded do script `server/scripts/bootstrap-admin.cjs`.
- Motivação: o projeto hoje contém fallback de credenciais administrativas no código-fonte, o que é um risco de segurança e também cria confusão operacional, como evidenciado pela existência de uma senha desconhecida pelo administrador real.
- Área afetada: bootstrap administrativo, variáveis de ambiente, documentação operacional e processo de recuperação de acesso.
- Restrições:
  - impedir bootstrap/reset com credenciais implícitas;
  - exigir variáveis explícitas de ambiente para criação ou redefinição administrativa;
  - documentar uso temporário e remoção posterior dessas credenciais do ambiente.
- Critérios de sucesso:
  - nenhum e-mail ou senha administrativa permanece hardcoded no código;
  - o script falha explicitamente se variáveis obrigatórias não forem informadas;
  - existe procedimento documentado e seguro para reset administrativo.

### 3. Ajuste

- Descrição: permitir cadastro de vestígio com data retroativa.
- Motivação: a inserção retroativa é essencial para refletir corretamente a data real de coleta ou ingresso do material, preservando o histórico operacional.
- Área afetada: formulário de cadastro de vestígio, validações de front-end e back-end, auditoria de criação.
- Restrições:
  - manter rastreabilidade da data real informada e da data de cadastro no sistema;
  - evitar bloquear registros legítimos apenas por serem retroativos.
- Critérios de sucesso:
  - o usuário consegue informar data retroativa no cadastro;
  - o sistema preserva separadamente a data do evento e a data de criação do registro.

### 4. Ajuste

- Descrição: trocar o rótulo `Origem (Tipo/Planilha)` por `Categoria do Vestígio` na tela de cadastro de novo vestígio.
- Motivação: o termo atual está inadequado para o uso real da funcionalidade e gera ambiguidade para o operador.
- Área afetada: interface de cadastro de vestígios.
- Restrições:
  - revisar se existem outros pontos da interface com a mesma nomenclatura inconsistente.
- Critérios de sucesso:
  - o formulário passa a exibir `Categoria do Vestígio` de forma consistente.

### 5. Ajuste

- Descrição: corrigir a exclusão de vestígios por usuário administrador.
- Motivação: em teste local, o perfil `ADMIN` não está conseguindo deletar vestígios, indicando possível falha de permissão, integração ou tratamento de erro.
- Área afetada: ação de exclusão no front-end, endpoint de exclusão, autenticação/autorização e feedback de erro.
- Restrições:
  - preservar exclusão lógica/soft delete e trilha de auditoria;
  - não permitir regressão de segurança para outros perfis.
- Critérios de sucesso:
  - o administrador consegue excluir vestígios em ambiente local;
  - a operação registra auditoria adequada;
  - a interface informa claramente sucesso ou falha.

### 6. Ajuste

- Descrição: ao cadastrar novo material, alertar quando já existir no banco o mesmo invólucro ou a mesma requisição.
- Motivação: reduzir duplicidade acidental e reforçar conferência operacional antes da inclusão de novo vestígio.
- Área afetada: validação de cadastro, busca prévia no banco, UX de confirmação, auditoria.
- Restrições:
  - o alerta não deve bloquear casos legítimos de inclusão;
  - se o usuário insistir em cadastrar, isso deve ser explicitamente confirmado e registrado.
- Critérios de sucesso:
  - o sistema alerta quando encontrar invólucro igual ou requisição igual;
  - a mensagem informa que a continuidade ficará registrada;
  - se o usuário confirmar a inclusão, a ação segue e gera log de auditoria com esse contexto.

### 7. Ajuste

- Descrição: alterar o formato de entrada do campo `requisição` no cadastro de novo vestígio para remover o ano dos quatro primeiros dígitos.
- Motivação: padronizar o preenchimento para que o usuário informe apenas a parte final da requisição, evitando inconsistência no cadastro.
- Área afetada: formulário de cadastro, máscara/validação do campo, mensagens de ajuda.
- Restrições:
  - deixar claro na interface que o ano não deve ser informado;
  - revisar possível impacto em busca, persistência e exibição de requisição já cadastrada.
- Critérios de sucesso:
  - o campo aceita apenas o formato final esperado, por exemplo `123456789`;
  - a interface orienta explicitamente que o ano não deve ser informado.

### 8. Ajuste

- Descrição: corrigir a impressão na busca avançada para respeitar apenas os vestígios selecionados pelo usuário.
- Motivação: hoje, quando a busca avançada retorna vários itens e apenas alguns são selecionados, a impressão leva toda a lista retornada, e não somente os selecionados.
- Área afetada: busca avançada, seleção de resultados, geração de impressão/relatório.
- Restrições:
  - manter compatibilidade com os demais fluxos de impressão;
  - garantir que a seleção ativa seja a fonte única da impressão.
- Critérios de sucesso:
  - na busca avançada, a impressão considera apenas os vestígios selecionados;
  - a lista completa não é impressa indevidamente.

### 9. Ajuste

- Descrição: corrigir inconsistência de resultados e contagem na busca avançada ao alterar filtros sem limpar a busca anterior.
- Motivação: no teste relatado, ao buscar por cidade e intervalo de datas e depois alterar apenas a categoria para `Celulares`, a contagem geral muda, mas os resultados retornados permanecem incoerentes, incluindo categorias, datas e cidades indevidas.
- Área afetada: estado dos filtros no front-end, composição da query, atualização dos resultados, contagem total e possível cache local.
- Restrições:
  - garantir que cada nova busca use apenas os filtros atualmente ativos;
  - evitar mistura de resultados anteriores com estado novo;
  - validar separadamente contagem total e lista efetivamente renderizada.
- Critérios de sucesso:
  - ao alterar qualquer filtro e clicar em buscar, os resultados refletem exatamente os filtros ativos;
  - a contagem total corresponde à lista retornada;
  - não há reaproveitamento indevido de estado da busca anterior.

## Riscos e pontos de atenção

- Impacto na integridade forense e trilha de auditoria.
- Impacto em autenticação, credenciais e variáveis de ambiente.
- Possíveis dependências entre ajustes para evitar retrabalho.
- Risco de exposição de credenciais administrativas por fallback invisível no código.
- Risco operacional de perda de acesso por ausência de fluxo formal de recuperação de senha.
- Risco de duplicidade operacional por falta de alerta em invólucro/requisição repetidos.
- Risco de erro material em relatórios/impressões se a seleção da busca avançada não for respeitada.
- Risco de decisões incorretas por resultados inconsistentes na busca avançada.

## Decisões em aberto

- Ordem de implementação dos ajustes.
- Necessidade de separar por épicos, módulos ou prioridade.
- Estratégia de validação para cada mudança.

## Prioridade inicial

### Urgência alta

1. Criar fluxo seguro de recuperação/reset de senha.
2. Remover imediatamente credenciais hardcoded do script de bootstrap administrativo.
3. Investigar inconsistência da busca avançada, por impacto direto na confiança do resultado exibido.
4. Corrigir falha de exclusão por administrador.

### Observação operacional confirmada

- O banco de produção consultado em `2026-04-28` contém o administrador `talesgvieira@gmail.com` com perfil `ADMIN`.
- A senha hardcoded identificada no script não corresponde ao uso operacional conhecido do administrador e deve ser tratada como passivo técnico de segurança.

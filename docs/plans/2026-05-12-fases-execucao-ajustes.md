# Plano de Execução dos Ajustes Futuros

**Última atualização:** 2026-05-13  
**Status geral:** ✅ TODAS AS FASES CONCLUÍDAS

---

## Fase 1: Correções Rápidas e Segurança Crítica
**Complexidade: BAIXA** | **Status: ✅ CONCLUÍDA (2026-05-12)**

### Ajuste 2 — Remover credenciais hardcoded do bootstrap-admin ✅
- **Arquivo alterado:** `server/scripts/bootstrap-admin.cjs`
- **O que foi feito:** Removidos os valores default `admin@evidenceos.local` e `Admin@123456`. O script agora é fail-fast: falha explicitamente com mensagem de erro e exemplo de uso caso `BOOTSTRAP_ADMIN_EMAIL` ou `BOOTSTRAP_ADMIN_PASSWORD` não estejam definidos como variáveis de ambiente.
- **Visível no front:** Não (backend/script administrativo).

### Ajuste 4 — Trocar rótulo "Origem" por "Categoria do Vestígio" ✅
- **Arquivos alterados:** `client/components/VestigeFormModal.tsx`, `client/components/VestigeCard.tsx`
- **O que foi feito:** Label do campo `select` no formulário alterado de `ORIGEM (TIPO/PLANILHA)` para `CATEGORIA DO VESTÍGIO`. No card de listagem, o cabeçalho `Origem` foi renomeado para `Categoria`.
- **Visível no front:** Sim — no formulário de novo/editar vestígio e nos cards da listagem.

### Ajuste 7 — Alterar formato do campo "Requisição" ✅
- **Arquivo alterado:** `client/components/VestigeFormModal.tsx`
- **O que foi feito:** Placeholder atualizado para `Ex: 123456001 (sem o ano)`. Tooltip (`title`) atualizado para instrução explícita. Adicionada linha de hint abaixo do campo: *"Não inclua o ano (ex: 2024) no início do número."*
- **Visível no front:** Sim — no formulário de novo/editar vestígio.

---

## Fase 2: Ajustes de Fluxo e Regras de Negócio
**Complexidade: MÉDIA** | **Status: ✅ CONCLUÍDA (2026-05-12)**

### Ajuste 5 — Corrigir exclusão de vestígios por administrador ✅
- **Arquivo alterado:** `server/src/routes/vestigeRoutes.ts`
- **O que foi feito:** Adicionada verificação de existência (`findFirst`) antes do soft-delete. Antes, uma tentativa de deletar um ID inexistente ou já deletado causava erro interno do Prisma (P2025) que chegava ao frontend como falha genérica. Agora retorna `404` com mensagem clara. O log de auditoria agora também registra `material` e `registroFav` do item excluído.
- **Visível no front:** Sim — mensagem de erro mais clara em caso de falha; exclusão funciona corretamente para ADMIN.

### Ajuste 3 — Permitir cadastro com data retroativa ✅
- **Arquivo alterado:** `client/components/VestigeFormModal.tsx`
- **O que foi feito:** Não havia bloqueio técnico — o campo `date` já aceitava datas passadas. O ajuste foi de clareza: label renomeado para `DATA DO EVENTO / ENTRADA` e adicionada dica inline *"Informe a data real do evento. Datas retroativas são permitidas."*
- **Visível no front:** Sim — no formulário de novo/editar vestígio.

### Ajuste 8 — Impressão respeita apenas itens selecionados ✅
- **Arquivos alterados:** `client/components/SearchResults.tsx`, `client/components/Dashboard.tsx`
- **O que foi feito:** Quando há itens selecionados e o usuário clica em "Imprimir" fora do modo "Minha Lista", um diálogo de confirmação é exibido: `OK` ativa a visualização de seleção e imprime apenas os itens selecionados; `Cancelar` imprime todos os resultados da busca como antes. Adicionado prop `onViewSelection` ao `SearchResults` e conectado ao `Dashboard`.
- **Visível no front:** Sim — comportamento do botão "Imprimir" quando há itens selecionados.

---

## Fase 3: Funcionalidades Complexas e Debugging Estrutural
**Complexidade: ALTA** | **Status: ✅ CONCLUÍDA (2026-05-13)**

### Ajuste 9 — Inconsistência de resultados na busca avançada ✅
- **Arquivo alterado:** `client/hooks/useVestiges.ts`
- **O que foi feito:** `searchVestiges` agora sempre chama `loadData()` a cada nova busca, garantindo dados frescos do servidor. O bug era que ao trocar filtros sem limpar a busca, o estado `vestiges` era reutilizado como cache desatualizado. Removida dependência `vestiges` do `useCallback` de `searchVestiges`.
- **Visível no front:** Sim — resultados e contagens sempre coerentes ao alterar filtros.

### Ajuste 6 — Alerta de invólucro ou requisição duplicada ✅
- **Arquivos alterados:** `server/src/routes/vestigeRoutes.ts`, `client/services/dataService.ts`, `client/components/VestigeFormModal.tsx`
- **O que foi feito:** Novo endpoint `GET /api/vestiges/check-duplicate?involucro=X&requisicao=Y&excludeId=Z`. Ao submeter o formulário, um preflight check é executado. Se duplicata encontrada, exibe alerta inline com dados do registro existente e dois botões: "Salvar Mesmo Assim" e "Cancelar e Revisar". Não bloqueia — apenas exige confirmação explícita.
- **Visível no front:** Sim — alerta visual no formulário de novo/editar vestígio quando duplicata detectada.

### Ajuste 1 — Fluxo de recuperação/reset de senha ✅
- **Arquivos alterados/criados:**
  - `server/prisma/schema.prisma` — novo model `PasswordResetToken` (token, expiração, uso único, userId, IP)
  - `server/src/routes/authRoutes.ts` — 2 novas rotas: `POST /api/auth/forgot-password` e `POST /api/auth/reset-password`
  - `client/components/ResetPasswordPage.tsx` — novo componente completo com fluxo multi-step
  - `client/components/Login.tsx` — link "Esqueci minha senha" adicionado abaixo do botão de login
  - `client/App.tsx` — detecção automática de rota `/reset-password?token=...`
- **O que foi feito:**
  - Token UUID gerado, armazenado como hash SHA-256 (token em texto claro só existe em memória/log temporário)
  - Expiração de 1 hora, uso único (`usedAt`), invalidação de tokens anteriores pendentes
  - Resposta genérica no `/forgot-password` (não revela se e-mail existe)
  - Revogação de todas as sessões ativas ao completar o reset
  - Auditoria de `PASSWORD_RESET_REQUESTED` e `PASSWORD_RESET_COMPLETED`
  - E-mail mockado via `server.log.warn` com TODO explícito para integração SMTP
  - Migração aplicada via `prisma db push`; cliente regenerado via `prisma generate`
- **Visível no front:** Sim — link de esqueci senha na tela de login; página completa de reset com 4 estados (solicitação, sucesso-solicitação, redefinição, sucesso-redefinição, token inválido).

---

## Decisões em aberto

- ~~Ordem de implementação dentro da Fase 3 (sugestão: 9 → 6 → 1 por complexidade crescente e impacto imediato).~~ ✅ Executado nesta ordem.
- **Estratégia de e-mail para o Ajuste 1:** SMTP real ainda pendente. Token atualmente logado em `server.log.warn` para uso manual pelo administrador. Recomendado integrar `nodemailer` ou serviço transacional (SendGrid, AWS SES) em sprint futura.
- ~~Necessidade de migração de banco para o Ajuste 1 (novo modelo Prisma).~~ ✅ Aplicado via `prisma db push`.


---

## Fase 1: Correções Rápidas e Segurança Crítica
**Complexidade: BAIXA** | **Status: ✅ CONCLUÍDA (2026-05-12)**

### Ajuste 2 — Remover credenciais hardcoded do bootstrap-admin ✅
- **Arquivo alterado:** `server/scripts/bootstrap-admin.cjs`
- **O que foi feito:** Removidos os valores default `admin@evidenceos.local` e `Admin@123456`. O script agora é fail-fast: falha explicitamente com mensagem de erro e exemplo de uso caso `BOOTSTRAP_ADMIN_EMAIL` ou `BOOTSTRAP_ADMIN_PASSWORD` não estejam definidos como variáveis de ambiente.
- **Visível no front:** Não (backend/script administrativo).

### Ajuste 4 — Trocar rótulo "Origem" por "Categoria do Vestígio" ✅
- **Arquivos alterados:** `client/components/VestigeFormModal.tsx`, `client/components/VestigeCard.tsx`
- **O que foi feito:** Label do campo `select` no formulário alterado de `ORIGEM (TIPO/PLANILHA)` para `CATEGORIA DO VESTÍGIO`. No card de listagem, o cabeçalho `Origem` foi renomeado para `Categoria`.
- **Visível no front:** Sim — no formulário de novo/editar vestígio e nos cards da listagem.

### Ajuste 7 — Alterar formato do campo "Requisição" ✅
- **Arquivo alterado:** `client/components/VestigeFormModal.tsx`
- **O que foi feito:** Placeholder atualizado para `Ex: 123456001 (sem o ano)`. Tooltip (`title`) atualizado para instrução explícita. Adicionada linha de hint abaixo do campo: *"Não inclua o ano (ex: 2024) no início do número."*
- **Visível no front:** Sim — no formulário de novo/editar vestígio.

---

## Fase 2: Ajustes de Fluxo e Regras de Negócio
**Complexidade: MÉDIA** | **Status: ✅ CONCLUÍDA (2026-05-12)**

### Ajuste 5 — Corrigir exclusão de vestígios por administrador ✅
- **Arquivo alterado:** `server/src/routes/vestigeRoutes.ts`
- **O que foi feito:** Adicionada verificação de existência (`findFirst`) antes do soft-delete. Antes, uma tentativa de deletar um ID inexistente ou já deletado causava erro interno do Prisma (P2025) que chegava ao frontend como falha genérica. Agora retorna `404` com mensagem clara. O log de auditoria agora também registra `material` e `registroFav` do item excluído.
- **Visível no front:** Sim — mensagem de erro mais clara em caso de falha; exclusão funciona corretamente para ADMIN.

### Ajuste 3 — Permitir cadastro com data retroativa ✅
- **Arquivo alterado:** `client/components/VestigeFormModal.tsx`
- **O que foi feito:** Não havia bloqueio técnico — o campo `date` já aceitava datas passadas. O ajuste foi de clareza: label renomeado para `DATA DO EVENTO / ENTRADA` e adicionada dica inline *"Informe a data real do evento. Datas retroativas são permitidas."*
- **Visível no front:** Sim — no formulário de novo/editar vestígio.

### Ajuste 8 — Impressão respeita apenas itens selecionados ✅
- **Arquivos alterados:** `client/components/SearchResults.tsx`, `client/components/Dashboard.tsx`
- **O que foi feito:** Quando há itens selecionados e o usuário clica em "Imprimir" fora do modo "Minha Lista", um diálogo de confirmação é exibido: `OK` ativa a visualização de seleção e imprime apenas os itens selecionados; `Cancelar` imprime todos os resultados da busca como antes. Adicionado prop `onViewSelection` ao `SearchResults` e conectado ao `Dashboard`.
- **Visível no front:** Sim — comportamento do botão "Imprimir" quando há itens selecionados.

---

## Fase 3: Funcionalidades Complexas e Debugging Estrutural
**Complexidade: ALTA** | **Status: ⏳ PENDENTE**

> Recomendado usar modelo com maior janela de contexto e capacidade de raciocínio (ex: Gemini Pro High ou Claude Opus).

### Ajuste 1 — Fluxo de recuperação/reset de senha ⏳
- **Descrição:** Criar fluxo completo e seguro para usuários sem sessão recuperarem o acesso.
- **Impacto estimado:**
  - `prisma/schema.prisma` — novo modelo `PasswordResetToken` (token, expiração, uso único, userId)
  - `server/src/routes/authRoutes.ts` — 2 novas rotas: `POST /api/auth/forgot-password` e `POST /api/auth/reset-password`
  - Mecanismo de envio de e-mail ou log temporário mockado
  - `client/components/Login.tsx` — link "Esqueci minha senha"
  - Novo componente `client/components/ResetPasswordPage.tsx`
  - Auditoria da solicitação e da conclusão do reset
- **Riscos:** Exposição de token se não houver expiração e uso único; necessidade de migração Prisma.

### Ajuste 9 — Inconsistência de resultados na busca avançada ⏳
- **Descrição:** Ao alterar filtros sem limpar a busca anterior, os resultados e a contagem retornam incoerentes.
- **Impacto estimado:**
  - `client/hooks/useVestiges.ts` — investigar se o estado `vestiges` (cache local) está sendo reutilizado incorretamente entre buscas
  - `client/components/SearchBar.tsx` — verificar se os filtros anteriores persistem no estado entre buscas
  - `server/src/routes/vestigeRoutes.ts` — validar composição da query no endpoint `/search`
- **Riscos:** Decisões operacionais baseadas em dados incorretos; impacto direto na confiança do sistema.

### Ajuste 6 — Alerta de invólucro ou requisição duplicada ⏳
- **Descrição:** Ao cadastrar novo vestígio, alertar se já existir no banco o mesmo invólucro ou a mesma requisição.
- **Impacto estimado:**
  - Novo endpoint `GET /api/vestiges/check-duplicate?involucro=X&requisicao=Y`
  - `client/components/VestigeFormModal.tsx` — preflight check ao submeter, exibição de modal de confirmação se duplicata encontrada
  - Auditoria especial quando o usuário confirmar a inclusão mesmo com alerta de duplicata
- **Riscos:** Falso positivo em casos legítimos; o alerta não deve bloquear, apenas exigir confirmação explícita.

---

## Decisões em aberto

- Ordem de implementação dentro da Fase 3 (sugestão: 9 → 6 → 1 por complexidade crescente e impacto imediato).
- Estratégia de e-mail para o Ajuste 1: SMTP real vs. log mockado na primeira versão.
- Necessidade de migração de banco para o Ajuste 1 (novo modelo Prisma).

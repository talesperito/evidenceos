-- Nº REDS e Nº PJe do vestígio, lidos da FAV no PCNET.
-- Desenho: docs/plans/2026-11-17-leitura-fav-reds-pje-design.md (seção 6.1).
--
-- Campos simples e opcionais (P6/P7): REDS e PJe se repetem entre vestígios de uma mesma ocorrência ou
-- processo (P5), por isso há índice para a busca, mas NENHUM índice único.
-- Idempotente (IF NOT EXISTS): o `migrate dev` falha com P3014 neste projeto, e a migration é ensaiada
-- antes no banco restaurado do backup.

ALTER TABLE "vestiges" ADD COLUMN IF NOT EXISTS "numero_reds" TEXT;
ALTER TABLE "vestiges" ADD COLUMN IF NOT EXISTS "numero_pje" TEXT;

CREATE INDEX IF NOT EXISTS "vestiges_numero_reds_idx" ON "vestiges"("numero_reds");
CREATE INDEX IF NOT EXISTS "vestiges_numero_pje_idx" ON "vestiges"("numero_pje");

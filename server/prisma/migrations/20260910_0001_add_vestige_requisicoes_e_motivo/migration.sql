-- Múltiplas requisições por vestígio + motivo de inclusão em invólucros e requisições.
-- Desenho: docs/plans/2026-09-10-multiplas-requisicoes-motivo-design.md

-- AlterTable
ALTER TABLE "vestige_involucros" ADD COLUMN     "motivo" TEXT NOT NULL DEFAULT 'LEGADO',
ADD COLUMN     "removed_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "vestige_requisicoes" (
    "id" BIGSERIAL NOT NULL,
    "vestige_id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "motivo" TEXT NOT NULL DEFAULT 'LEGADO',
    "removed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vestige_requisicoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vestige_requisicoes_vestige_id_idx" ON "vestige_requisicoes"("vestige_id");

-- CreateIndex
CREATE INDEX "vestige_requisicoes_numero_idx" ON "vestige_requisicoes"("numero");

-- AddForeignKey
ALTER TABLE "vestige_requisicoes" ADD CONSTRAINT "vestige_requisicoes_vestige_id_fkey" FOREIGN KEY ("vestige_id") REFERENCES "vestiges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: copia a requisição de cada vestígio (inclusive os excluídos logicamente) para a
-- nova tabela, com motivo LEGADO. O valor vai como está — nada é separado, corrigido ou inventado.
-- A coluna "vestiges"."requisicao" NÃO é removida aqui: fica congelada como cópia de segurança
-- até a conferência abaixo ser feita em produção. A remoção vem numa migration futura.
INSERT INTO "vestige_requisicoes" ("vestige_id", "numero", "motivo", "created_at")
SELECT "id", TRIM("requisicao"), 'LEGADO', COALESCE("created_at", CURRENT_TIMESTAMP)
FROM "vestiges"
WHERE "requisicao" IS NOT NULL AND TRIM("requisicao") <> '';

-- Conferência (somente leitura) — os dois números têm de ser iguais:
--   SELECT COUNT(*) FROM "vestiges" WHERE "requisicao" IS NOT NULL AND TRIM("requisicao") <> '';
--   SELECT COUNT(*) FROM "vestige_requisicoes" WHERE "motivo" = 'LEGADO';

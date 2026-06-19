-- CreateTable
CREATE TABLE "vestige_involucros" (
    "id" BIGSERIAL NOT NULL,
    "vestige_id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vestige_involucros_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vestige_involucros_vestige_id_idx" ON "vestige_involucros"("vestige_id");

-- CreateIndex
CREATE INDEX "vestige_involucros_numero_idx" ON "vestige_involucros"("numero");

-- AddForeignKey
ALTER TABLE "vestige_involucros" ADD CONSTRAINT "vestige_involucros_vestige_id_fkey" FOREIGN KEY ("vestige_id") REFERENCES "vestiges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: migra invólucros existentes (não-nulos e não-vazios) para a nova tabela.
-- Cada vestígio que já possui um número de invólucro recebe sua primeira linha aqui,
-- preservando o dado da cadeia de custódia antes de a coluna antiga ser removida (migration seguinte).
INSERT INTO "vestige_involucros" ("vestige_id", "numero", "created_at")
SELECT "id", TRIM("involucro"), COALESCE("created_at", CURRENT_TIMESTAMP)
FROM "vestiges"
WHERE "involucro" IS NOT NULL AND TRIM("involucro") <> '';

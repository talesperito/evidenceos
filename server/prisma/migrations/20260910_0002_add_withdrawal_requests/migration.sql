-- Solicitações de retirada de vestígios.
-- Desenho: docs/plans/2026-08-25-solicitacao-retirada.md (Partes 3.4 e 3.5).
-- Migration puramente aditiva: nenhuma tabela ou coluna existente é alterada, sem backfill.

-- CreateTable
CREATE TABLE "withdrawal_requests" (
    "id" TEXT NOT NULL,
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SOLICITADA',
    "notes" TEXT,
    "deadline_override_reason" TEXT,
    "requested_by" TEXT NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status_changed_by" TEXT,
    "status_changed_at" TIMESTAMP(3),
    "status_note" TEXT,

    CONSTRAINT "withdrawal_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawal_request_items" (
    "id" BIGSERIAL NOT NULL,
    "request_id" TEXT NOT NULL,
    "vestige_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "reason_detail" TEXT,

    CONSTRAINT "withdrawal_request_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "withdrawal_requests_scheduled_for_idx" ON "withdrawal_requests"("scheduled_for");

-- CreateIndex
CREATE INDEX "withdrawal_requests_status_idx" ON "withdrawal_requests"("status");

-- CreateIndex
CREATE INDEX "withdrawal_request_items_request_id_idx" ON "withdrawal_request_items"("request_id");

-- CreateIndex
CREATE INDEX "withdrawal_request_items_vestige_id_idx" ON "withdrawal_request_items"("vestige_id");

-- AddForeignKey
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_status_changed_by_fkey" FOREIGN KEY ("status_changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_request_items" ADD CONSTRAINT "withdrawal_request_items_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "withdrawal_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_request_items" ADD CONSTRAINT "withdrawal_request_items_vestige_id_fkey" FOREIGN KEY ("vestige_id") REFERENCES "vestiges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

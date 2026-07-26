-- CreateTable
CREATE TABLE "pcnet_action_logs" (
    "id" BIGSERIAL NOT NULL,
    "vestige_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SOLICITADO',
    "pcnet_identifier" TEXT NOT NULL,
    "requested_by" TEXT NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pcnet_action_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pcnet_action_logs_vestige_id_idx" ON "pcnet_action_logs"("vestige_id");

-- AddForeignKey
ALTER TABLE "pcnet_action_logs" ADD CONSTRAINT "pcnet_action_logs_vestige_id_fkey" FOREIGN KEY ("vestige_id") REFERENCES "vestiges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pcnet_action_logs" ADD CONSTRAINT "pcnet_action_logs_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

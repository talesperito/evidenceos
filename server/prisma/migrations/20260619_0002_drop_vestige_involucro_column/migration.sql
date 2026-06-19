-- Remove a coluna legada `involucro` da tabela `vestiges`.
-- Os dados já foram migrados para `vestige_involucros` na migration 0001 (backfill validado: 4602 = 4602).
-- A partir daqui a fonte única da verdade para invólucros é a tabela `vestige_involucros`.
ALTER TABLE "vestiges" DROP COLUMN "involucro";

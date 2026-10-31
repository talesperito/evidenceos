import path from 'node:path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

const parsedUrl = new URL(connectionString);
const schema = parsedUrl.searchParams.get('schema') || 'public';

// Limites para o banco responder com erro em vez de deixar a requisição presa: sem eles o pool
// tem fila sem fim e uma consulta lenta segura a conexão indefinidamente. A transação ociosa
// precisa ficar acima dos 30 s de CUSTODY_TX_OPTIONS, senão derrubaria uma retirada grande.
const pool = new Pool({
  connectionString,
  options: `-c search_path=${schema}`,
  max: 15,
  connectionTimeoutMillis: 10_000,
  statement_timeout: 30_000,
  lock_timeout: 10_000,
  idle_in_transaction_session_timeout: 60_000,
});

const adapter = new PrismaPg(pool, { schema });
const prisma = new PrismaClient({ adapter });

export { pool, prisma, schema };

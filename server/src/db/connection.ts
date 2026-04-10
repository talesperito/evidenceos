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

const pool = new Pool({
  connectionString,
  options: `-c search_path=${schema}`,
});

const adapter = new PrismaPg(pool, { schema });
const prisma = new PrismaClient({ adapter });

export { pool, prisma, schema };

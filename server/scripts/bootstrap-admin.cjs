const { randomUUID } = require('node:crypto');
const path = require('node:path');
const dotenv = require('dotenv');
const { Client } = require('pg');
const argon2 = require('argon2');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('[bootstrap-admin] DATABASE_URL nao definido em server/.env');
  process.exit(1);
}

const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
const name = process.env.BOOTSTRAP_ADMIN_NAME || 'Administrador';
const role = process.env.BOOTSTRAP_ADMIN_ROLE || 'ADMIN';

if (!email || !password) {
  console.error('[bootstrap-admin] ERRO: As variáveis de ambiente BOOTSTRAP_ADMIN_EMAIL e BOOTSTRAP_ADMIN_PASSWORD são obrigatórias.');
  console.error('[bootstrap-admin] Exemplo de uso:');
  console.error('  BOOTSTRAP_ADMIN_EMAIL=admin@exemplo.com BOOTSTRAP_ADMIN_PASSWORD=SenhaForte123 npm run bootstrap:admin');
  process.exit(1);
}

async function main() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  const passwordHash = await argon2.hash(password);
  const id = randomUUID();

  await client.query(
    `
      INSERT INTO users (id, name, email, password_hash, role, active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
      ON CONFLICT (email)
      DO UPDATE SET
        name = EXCLUDED.name,
        password_hash = EXCLUDED.password_hash,
        role = EXCLUDED.role,
        active = true,
        updated_at = NOW()
    `,
    [id, name, email, passwordHash, role]
  );

  await client.end();

  console.log('[bootstrap-admin] Usuario admin pronto:');
  console.log(`  email: ${email}`);
  console.log(`  senha: ${password}`);
}

main().catch((err) => {
  console.error('[bootstrap-admin] Falha:', err.message);
  process.exit(1);
});

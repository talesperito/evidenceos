/**
 * Mede quantos vestígios a listagem paginada deixa de entregar — por categoria.
 *
 * CONTEXTO (incidente de 2026-09-29, ver docs/plans/2026-09-29-busca-paginacao-e-duplicatas.md)
 * A tela baixa todos os vestígios em páginas de 500 e busca no navegador. O servidor ordenava
 * só por `created_at`, e a importação gravou blocos inteiros com o MESMO `created_at`. Com
 * empate, o PostgreSQL não garante a mesma ordem entre páginas: uma página repetia itens da
 * anterior e pulava outros. O total batia (cada item pulado era trocado por um repetido), mas
 * vestígios existentes sumiam da busca e do relatório, sem erro nenhum.
 *
 * Este script refaz a paginação das duas formas — a antiga (só `created_at`) e a atual
 * (`created_at` + `id`) — e conta os IDs que nunca aparecem. Depois da correção (commit
 * 150f3af), a coluna `invisiveis_agora` tem que ser 0 em todas as categorias.
 *
 * SÓ LEITURA: a sessão abre com `default_transaction_read_only = on`; o PostgreSQL recusa
 * qualquer escrita mesmo que o código tivesse uma.
 *
 * Uso (console do serviço `api` no Easypanel, ou local):
 *   node scripts/verificar-paginacao.cjs
 */

require('dotenv/config');
const { Client } = require('pg');

const TAMANHO_PAGINA = 500; // o mesmo de fetchAllVestiges (client/services/dataService.ts)

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    await c.query('SET default_transaction_read_only = on');

    const ATIVOS = 'FROM vestiges v WHERE v.deleted_at IS NULL';
    const total = (await c.query(`SELECT count(*)::int n ${ATIVOS}`)).rows[0].n;

    const paginar = async (ordem) => {
      const vistos = new Set();
      for (let offset = 0; offset < total; offset += TAMANHO_PAGINA) {
        const { rows } = await c.query(`SELECT v.id ${ATIVOS} ORDER BY ${ordem} LIMIT ${TAMANHO_PAGINA} OFFSET ${offset}`);
        rows.forEach((r) => vistos.add(r.id));
      }
      return vistos;
    };
    const antes = await paginar('v.created_at DESC');
    const agora = await paginar('v.created_at DESC, v.id ASC');

    const todos = (await c.query(`
      SELECT v.id, v.registro_fav fav, k.name cat,
        (SELECT count(*) FROM vestiges x WHERE x.deleted_at IS NULL AND x.created_at = v.created_at)::int mesmo_horario
      FROM vestiges v JOIN vestige_categories k ON k.id = v.category_id
      WHERE v.deleted_at IS NULL`)).rows;

    const porCategoria = {};
    for (const v of todos) {
      const r = porCategoria[v.cat] ??= { vestigios: 0, em_empate: 0, invisiveis_antes: 0, invisiveis_agora: 0, favs: [] };
      r.vestigios += 1;
      if (v.mesmo_horario > 1) r.em_empate += 1;
      if (!antes.has(v.id)) { r.invisiveis_antes += 1; r.favs.push(v.fav || '(sem FAV)'); }
      if (!agora.has(v.id)) r.invisiveis_agora += 1;
    }

    const linhas = Object.entries(porCategoria).sort((a, b) => b[1].vestigios - a[1].vestigios);
    console.table(Object.fromEntries(linhas.map(([cat, { favs, ...r }]) => [cat, r])));
    console.log(`TOTAL ${total} | invisíveis com a ordem antiga: ${total - antes.size} | com a ordem atual: ${total - agora.size}`);
    console.log('\n"invisiveis_antes" é uma estimativa com os dados de hoje: o conjunto exato variava de consulta para consulta.');
    for (const [cat, r] of linhas) if (r.favs.length) console.log(`${cat}: ${r.favs.join(' ')}`);

    if (total - agora.size > 0) {
      console.error('\n❌ A ordem atual ainda deixa vestígios de fora — a correção não está em vigor neste banco/código.');
      process.exitCode = 1;
    }
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error('ERRO:', e.message);
  process.exit(1);
});

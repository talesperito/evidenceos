/**
 * Exclui os cadastros em dobro (duplo clique): mesmo vestígio gravado duas ou mais vezes.
 * Desenho: docs/plans/2026-11-17-leitura-fav-reds-pje-design.md (seção 7.3).
 *
 * Detecta NA HORA, no banco em que roda (não usa backup nem arquivo). Um grupo só é tratado se:
 * - os vestígios têm a mesma FAV, a mesma categoria e os mesmos invólucros ativos;
 * - são idênticos em material, tipo, município, data de coleta, observações, destinação, estado de
 *   conservação, REDS, PJe e requisições ativas;
 * - foram criados com menos de 5 minutos de diferença;
 * - no máximo um deles tem histórico (destinação, retirada ou ação no PCNET).
 * Grupo que não passa em tudo isso é só listado, para conferência pela tela.
 *
 * Fica o vestígio que tem histórico; se nenhum tiver, o cadastrado primeiro. Os outros recebem a MESMA
 * exclusão da tela (deletedAt + updatedBy) e auditoria DELETE com o motivo e o id do que ficou.
 * Uma transação por grupo.
 *
 * Sem --confirmar, NÃO escreve nada.
 *
 * Uso (no console do `api`, em /app):
 *   node scripts/excluir-duplicatas-fav.cjs                                   # diagnóstico
 *   OPERADOR_EMAIL=voce@exemplo.com node scripts/excluir-duplicatas-fav.cjs --confirmar
 */
const {
  createDbClients, TX_OPTIONS, linha, exigirLavras, exigirOperador, semZeros,
} = require('./_reds-pje-common.cjs');

const JANELA_MS = 5 * 60 * 1000;
const MOTIVO = 'Cadastro em dobro: vestígio idêntico a outro com a mesma FAV, categoria e invólucro';

const numeros = (itens) => itens.map((i) => i.numero.trim()).sort().join('|');
const assinatura = (v) => JSON.stringify([
  v.material, v.tipoMaterial, v.municipio, v.dataColeta?.toISOString() ?? null, v.observacoes,
  v.destinacao, v.estadoConservacao, v.numeroReds, v.numeroPje, numeros(v.requisicoes),
]);
const temHistorico = (v) => v._count.destinationLogs + v._count.withdrawalItems + v._count.pcnetActionLogs > 0;

async function main() {
  exigirLavras();
  const confirmado = process.argv.includes('--confirmar');
  const { pool, prisma, schema } = createDbClients();

  try {
    const operador = confirmado ? await exigirOperador(prisma) : null;
    const ativos = { where: { removedAt: null }, select: { numero: true } };
    const vestigios = await prisma.vestige.findMany({
      where: { deletedAt: null, registroFav: { not: null } },
      select: {
        id: true, registroFav: true, categoryId: true, material: true, tipoMaterial: true, municipio: true,
        dataColeta: true, observacoes: true, destinacao: true, estadoConservacao: true,
        numeroReds: true, numeroPje: true, createdAt: true,
        involucros: ativos, requisicoes: ativos,
        _count: { select: { destinationLogs: true, withdrawalItems: true, pcnetActionLogs: true } },
      },
    });

    const grupos = new Map();
    for (const v of vestigios) {
      const fav = semZeros(v.registroFav);
      if (!/^\d+$/.test(fav)) continue;
      const chave = `${fav}#${v.categoryId}#${numeros(v.involucros)}`;
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave).push(v);
    }

    const aExcluir = [];
    const naoTratados = [];
    for (const lista of grupos.values()) {
      if (lista.length < 2) continue;
      lista.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
      const motivos = [];
      if (new Set(lista.map(assinatura)).size > 1) motivos.push('dados diferentes');
      if (lista[lista.length - 1].createdAt - lista[0].createdAt >= JANELA_MS) motivos.push('criados com mais de 5 min de diferença');
      const comHistorico = lista.filter(temHistorico);
      if (comHistorico.length > 1) motivos.push('mais de um com histórico');
      if (motivos.length) {
        naoTratados.push({ fav: lista[0].registroFav, n: lista.length, motivos });
        continue;
      }
      const fica = comHistorico[0] || lista[0];
      aExcluir.push({ fica, saem: lista.filter((v) => v.id !== fica.id) });
    }

    console.log(`\n${linha('═')}`);
    console.log(confirmado ? 'CADASTRO EM DOBRO — EXCLUINDO' : 'CADASTRO EM DOBRO — DIAGNÓSTICO (nada foi alterado)');
    console.log(linha('═'));
    console.log(`Banco (schema)                 : ${schema}`);
    console.log(`Grupos idênticos (tratados)    : ${aExcluir.length}`);
    console.log(`Vestígios a excluir            : ${aExcluir.reduce((s, g) => s + g.saem.length, 0)}`);
    console.log(`Grupos que diferem (só listados): ${naoTratados.length}`);
    console.log(linha('═'));
    for (const g of aExcluir) {
      console.log(`  FAV ${String(g.fica.registroFav).padEnd(9)} fica ${g.fica.id}  sai ${g.saem.map((v) => v.id).join(', ')}`);
    }
    if (naoTratados.length) {
      console.log('\nNÃO TRATADOS (conferir pela tela):');
      for (const g of naoTratados) console.log(`  FAV ${String(g.fav).padEnd(9)} ${g.n} vestígios — ${g.motivos.join('; ')}`);
    }

    if (!confirmado) {
      console.log('\nPara excluir:');
      console.log('  OPERADOR_EMAIL=voce@exemplo.com node scripts/excluir-duplicatas-fav.cjs --confirmar\n');
      return;
    }

    let excluidos = 0;
    for (const g of aExcluir) {
      await prisma.$transaction(async (tx) => {
        for (const v of g.saem) {
          // Revalida dentro da transação: só exclui se ainda estiver ativo.
          const { count } = await tx.vestige.updateMany({
            where: { id: v.id, deletedAt: null },
            data: { deletedAt: new Date(), updatedBy: operador.id },
          });
          if (count !== 1) throw new Error(`vestígio ${v.id} mudou durante a execução; grupo não alterado`);
          await tx.auditLog.create({
            data: {
              userId: operador.id,
              userEmail: operador.email,
              userName: operador.name,
              action: 'DELETE',
              targetType: 'vestige',
              targetId: v.id,
              details: { material: v.material, registroFav: v.registroFav, motivo: MOTIVO, mantido: g.fica.id },
            },
          });
          excluidos += 1;
        }
      }, TX_OPTIONS);
    }
    console.log(`\n✅ Excluídos: ${excluidos} (exclusão lógica, auditoria DELETE com o motivo).\n`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('\n❌ ERRO:', error.message);
  console.error('   O grupo em que o erro ocorreu não foi alterado (uma transação por grupo).\n');
  process.exit(1);
});

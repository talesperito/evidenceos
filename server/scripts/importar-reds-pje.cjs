/**
 * Grava o Nº REDS e o Nº PJe lidos das FAVs no PCNET (etapa E).
 * Desenho: docs/plans/2026-11-17-leitura-fav-reds-pje-design.md (seção 7.2).
 *
 * Entrada: importacao-reds-pje.json, gerado no PC por scripts/pcnet-gerar-importacao.py a partir da
 * planilha CONFERIDA pelo usuário. Cada item: { id, fav, reds, pje }.
 *
 * Regras:
 * - o vestígio é localizado pelo id E a FAV tem de continuar igual à do backup; se foi excluído ou a
 *   FAV mudou, a linha é pulada e listada;
 * - só preenche, nunca troca: REDS e PJe são gravados só se o campo estiver vazio; valor diferente já
 *   gravado (pela tela) vira conflito listado, não é sobrescrito;
 * - uma transação por vestígio, com a auditoria IMPORT_FAV_PCNET dentro dela;
 * - pode rodar de novo: o que já está gravado é reconhecido e pulado.
 *
 * Sem --confirmar, NÃO escreve nada.
 *
 * Uso (no console do `api`, em /app):
 *   node scripts/importar-reds-pje.cjs <arquivo.json>                         # diagnóstico
 *   OPERADOR_EMAIL=voce@exemplo.com node scripts/importar-reds-pje.cjs <arquivo.json> --confirmar
 */
const {
  createDbClients, TX_OPTIONS, linha, exigirLavras, lerArquivo, exigirOperador, mesmaFav,
} = require('./_reds-pje-common.cjs');

const REDS = /^\d{4}-\d{9}-\d{3}$/;
const PJE = /^\d{20}$/;

async function main() {
  exigirLavras();
  const confirmado = process.argv.includes('--confirmar');
  const caminho = process.argv.slice(2).find((a) => !a.startsWith('--'));
  const { dados, sha } = lerArquivo(caminho, 'reds-pje');
  const { pool, prisma, schema } = createDbClients();

  try {
    const operador = confirmado ? await exigirOperador(prisma) : null;
    const total = {
      gravados: 0, jaExistentes: 0, conflitos: [], pulados: [], invalidos: [],
    };
    const origem = `FAV lida no PCNET (${dados.origem}, gerado em ${dados.gerado_em})`;

    for (const item of dados.itens) {
      if (!REDS.test(item.reds || '') || (item.pje && !PJE.test(item.pje))) {
        total.invalidos.push(item);
        continue;
      }
      const atual = await prisma.vestige.findUnique({
        where: { id: item.id },
        select: { id: true, registroFav: true, deletedAt: true, numeroReds: true, numeroPje: true },
      });
      if (!atual || atual.deletedAt) {
        total.pulados.push({ ...item, motivo: 'vestígio excluído ou inexistente' });
        continue;
      }
      if (!mesmaFav(atual.registroFav, item.fav)) {
        total.pulados.push({ ...item, motivo: `FAV mudou desde o backup (hoje: ${atual.registroFav || 'vazia'})` });
        continue;
      }

      const dadosNovos = {};
      const conflitoItem = [];
      if (!atual.numeroReds) dadosNovos.numeroReds = item.reds;
      else if (atual.numeroReds !== item.reds) conflitoItem.push(`REDS gravado ${atual.numeroReds} ≠ FAV ${item.reds}`);
      if (item.pje) {
        if (!atual.numeroPje) dadosNovos.numeroPje = item.pje;
        else if (atual.numeroPje !== item.pje) conflitoItem.push(`PJe gravado ${atual.numeroPje} ≠ FAV ${item.pje}`);
      }
      if (conflitoItem.length) total.conflitos.push({ ...item, motivo: conflitoItem.join('; ') });
      if (Object.keys(dadosNovos).length === 0) {
        if (!conflitoItem.length) total.jaExistentes += 1;
        continue;
      }

      if (confirmado) {
        await prisma.$transaction(async (tx) => {
          await tx.vestige.update({ where: { id: item.id }, data: { ...dadosNovos, updatedBy: operador.id } });
          await tx.auditLog.create({
            data: {
              userId: operador.id,
              userEmail: operador.email,
              userName: operador.name,
              action: 'IMPORT_FAV_PCNET',
              targetType: 'vestige',
              targetId: item.id,
              details: {
                registroFav: atual.registroFav,
                numeroReds: dadosNovos.numeroReds ? { antes: null, depois: dadosNovos.numeroReds } : undefined,
                numeroPje: dadosNovos.numeroPje ? { antes: null, depois: dadosNovos.numeroPje } : undefined,
                origem,
                arquivoSha256: sha,
              },
            },
          });
        }, TX_OPTIONS);
      }
      total.gravados += 1;
    }

    console.log(`\n${linha('═')}`);
    console.log(confirmado ? 'IMPORTAÇÃO DE REDS E PJe — GRAVADO' : 'IMPORTAÇÃO DE REDS E PJe — DIAGNÓSTICO (nada foi gravado)');
    console.log(linha('═'));
    console.log(`Banco (schema)        : ${schema}`);
    console.log(`Arquivo SHA-256       : ${sha}`);
    console.log(`Itens no arquivo      : ${dados.itens.length}`);
    console.log(linha('-'));
    console.log(`${confirmado ? 'Gravados' : 'A gravar'}              : ${total.gravados}`);
    console.log(`Já estavam gravados   : ${total.jaExistentes}`);
    console.log(`Conflitos (não trocados): ${total.conflitos.length}`);
    console.log(`Pulados               : ${total.pulados.length}`);
    console.log(`Inválidos no arquivo  : ${total.invalidos.length}`);
    console.log(linha('═'));
    for (const [titulo, lista] of [['CONFLITOS', total.conflitos], ['PULADOS', total.pulados]]) {
      if (!lista.length) continue;
      console.log(`\n${titulo}:`);
      for (const p of lista) console.log(`  FAV ${String(p.fav).padEnd(9)} ${p.id}  ${p.motivo}`);
    }

    // Todos os vestígios de Lavras ainda sem REDS: pega também os cadastrados depois do backup.
    const semReds = await prisma.vestige.findMany({
      where: { deletedAt: null, numeroReds: null },
      select: { id: true, registroFav: true, category: { select: { name: true } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    console.log(`\nVESTÍGIOS SEM REDS NO BANCO${confirmado ? '' : ' (antes desta gravação)'}: ${semReds.length}`);
    if (process.argv.includes('--listar-sem-reds')) {
      for (const v of semReds) console.log(`  ${v.id}  FAV ${v.registroFav || '(vazia)'}  ${v.category?.name || ''}`);
    } else {
      console.log('  (para listar um por um: acrescente --listar-sem-reds)');
    }
    if (!confirmado) {
      console.log('\nPara gravar:');
      console.log(`  OPERADOR_EMAIL=voce@exemplo.com node scripts/importar-reds-pje.cjs ${caminho} --confirmar\n`);
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('\n❌ ERRO:', error.message);
  console.error('   O vestígio em que o erro ocorreu não foi alterado (uma transação por vestígio).');
  console.error('   Os anteriores já gravados continuam gravados: rode de novo, eles serão reconhecidos.\n');
  process.exit(1);
});

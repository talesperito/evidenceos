/**
 * Normaliza a grafia do município dos vestígios.
 *
 * O município veio da planilha como texto livre, então a mesma cidade aparece
 * escrita de várias formas. Efeito prático: quem filtra pela grafia oficial não
 * encontra os registros escritos de outro jeito — eles somem da busca sem erro
 * nenhum.
 *
 * Sem argumentos, NÃO escreve nada: só relata o que mudaria.
 *
 * Uso:
 *   node scripts/normalizar-municipios.cjs                      # diagnóstico
 *   OPERADOR_EMAIL=voce@exemplo.com \
 *     node scripts/normalizar-municipios.cjs --confirmar        # aplica
 */

const { createDbClients } = require('./_phase2-common.cjs');

/**
 * Mapa EXPLÍCITO de correções. Deliberadamente não há heurística, fuzzy match
 * nem normalização automática de acento: cada troca foi conferida uma a uma
 * contra os dados reais. Um algoritmo de similaridade acertaria a maioria e
 * erraria em silêncio no resto — e aqui o dado errado é de procedimento
 * policial, não de cadastro de loja.
 *
 * Para incluir uma grafia nova, adicione a linha. Nada fora deste mapa é tocado.
 */
const CORRECOES = {
  // Santo Antônio do Amparo — 9 variantes
  'S Antônio/Am': 'Santo Antônio do Amparo',
  'Santo Antônio do Âmparo': 'Santo Antônio do Amparo',
  'St. Antônio/Am': 'Santo Antônio do Amparo',
  'Santo Antonio do Amparo': 'Santo Antônio do Amparo',
  'Santo Antônio/Amp': 'Santo Antônio do Amparo',
  'S Antônio/Amo': 'Santo Antônio do Amparo',
  'S Antônio/ Am': 'Santo Antônio do Amparo',
  's Antônio/Am': 'Santo Antônio do Amparo',
  'S A/Amparo': 'Santo Antônio do Amparo',
  // Outras
  'Ribeirão Ver': 'Ribeirão Vermelho',
  'Luminarias': 'Luminárias',
  'Pedões': 'Perdões',
  ':Bom Sucesso': 'Bom Sucesso',
};

function linha(char = '─', n = 78) {
  return char.repeat(n);
}

async function main() {
  const confirmado = process.argv.includes('--confirmar');
  const operadorEmail = process.env.OPERADOR_EMAIL;
  const operadorNome = process.env.OPERADOR_NOME || operadorEmail;

  const { pool, prisma, schema } = createDbClients();

  try {
    // Levanta o estado real do banco antes de propor qualquer coisa: a planilha
    // é a origem provável das grafias, mas quem manda aqui é o que está gravado.
    const grupos = await prisma.vestige.groupBy({
      by: ['municipio'],
      where: { deletedAt: null },
      _count: { municipio: true },
    });

    const porGrafia = new Map(grupos.map((g) => [g.municipio, g._count.municipio]));

    const aCorrigir = [];
    let totalLinhas = 0;
    for (const [errada, certa] of Object.entries(CORRECOES)) {
      const qtd = porGrafia.get(errada);
      if (qtd) {
        aCorrigir.push({ errada, certa, qtd });
        totalLinhas += qtd;
      }
    }

    // Grafias numéricas são OUTRO problema (aba "Munições" com colunas
    // desalinhadas) e exigem decisão própria. Este script não as toca.
    const numericas = grupos.filter((g) => /^[0-9]+$/.test(String(g.municipio || '').trim()));
    const qtdNumericas = numericas.reduce((t, g) => t + g._count.municipio, 0);

    console.log(`\n${linha('═')}`);
    console.log(confirmado ? 'NORMALIZAÇÃO DE MUNICÍPIOS — APLICANDO' : 'NORMALIZAÇÃO DE MUNICÍPIOS — DIAGNÓSTICO (nada será alterado)');
    console.log(linha('═'));
    console.log(`Banco (schema)      : ${schema}`);
    console.log(`Grafias distintas   : ${grupos.length}`);
    console.log(linha('-'));

    if (!aCorrigir.length) {
      console.log('Nenhuma grafia conhecida a corrigir — banco já está normalizado.');
    } else {
      console.log('DE'.padEnd(30) + 'PARA'.padEnd(28) + 'VESTÍGIOS');
      console.log(linha('-'));
      for (const c of aCorrigir) {
        console.log(`${c.errada.padEnd(30)}${c.certa.padEnd(28)}${c.qtd}`);
      }
      console.log(linha('-'));
      console.log(`TOTAL a corrigir    : ${totalLinhas} vestígio(s)`);
    }

    if (qtdNumericas) {
      console.log(`\n⚠ ${qtdNumericas} vestígio(s) têm município NUMÉRICO (${numericas.length} valores distintos).`);
      console.log('  Vêm da aba "Munições", cujas colunas estão desalinhadas na origem.');
      console.log('  Este script NÃO os altera — exigem decisão separada.');
    }

    console.log(linha('═'));

    if (!aCorrigir.length) return;

    if (!confirmado) {
      console.log('\nEste foi o diagnóstico. Para aplicar:');
      console.log('  OPERADOR_EMAIL=voce@exemplo.com node scripts/normalizar-municipios.cjs --confirmar\n');
      return;
    }

    // A auditoria não pode ficar anônima: o script roda por linha de comando,
    // logo não existe usuário logado a quem atribuir a operação.
    if (!operadorEmail) {
      console.error('\n❌ Defina OPERADOR_EMAIL — a auditoria não pode ficar anônima.\n');
      process.exit(1);
    }

    const resultado = await prisma.$transaction(async (tx) => {
      const aplicados = [];
      for (const c of aCorrigir) {
        const r = await tx.vestige.updateMany({
          where: { municipio: c.errada, deletedAt: null },
          data: { municipio: c.certa },
        });
        aplicados.push({ de: c.errada, para: c.certa, alterados: r.count });
      }

      // `updatedBy` fica intacto de propósito: isto é correção sistêmica de
      // grafia, não edição de conteúdo por um operador. Sobrescrever apagaria
      // a autoria real do vestígio. O rastro da operação vive no AuditLog.
      await tx.auditLog.create({
        data: {
          userEmail: operadorEmail,
          userName: operadorNome,
          action: 'NORMALIZE_MUNICIPIO',
          targetType: 'vestige',
          details: {
            schema,
            totalAlterados: aplicados.reduce((t, a) => t + a.alterados, 0),
            correcoes: aplicados,
            municipiosNumericosIntocados: qtdNumericas,
          },
        },
      });

      return aplicados;
    }, { maxWait: 30_000, timeout: 120_000 });

    const total = resultado.reduce((t, a) => t + a.alterados, 0);

    console.log(`\n${linha('═')}`);
    console.log('✅ NORMALIZAÇÃO APLICADA');
    console.log(linha('═'));
    for (const a of resultado) {
      console.log(`${String(a.alterados).padStart(4)}  ${a.de}  →  ${a.para}`);
    }
    console.log(linha('-'));
    console.log(`Total alterado      : ${total} vestígio(s)`);
    console.log('Registrado em AuditLog com action=NORMALIZE_MUNICIPIO.');
    console.log(linha('═'));
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('\n❌ ERRO:', error.message);
  console.error('   A transação foi revertida — o banco NÃO foi alterado.');
  process.exit(1);
});

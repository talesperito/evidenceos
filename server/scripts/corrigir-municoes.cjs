/**
 * Corrige os 403 vestígios da aba "Munições", cujas colunas vieram deslocadas.
 *
 * O PROBLEMA
 * A aba "Munições" da planilha tem uma coluna a mais que as outras 28 — a que
 * traz a natureza da munição ("Deflagradas", "Intactas", "Necrópsia"). O Apps
 * Script lê as colunas por posição, então essa coluna extra empurrou todo o
 * resto uma casa. Resultado: cada campo do vestígio recebeu o valor do campo
 * seguinte.
 *
 * A prova está no campo de data: em 370 das 403 linhas ele contém o nome de um
 * município ("Lavras", "Bom Sucesso", "Perdões"...). Data não guarda cidade.
 *
 * COMO ESTÁ NO BANCO E COMO DEVE FICAR
 *
 *   registroFav   2954532 (é o invólucro)   →  272963 (a FAV de verdade)
 *   invólucro     42406095 (é a requisição) →  2954532
 *   requisicao    "Necrópsia" (é a natureza)→  42406095, ou vazio
 *   tipoMaterial  vazio                     →  "Necrópsia"
 *   municipio     272963 (é a FAV)          →  vem da planilha
 *
 * O invólucro correto já está no banco: é o que hoje ocupa o campo FAV. Só o
 * município precisa ser buscado no snapshot, porque caiu no campo de data — que
 * é do tipo DateTime e rejeitou o texto, gravando nulo.
 *
 * SOBRE A CONFIABILIDADE DO CONTEÚDO
 * A rotação de colunas é certa e vale para as 403. O conteúdo de cada linha,
 * não: o usuário conferiu 3 FAVs no PCNET em 2026-09-10 e 2 divergiam da
 * planilha. Essas 3 estão em CORRECOES_PCNET e sobrescrevem o snapshot. As
 * demais seguem a planilha e ficam marcadas na observação como pendentes de
 * conferência — para que uma auditoria futura saiba no que confiar.
 *
 * Sem argumentos, NÃO escreve nada.
 *
 * Uso:
 *   node scripts/corrigir-municoes.cjs                     # diagnóstico
 *   OPERADOR_EMAIL=voce@exemplo.com \
 *     node scripts/corrigir-municoes.cjs --confirmar       # aplica
 */

const fs = require('fs');
const { createDbClients } = require('./_phase2-common.cjs');
const { LATEST_SNAPSHOT_PATH, norm } = require('./_sync-common.cjs');

/**
 * Dados conferidos pelo usuário DIRETO NO PCNET em 2026-09-10.
 * Têm precedência sobre a planilha. Chave: o invólucro (que hoje está gravado
 * no campo registroFav do banco).
 */
const CORRECOES_PCNET = {
  '2954561': { fav: '371709', requisicao: '043380235' },
  '2954545': { fav: '344114', requisicao: null },
  '2954532': { fav: '272963', requisicao: null },
};

/** Grafias divergentes da natureza e do município, conferidas uma a uma. */
const NATUREZA = {
  'Intacta': 'Intactas', 'intactas': 'Intactas', 'Intacto': 'Intactas',
  'Deflagadas': 'Deflagradas', 'Deflagrada': 'Deflagradas',
};
const MUNICIPIO = { 'ijaci': 'Ijaci' };

// Quando a planilha não informa o município. Decisão do usuário em 2026-09-10.
const MUNICIPIO_PADRAO = 'N/I';

function linha(char = '─', n = 78) { return char.repeat(n); }

async function main() {
  const confirmado = process.argv.includes('--confirmar');
  const operadorEmail = process.env.OPERADOR_EMAIL;
  const operadorNome = process.env.OPERADOR_NOME || operadorEmail;

  if (!fs.existsSync(LATEST_SNAPSHOT_PATH)) {
    console.error(`\n❌ Snapshot não encontrado em ${LATEST_SNAPSHOT_PATH}`);
    console.error('   Rode antes: node scripts/sync-dryrun.cjs\n');
    process.exit(1);
  }

  const snapshot = JSON.parse(fs.readFileSync(LATEST_SNAPSHOT_PATH, 'utf8'));
  const linhasMunicoes = snapshot.items.filter((i) => norm(i.planilhaOrigem) === 'Munições');

  // Indexa a planilha pelo invólucro real (campo `fav` do snapshot), que é o
  // valor hoje gravado como registroFav no banco — a ponte entre os dois lados.
  const porInvolucro = new Map();
  for (const item of linhasMunicoes) {
    const inv = norm(item.fav);
    if (!inv) continue;
    if (!porInvolucro.has(inv)) porInvolucro.set(inv, []);
    porInvolucro.get(inv).push(item);
  }

  const { pool, prisma, schema } = createDbClients();

  try {
    // Alvo: vestígios cujo município é numérico. É a assinatura inconfundível do
    // deslocamento — nenhum vestígio correto tem número no lugar da cidade.
    const candidatos = await prisma.vestige.findMany({
      where: { deletedAt: null },
      select: {
        id: true, registroFav: true, requisicao: true, material: true,
        municipio: true, tipoMaterial: true,
        category: { select: { name: true } },
        involucros: { select: { id: true, numero: true } },
      },
    });

    const afetados = candidatos.filter((v) => /^[0-9]+$/.test(String(v.municipio || '').trim()));

    const planos = [];
    const semCorrespondencia = [];
    const duplicados = [];

    for (const v of afetados) {
      const involucroReal = norm(v.registroFav);
      const linhasDaPlanilha = porInvolucro.get(involucroReal);

      if (!linhasDaPlanilha) { semCorrespondencia.push(v); continue; }
      if (linhasDaPlanilha.length > 1) duplicados.push({ vestige: v, linhas: linhasDaPlanilha });

      const item = linhasDaPlanilha[0];
      const pcnet = CORRECOES_PCNET[involucroReal];

      const favPlanilha = norm(item.municipio);
      const reqPlanilha = norm(item.involucro);
      const naturezaBruta = norm(item.requisicao);
      const municipioBruto = norm(item.data);

      const natureza = NATUREZA[naturezaBruta] || naturezaBruta || null;
      const municipio = MUNICIPIO[municipioBruto] || municipioBruto || MUNICIPIO_PADRAO;

      planos.push({
        vestige: v,
        involucroReal,
        fav: pcnet ? pcnet.fav : favPlanilha,
        requisicao: pcnet ? pcnet.requisicao : (reqPlanilha || null),
        tipoMaterial: natureza,
        municipio,
        fonte: pcnet ? 'PCNET' : 'planilha',
      });
    }

    const doPcnet = planos.filter((p) => p.fonte === 'PCNET');

    console.log(`\n${linha('═')}`);
    console.log(confirmado ? 'CORREÇÃO DA ABA MUNIÇÕES — APLICANDO' : 'CORREÇÃO DA ABA MUNIÇÕES — DIAGNÓSTICO (nada será alterado)');
    console.log(linha('═'));
    console.log(`Banco (schema)              : ${schema}`);
    console.log(`Linhas de Munições no snapshot : ${linhasMunicoes.length}`);
    console.log(`Vestígios com município numérico: ${afetados.length}`);
    console.log(linha('-'));
    console.log(`A corrigir                  : ${planos.length}`);
    console.log(`  ...com dado do PCNET      : ${doPcnet.length}  (conferidos pelo usuário)`);
    console.log(`  ...com dado da planilha   : ${planos.length - doPcnet.length}  (pendentes de conferência)`);
    console.log(`Sem correspondência         : ${semCorrespondencia.length}`);
    console.log(`Invólucro repetido na planilha : ${duplicados.length}`);
    console.log(linha('═'));

    if (semCorrespondencia.length) {
      console.log('\n⚠ Vestígios sem linha correspondente no snapshot (NÃO serão tocados):');
      for (const v of semCorrespondencia.slice(0, 10)) {
        console.log(`   FAV(atual) ${String(v.registroFav).padEnd(12)} ${v.material}`);
      }
      if (semCorrespondencia.length > 10) console.log(`   ... e mais ${semCorrespondencia.length - 10}`);
    }

    if (doPcnet.length) {
      console.log(`\n${linha('═')}`);
      console.log('CONFERIDOS NO PCNET — têm precedência sobre a planilha');
      console.log(linha('═'));
      for (const p of doPcnet) {
        console.log(`  FAV ${p.fav}  ·  invólucro ${p.involucroReal}  ·  requisição ${p.requisicao || '(vazia)'}`);
      }
    }

    console.log(`\n${linha('═')}`);
    console.log('AMOSTRA DA CORREÇÃO (10 primeiros)');
    console.log(linha('═'));
    for (const p of planos.slice(0, 10)) {
      console.log(`\n[${p.fonte}] vestígio ${p.vestige.id.slice(0, 8)}`);
      console.log(`   FAV        : ${p.vestige.registroFav}  →  ${p.fav}`);
      console.log(`   invólucro  : ${p.vestige.involucros.map((i) => i.numero).join(',') || '(nenhum)'}  →  ${p.involucroReal}`);
      console.log(`   requisição : ${p.vestige.requisicao || '(vazia)'}  →  ${p.requisicao || '(vazia)'}`);
      console.log(`   tipo       : ${p.vestige.tipoMaterial || '(vazio)'}  →  ${p.tipoMaterial || '(vazio)'}`);
      console.log(`   município  : ${p.vestige.municipio}  →  ${p.municipio}`);
    }

    console.log(`\n${linha('═')}`);

    if (!confirmado) {
      console.log('\nEste foi o diagnóstico. Para aplicar:');
      console.log('  OPERADOR_EMAIL=voce@exemplo.com node scripts/corrigir-municoes.cjs --confirmar\n');
      return;
    }

    if (!operadorEmail) {
      console.error('\n❌ Defina OPERADOR_EMAIL — a auditoria não pode ficar anônima.\n');
      process.exit(1);
    }

    const OBS_PLANILHA = 'Registro corrigido em 2026-09-10: a aba "Munições" da planilha tinha uma coluna a mais e o Apps Script deslocou todos os campos uma posição. FAV, invólucro, requisição, natureza e município foram realocados. Conteúdo proveniente da planilha — PENDENTE de conferência no PCNET.';
    const OBS_PCNET = 'Registro corrigido em 2026-09-10: a aba "Munições" da planilha tinha uma coluna a mais e o Apps Script deslocou todos os campos uma posição. FAV, invólucro e requisição CONFERIDOS DIRETO NO PCNET pelo usuário, com precedência sobre a planilha.';

    const resultado = await prisma.$transaction(async (tx) => {
      let corrigidos = 0;
      for (const p of planos) {
        await tx.vestige.update({
          where: { id: p.vestige.id },
          data: {
            registroFav: p.fav || null,
            requisicao: p.requisicao,
            tipoMaterial: p.tipoMaterial,
            municipio: p.municipio,
            observacoes: p.fonte === 'PCNET' ? OBS_PCNET : OBS_PLANILHA,
            // Não vieram da planilha de forma utilizável: passam a contar como
            // cadastro do sistema, protegidos da exclusão automática.
            importedFrom: 'manual',
            importedAt: null,
          },
        });

        // O invólucro gravado é a requisição deslocada: substituir, não somar.
        await tx.vestigeInvolucro.deleteMany({ where: { vestigeId: p.vestige.id } });
        await tx.vestigeInvolucro.create({
          data: { vestigeId: p.vestige.id, numero: p.involucroReal },
        });

        corrigidos += 1;
      }

      await tx.auditLog.create({
        data: {
          userEmail: operadorEmail,
          userName: operadorNome,
          action: 'FIX_MUNICOES_COLUNAS',
          targetType: 'vestige',
          details: {
            schema,
            motivo: 'Aba "Municoes" da planilha com coluna extra: Apps Script deslocou todos os campos uma posicao',
            corrigidos,
            comDadoDoPcnet: doPcnet.length,
            comDadoDaPlanilha: corrigidos - doPcnet.length,
            semCorrespondencia: semCorrespondencia.length,
            involucroRepetidoNaPlanilha: duplicados.length,
          },
        },
      });

      return corrigidos;
    }, { maxWait: 30_000, timeout: 300_000 });

    console.log(`\n${linha('═')}`);
    console.log('✅ CORREÇÃO APLICADA');
    console.log(linha('═'));
    console.log(`Corrigidos                  : ${resultado}`);
    console.log(`  com dado do PCNET         : ${doPcnet.length}`);
    console.log(`  com dado da planilha      : ${resultado - doPcnet.length}  (pendentes de conferência)`);
    console.log(linha('-'));
    console.log('Registrado em AuditLog com action=FIX_MUNICOES_COLUNAS.');
    console.log('Cada vestígio carrega na observação de onde veio o dado.');
    console.log(linha('═'));

    if (duplicados.length) {
      console.log(`\n⚠ ${duplicados.length} invólucro(s) aparecem em mais de uma linha da planilha.`);
      console.log('  Podem ter virado registros duplicados no banco. Confira e exclua pela tela:');
      for (const d of duplicados) console.log(`   invólucro ${d.vestige.registroFav} → ${d.linhas.length} linhas na planilha`);
    }
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

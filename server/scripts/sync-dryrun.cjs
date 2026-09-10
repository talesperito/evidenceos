/**
 * DRY-RUN da sincronização Planilha do Google → banco do EvidenceOS.
 *
 * ⚠️ ESTE SCRIPT NÃO ESCREVE NADA NO BANCO. Só lê e relata.
 *    Não faz INSERT, UPDATE nem DELETE. Pode ser rodado com segurança em produção.
 *
 * A lógica de comparação vive em `_sync-common.cjs`, compartilhada com `sync-apply.cjs`,
 * para que o que este relatório prevê seja exatamente o que o apply executa.
 *
 * Ver docs/plans/2026-07-26-reimportacao-planilha-google.md (ETAPA 2).
 *
 * Uso:
 *   node scripts/sync-dryrun.cjs            # baixa snapshot novo do Apps Script e compara
 *   node scripts/sync-dryrun.cjs --offline  # reaproveita o último snapshot baixado
 */

const fs = require('fs');
const { createDbClients, ensureDatabaseDir } = require('./_phase2-common.cjs');
const {
  REPORT_PATH,
  analisar,
  carregarVestigios,
  fetchSnapshot,
  norm,
} = require('./_sync-common.cjs');

function linha(char = '─', n = 78) {
  return char.repeat(n);
}

function titulo(texto) {
  console.log(`\n${linha('═')}\n${texto}\n${linha('═')}`);
}

function imprimirRelatorios(a, snapshot, schema, items) {
  // ================= RELATÓRIO 1 =================
  titulo('RELATÓRIO 1 — Contagem dos dois lados');
  console.log(`Snapshot gerado em          : ${snapshot.generatedAt}`);
  console.log(`Banco (schema)              : ${schema}`);
  console.log(linha());
  console.log(`Registros no DRIVE          : ${items.length}`);
  console.log(`Registros na VPS (ativos)   : ${a.totalVps}`);
  console.log(linha());
  console.log(`Novos no Drive (a inserir)  : ${a.novos.length}`);
  console.log(`Existem nos dois lados      : ${a.totalVps - a.soNaVps.length}`);
  console.log(`Só na VPS (ver Relatório 2) : ${a.soNaVps.length}`);
  console.log(`Troca de invólucro (UPDATE) : ${a.trocaDeInvolucro.length}`);
  if (a.novosBloqueadosPorAmbiguidade) {
    console.log(`\n⚠ ${a.novosBloqueadosPorAmbiguidade} linha(s) novas NÃO serão inseridas: FAV repetida na planilha.`);
  }
  if (a.sheetSemChave.length) {
    console.log(`⚠ ${a.sheetSemChave.length} linha(s) do Drive sem FAV e sem invólucro (inservíveis p/ chave).`);
  }

  // ================= RELATÓRIO 2 =================
  titulo('RELATÓRIO 2 — Existem na VPS e NÃO existem no Drive');

  const imprimirGrupo = (lista, rotulo) => {
    console.log(`\n${rotulo} — ${lista.length} registro(s)`);
    if (!lista.length) return;
    console.log(linha('-'));
    console.log('FAV'.padEnd(14) + 'REQUISIÇÃO'.padEnd(16) + 'MATERIAL');
    console.log(linha('-'));
    for (const v of lista) {
      const fav = (v.registroFav || '(sem FAV)').slice(0, 13).padEnd(14);
      const req = (v.requisicoes.map((r) => r.numero).join(',') || '(sem req.)').slice(0, 15).padEnd(16);
      console.log(fav + req + String(v.material || '').slice(0, 45));
    }
  };

  imprimirGrupo(a.grupoA, 'GRUPO A — importados da planilha (candidatos a resíduo de teste)');
  imprimirGrupo(a.grupoB, 'GRUPO B — criados no EvidenceOS (NUNCA excluídos automaticamente)');
  if (a.grupoB.length) {
    console.log('\nCritério: sem data de importação (`importedAt`), logo não vieram da planilha.');
    console.log('São trabalho da equipe. Só saem por decisão individual e explícita do usuário.');
  }

  // ================= RELATÓRIO 3 =================
  titulo('RELATÓRIO 3 — Alerta: registros do Grupo A que já têm trabalho feito');
  console.log(`${a.grupoARisco.length} de ${a.grupoA.length} registro(s) do Grupo A NÃO são resíduo inofensivo.`);
  if (a.grupoARisco.length) {
    console.log('Alguém já preencheu conservação/destinação, adicionou invólucros ou usou o PCNET neles.');
    console.log('Estes NUNCA são excluídos automaticamente.');
    console.log(linha('-'));
    for (const v of a.grupoARisco) {
      const motivos = [];
      if (v.estadoConservacao !== 'NAO_AVALIADO') motivos.push(`conservação=${v.estadoConservacao}`);
      if (v.destinacao !== 'NAO_INICIADO') motivos.push(`destinação=${v.destinacao}`);
      if (v.involucros.length > 1) motivos.push(`${v.involucros.length} invólucros`);
      if (v._count.destinationLogs) motivos.push(`${v._count.destinationLogs} log(s) destinação`);
      if (v._count.pcnetActionLogs) motivos.push(`${v._count.pcnetActionLogs} ação(ões) PCNET`);
      console.log(`FAV ${(v.registroFav || '(sem)').padEnd(12)} ${String(v.material).slice(0, 32).padEnd(34)} → ${motivos.join(', ')}`);
    }
  }

  // ================= TROCA DE INVÓLUCRO =================
  titulo('TROCA DE INVÓLUCRO — mesma FAV, invólucro diferente (é ATUALIZAÇÃO, não exclusão)');
  console.log(`${a.trocaDeInvolucro.length} vestígio(s) tiveram o invólucro alterado na planilha.`);
  if (a.trocaDeInvolucro.length) {
    console.log('Corresponde a troca/rompimento de lacre — evento normal de cadeia de custódia.');
    console.log(linha('-'));
    for (const t of a.trocaDeInvolucro.slice(0, 20)) {
      console.log(
        `FAV ${String(t.vestige.registroFav).padEnd(12)} ${String(t.vestige.material).slice(0, 26).padEnd(28)}` +
        ` VPS:[${t.invVps.join(',')}] → DRIVE:${t.invDrive}`,
      );
    }
    if (a.trocaDeInvolucro.length > 20) {
      console.log(`... e mais ${a.trocaDeInvolucro.length - 20} (lista completa no JSON).`);
    }
  }

  // ================= FAVs AMBÍGUAS =================
  titulo('FAVs REPETIDAS na planilha (ficam FORA da sincronização automática)');
  console.log(`${a.favsAmbiguas.length} FAV(s) aparecem em mais de uma linha do Drive, cobrindo ${a.favsAmbiguas.reduce((t, [, arr]) => t + arr.length, 0)} linha(s).`);
  if (a.favsAmbiguas.length) {
    console.log('Sem correspondência 1:1 possível — exigem decisão manual. O script nunca as resolve sozinho.');
    console.log(linha('-'));
    for (const [fav, arr] of a.favsAmbiguas.slice(0, 15)) {
      console.log(`FAV ${fav} → ${arr.length} linhas: ${arr.map((i) => i.material).join(' | ')}`);
    }
    if (a.favsAmbiguas.length > 15) {
      console.log(`... e mais ${a.favsAmbiguas.length - 15} (lista completa no JSON).`);
    }
  }
}

async function main() {
  const offline = process.argv.includes('--offline');
  const snapshot = await fetchSnapshot(offline);
  const items = snapshot.items;

  const { pool, prisma, schema } = createDbClients();

  try {
    const vestiges = await carregarVestigios(prisma);
    const a = analisar(items, vestiges);

    imprimirRelatorios(a, snapshot, schema, items);

    const resumo = (v) => ({
      id: v.id,
      fav: v.registroFav,
      requisicoes: v.requisicoes.map((r) => r.numero),
      material: v.material,
      categoria: v.category?.name,
      importedFrom: v.importedFrom,
      importedAt: v.importedAt,
      estadoConservacao: v.estadoConservacao,
      destinacao: v.destinacao,
      involucros: v.involucros.map((i) => i.numero),
      logsDestinacao: v._count.destinationLogs,
      acoesPcnet: v._count.pcnetActionLogs,
      criadoEm: v.createdAt,
    });

    const report = {
      geradoEm: new Date().toISOString(),
      modo: 'DRY-RUN (somente leitura, nada foi alterado)',
      schema,
      snapshotGeradoEm: snapshot.generatedAt,
      chaveDeIdentidade: 'FAV (principal), invólucro apenas como desempate',
      contagens: {
        drive: items.length,
        vps: a.totalVps,
        novosNoDrive: a.novos.length,
        existemNosDoisLados: a.totalVps - a.soNaVps.length,
        soNaVps: a.soNaVps.length,
        trocaDeInvolucro: a.trocaDeInvolucro.length,
        excluiveisAutomaticamente: a.excluiveis.length,
        bloqueadosPorTrabalhoFeito: a.grupoARisco.length,
        novosBloqueadosPorAmbiguidade: a.novosBloqueadosPorAmbiguidade,
        linhasDriveSemChave: a.sheetSemChave.length,
      },
      grupoA_importados: a.grupoA.map(resumo),
      grupoB_manuais: a.grupoB.map(resumo),
      grupoA_comTrabalhoFeito: a.grupoARisco.map(resumo),
      trocaDeInvolucro: a.trocaDeInvolucro.map((t) => ({
        fav: t.vestige.registroFav,
        material: t.vestige.material,
        materialDrive: t.materialDrive,
        involucroVps: t.invVps,
        involucroDrive: t.invDrive,
      })),
      favsRepetidasNaPlanilha: a.favsAmbiguas.map(([fav, arr]) => ({
        fav,
        linhas: arr.map((i) => ({
          material: i.material,
          involucro: i.involucro,
          requisicao: i.requisicao,
          planilhaOrigem: i.planilhaOrigem,
        })),
      })),
      novosParaInserir: a.novos.map((i) => ({
        fav: norm(i.fav),
        involucro: norm(i.involucro),
        requisicao: norm(i.requisicao),
        material: i.material,
        planilhaOrigem: i.planilhaOrigem,
      })),
    };

    ensureDatabaseDir();
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(`\n${linha('═')}`);
    console.log(`Relatório completo salvo em: ${REPORT_PATH}`);
    console.log('NADA foi alterado no banco — este script é somente leitura.');
    console.log(linha('═'));
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('\n❌ ERRO no dry-run:', error.message);
  process.exit(1);
});

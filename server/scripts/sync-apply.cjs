/**
 * APPLY da sincronização Planilha do Google → banco do EvidenceOS.
 *
 * ⚠️ ESTE SCRIPT ESCREVE NO BANCO. Rode o `sync-dryrun.cjs` antes, sempre.
 *
 * Autorizado pelo Resumo de Impacto de Segurança e Auditoria aprovado em 2026-07-26
 * (ver docs/plans/2026-07-26-reimportacao-planilha-google.md, ETAPA 3), com três travas
 * que NÃO devem ser removidas sem nova aprovação:
 *
 *   1. Tudo dentro de UMA transação — ou aplica tudo, ou nada.
 *   2. Exclusão é sempre LÓGICA (deletedAt), nunca física.
 *   3. FAVs repetidas na planilha ficam FORA da operação automática.
 *
 * O que este script NUNCA sobrescreve (campos que a planilha não conhece):
 *   estadoConservacao, destinacao, destinacaoObs, destinacaoChangedBy/At,
 *   observacoes, tipoMaterial, createdBy, updatedBy, deletedAt de terceiros.
 *
 * Uso:
 *   OPERADOR_EMAIL=voce@exemplo.com node scripts/sync-apply.cjs --confirmar
 *   ... --offline        reaproveita o último snapshot (não rebaixa da planilha)
 *   ... --sem-exclusoes  aplica inserções e atualizações, mas não marca nada como excluído
 */

const { createDbClients } = require('./_phase2-common.cjs');
const {
  analisar,
  buildStableLegacyId,
  carregarVestigios,
  fetchSnapshot,
  norm,
  normalizeCategoryName,
  parseRawDate,
} = require('./_sync-common.cjs');

function linha(char = '─', n = 78) {
  return char.repeat(n);
}

async function main() {
  const args = process.argv.slice(2);
  const confirmado = args.includes('--confirmar');
  const offline = args.includes('--offline');
  const semExclusoes = args.includes('--sem-exclusoes');

  // Trava contra execução acidental.
  if (!confirmado) {
    console.error('\n❌ Este script ESCREVE no banco e exige confirmação explícita.');
    console.error('   Rode primeiro:  node scripts/sync-dryrun.cjs');
    console.error('   Depois:         OPERADOR_EMAIL=voce@exemplo.com node scripts/sync-apply.cjs --confirmar\n');
    process.exit(1);
  }

  // Sem isto, o log de auditoria ficaria anônimo — o script roda por linha de comando,
  // então não existe usuário logado do EvidenceOS para atribuir a operação.
  const operadorEmail = process.env.OPERADOR_EMAIL;
  if (!operadorEmail) {
    console.error('\n❌ Defina OPERADOR_EMAIL — a auditoria não pode ficar anônima.');
    console.error('   Ex.: OPERADOR_EMAIL=voce@exemplo.com node scripts/sync-apply.cjs --confirmar\n');
    process.exit(1);
  }
  const operadorNome = process.env.OPERADOR_NOME || operadorEmail;

  const snapshot = await fetchSnapshot(offline);
  const items = snapshot.items;

  const { pool, prisma, schema } = createDbClients();

  try {
    const vestiges = await carregarVestigios(prisma);
    const a = analisar(items, vestiges);

    const exclusoes = semExclusoes ? [] : a.excluiveis;

    console.log(`\n${linha('═')}`);
    console.log('PLANO DE APLICAÇÃO');
    console.log(linha('═'));
    console.log(`Banco (schema)              : ${schema}`);
    console.log(`Operador                    : ${operadorNome} <${operadorEmail}>`);
    console.log(linha('-'));
    console.log(`Inserir vestígios novos     : ${a.novos.length}`);
    console.log(`Atualizar invólucro (lacre) : ${a.trocaDeInvolucro.length}`);
    console.log(`Marcar como excluídos       : ${exclusoes.length}${semExclusoes ? '  (--sem-exclusoes ativo)' : ''}`);
    console.log(linha('-'));
    console.log(`Bloqueados (trabalho feito) : ${a.grupoARisco.length}  → nunca excluídos automaticamente`);
    console.log(`Bloqueados (criados no app) : ${a.grupoB.length}  → não vêm da planilha`);
    console.log(`Fora do escopo (FAV repetida): ${a.favsAmbiguas.reduce((t, [, arr]) => t + arr.length, 0)} linha(s)`);
    console.log(linha('═'));

    if (!a.novos.length && !a.trocaDeInvolucro.length && !exclusoes.length) {
      console.log('\nNada a fazer — banco já está sincronizado com a planilha.');
      return;
    }

    const agora = new Date();
    const importedAt = snapshot.generatedAt ? new Date(snapshot.generatedAt) : agora;

    const resultado = await prisma.$transaction(async (tx) => {
      // --- Categorias: garante que toda aba da planilha exista antes de inserir ---
      const nomesCategorias = Array.from(
        new Set(a.novos.map((item) => normalizeCategoryName(item.planilhaOrigem))),
      );
      for (const nome of nomesCategorias) {
        await tx.vestigeCategory.upsert({
          where: { name: nome },
          create: { name: nome, originalSheet: nome },
          update: { active: true },
        });
      }
      const categorias = await tx.vestigeCategory.findMany({ select: { id: true, name: true } });
      const mapaCategorias = new Map(categorias.map((c) => [c.name, c.id]));

      // --- Inserções ---
      let inseridos = 0;
      for (const item of a.novos) {
        const nomeCategoria = normalizeCategoryName(item.planilhaOrigem);
        const categoryId = mapaCategorias.get(nomeCategoria);
        if (!categoryId) throw new Error(`Categoria não encontrada: ${nomeCategoria}`);

        const involucro = norm(item.involucro);

        await tx.vestige.create({
          data: {
            legacyId: buildStableLegacyId(item),
            categoryId,
            registroFav: norm(item.fav) || null,
            requisicao: norm(item.requisicao) || null,
            material: String(item.material || 'N/I').trim() || 'N/I',
            municipio: String(item.municipio || 'Lavras').trim() || 'Lavras',
            dataColeta: parseRawDate(item.data),
            importedFrom: 'google_sheets',
            importedAt,
            // Invólucro vai para a tabela própria (1:N) — a coluna antiga não existe mais.
            involucros: involucro ? { create: [{ numero: involucro }] } : undefined,
          },
        });
        inseridos += 1;
      }

      // --- Troca de lacre: ADICIONA o invólucro novo, preservando o histórico ---
      let involucrosAtualizados = 0;
      for (const t of a.trocaDeInvolucro) {
        await tx.vestigeInvolucro.create({
          data: { vestigeId: t.vestige.id, numero: t.invDrive },
        });
        involucrosAtualizados += 1;
      }

      // --- Exclusão lógica: o registro permanece, só sai das listagens ativas ---
      let excluidos = 0;
      for (const v of exclusoes) {
        await tx.vestige.update({
          where: { id: v.id },
          data: { deletedAt: agora },
        });
        excluidos += 1;
      }

      // --- Auditoria da operação inteira ---
      await tx.auditLog.create({
        data: {
          userEmail: operadorEmail,
          userName: operadorNome,
          action: 'SYNC_DRIVE',
          targetType: 'vestige',
          details: {
            schema,
            snapshotGeradoEm: snapshot.generatedAt,
            totalDrive: items.length,
            totalVpsAntes: a.totalVps,
            inseridos,
            involucrosAtualizados,
            excluidosLogicamente: excluidos,
            motivoExclusao: `ausente na planilha em ${agora.toISOString()}`,
            bloqueadosPorTrabalhoFeito: a.grupoARisco.length,
            bloqueadosCriadosNoApp: a.grupoB.length,
            foraDoEscopoFavRepetida: a.favsAmbiguas.length,
          },
        },
      });

      return { inseridos, involucrosAtualizados, excluidos };
    }, {
      // A operação toca milhares de linhas; o default de 5s é curto demais.
      maxWait: 30_000,
      timeout: 300_000,
    });

    console.log(`\n${linha('═')}`);
    console.log('✅ SINCRONIZAÇÃO APLICADA');
    console.log(linha('═'));
    console.log(`Inseridos                   : ${resultado.inseridos}`);
    console.log(`Invólucros atualizados      : ${resultado.involucrosAtualizados}`);
    console.log(`Marcados como excluídos     : ${resultado.excluidos}`);
    console.log(linha('-'));
    console.log('Registrado em AuditLog com action=SYNC_DRIVE.');
    console.log('Exclusões são lógicas: para reverter, basta limpar o deletedAt do vestígio.');
    console.log(linha('═'));
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('\n❌ ERRO na sincronização:', error.message);
  console.error('   A transação foi revertida — o banco NÃO foi alterado.');
  process.exit(1);
});

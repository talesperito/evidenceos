/**
 * Corrige os vestígios da aba "Munições", cujas colunas vieram deslocadas da planilha do Google.
 *
 * O PROBLEMA (diagnosticado em 2026-09-10, docs/plans/2026-07-26-reimportacao-planilha-google.md §8.3)
 * A aba "Munições" tem uma coluna a mais (a natureza da munição). O Apps Script leu por posição e cada
 * campo recebeu o valor do seguinte:
 *
 *   registroFav  → é o LACRE (invólucro)      municipio → é a FAV verdadeira
 *   invólucro    → é a requisição             requisição → é a natureza ("Deflagradas"...)
 *   data         → era o município (o banco rejeitou e gravou nulo)
 *
 * ESTA VERSÃO (2026-11-23) substitui a de 10/09, que nunca rodou: aquela apagava as observações, gravava
 * na coluna `requisicao` congelada e excluía invólucros de verdade. Agora os dados vêm do PCNET, não da
 * planilha: a FAV verdadeira foi lida no PCNET e o invólucro atual da FAV conferiu com o lacre (ou o
 * usuário conferiu a linha). Desenho: docs/plans/2026-11-17-leitura-fav-reds-pje-design.md §7.4.
 *
 * Entrada: correcao-municoes.json, gerado no PC por scripts/pcnet-gerar-importacao.py a partir da
 * planilha conferida. Por vestígio, numa transação, com auditoria FIX_MUNICOES_COLUNAS (antes/depois):
 * - FAV           → a verdadeira
 * - invólucro     → o lacre (motivo CORRECAO_CADASTRO); os itens antigos recebem removedAt
 * - requisição    → as da FAV no PCNET (motivo CORRECAO_CADASTRO); os itens antigos (a natureza) recebem removedAt
 * - tipoMaterial  → a natureza, só se estiver vazio
 * - município     → o da planilha, ou N/I
 * - observações   → ACRESCENTA uma nota; nada é apagado
 * - REDS e PJe    → os da FAV, só se o campo estiver vazio
 * Só age se o vestígio ainda estiver deslocado (FAV = lacre e município = FAV verdadeira); o resto é
 * pulado e listado. Pode rodar de novo.
 *
 * Sem --confirmar, NÃO escreve nada.
 *
 * Uso (no console do `api`, em /app):
 *   node scripts/corrigir-municoes.cjs <arquivo.json>                          # diagnóstico
 *   OPERADOR_EMAIL=voce@exemplo.com node scripts/corrigir-municoes.cjs <arquivo.json> --confirmar
 */
const {
  createDbClients, TX_OPTIONS, linha, exigirLavras, lerArquivo, exigirOperador, mesmaFav,
} = require('./_reds-pje-common.cjs');

const MOTIVO = 'CORRECAO_CADASTRO';
const REDS = /^\d{4}-\d{9}-\d{3}$/;
const PJE = /^\d{20}$/;

const nota = (item, data) =>
  `[Correção ${data}] Aba "Munições" da planilha antiga com colunas deslocadas: FAV, invólucro, ` +
  `requisição, natureza e município realocados. FAV ${item.fav_correta} conferida: ${item.fonte}; ` +
  `invólucro ${item.involucro} era o número gravado no campo FAV.`;

async function main() {
  exigirLavras();
  const confirmado = process.argv.includes('--confirmar');
  const caminho = process.argv.slice(2).find((a) => !a.startsWith('--'));
  const { dados, sha } = lerArquivo(caminho, 'correcao-municoes');
  const { pool, prisma, schema } = createDbClients();
  const hoje = new Date().toISOString().slice(0, 10);

  try {
    const operador = confirmado ? await exigirOperador(prisma) : null;
    const ativos = { where: { removedAt: null }, select: { id: true, numero: true, motivo: true }, orderBy: { id: 'asc' } };
    const planos = [];
    const pulados = [];

    for (const item of dados.itens) {
      const v = await prisma.vestige.findUnique({
        where: { id: item.id },
        select: {
          id: true, deletedAt: true, registroFav: true, municipio: true, tipoMaterial: true, observacoes: true,
          numeroReds: true, numeroPje: true, involucros: ativos, requisicoes: ativos,
        },
      });
      if (!v || v.deletedAt) { pulados.push({ item, motivo: 'vestígio excluído ou inexistente' }); continue; }
      if (!mesmaFav(v.registroFav, item.fav_atual) || !mesmaFav(v.municipio, item.fav_correta)) {
        pulados.push({ item, motivo: `não está mais deslocado (FAV ${v.registroFav}, município ${v.municipio})` });
        continue;
      }
      if (!/^[A-Z0-9]+$/.test(item.involucro) || item.requisicoes.some((r) => !/^\d+$/.test(r))) {
        pulados.push({ item, motivo: 'invólucro ou requisição fora do formato do sistema' });
        continue;
      }
      planos.push({ item, v });
    }

    console.log(`\n${linha('═')}`);
    console.log(confirmado ? 'CORREÇÃO DA ABA MUNIÇÕES — APLICANDO' : 'CORREÇÃO DA ABA MUNIÇÕES — DIAGNÓSTICO (nada foi alterado)');
    console.log(linha('═'));
    console.log(`Banco (schema)     : ${schema}`);
    console.log(`Arquivo SHA-256    : ${sha}`);
    console.log(`Itens no arquivo   : ${dados.itens.length}`);
    console.log(`A corrigir         : ${planos.length}`);
    console.log(`  ...com REDS      : ${planos.filter((p) => REDS.test(p.item.reds || '')).length}`);
    console.log(`Pulados            : ${pulados.length}`);
    console.log(linha('═'));
    for (const { item, v } of planos.slice(0, 5)) {
      console.log(`\nvestígio ${v.id}`);
      console.log(`   FAV        : ${v.registroFav}  →  ${item.fav_correta}`);
      console.log(`   invólucro  : ${v.involucros.map((i) => i.numero).join(', ') || '(nenhum)'}  →  ${item.involucro}`);
      console.log(`   requisição : ${v.requisicoes.map((r) => r.numero).join(', ') || '(nenhuma)'}  →  ${item.requisicoes.join(', ') || '(nenhuma)'}`);
      console.log(`   tipo       : ${v.tipoMaterial || '(vazio)'}  →  ${v.tipoMaterial || item.natureza || '(vazio)'}`);
      console.log(`   município  : ${v.municipio}  →  ${item.municipio}`);
      console.log(`   REDS / PJe : ${item.reds || '-'} / ${item.pje || '-'}`);
    }
    if (planos.length > 5) console.log(`\n... e mais ${planos.length - 5}`);
    if (pulados.length) {
      console.log('\nPULADOS:');
      for (const p of pulados) console.log(`  ${p.item.id}  FAV ${p.item.fav_correta}  ${p.motivo}`);
    }

    if (!confirmado) {
      console.log('\nPara aplicar:');
      console.log(`  OPERADOR_EMAIL=voce@exemplo.com node scripts/corrigir-municoes.cjs ${caminho} --confirmar\n`);
      return;
    }

    let corrigidos = 0;
    for (const { item, v } of planos) {
      const removedAt = new Date();
      await prisma.$transaction(async (tx) => {
        // Revalida dentro da transação: outro operador pode ter mexido desde o diagnóstico.
        const atual = await tx.vestige.findUnique({ where: { id: v.id }, select: { registroFav: true, municipio: true, deletedAt: true } });
        if (!atual || atual.deletedAt || !mesmaFav(atual.registroFav, item.fav_atual) || !mesmaFav(atual.municipio, item.fav_correta)) {
          throw new Error(`vestígio ${v.id} mudou durante a execução; não alterado`);
        }

        const invAntes = v.involucros.map(({ numero, motivo }) => ({ numero, motivo }));
        const reqAntes = v.requisicoes.map(({ numero, motivo }) => ({ numero, motivo }));
        const invSai = v.involucros.filter((i) => i.numero !== item.involucro);
        const reqSai = v.requisicoes.filter((r) => !item.requisicoes.includes(r.numero));
        if (invSai.length) await tx.vestigeInvolucro.updateMany({ where: { id: { in: invSai.map((i) => i.id) } }, data: { removedAt } });
        if (reqSai.length) await tx.vestigeRequisicao.updateMany({ where: { id: { in: reqSai.map((r) => r.id) } }, data: { removedAt } });
        if (!v.involucros.some((i) => i.numero === item.involucro)) {
          await tx.vestigeInvolucro.create({ data: { vestigeId: v.id, numero: item.involucro, motivo: MOTIVO } });
        }
        for (const numero of item.requisicoes) {
          if (!v.requisicoes.some((r) => r.numero === numero)) {
            await tx.vestigeRequisicao.create({ data: { vestigeId: v.id, numero, motivo: MOTIVO } });
          }
        }

        const dadosNovos = {
          registroFav: item.fav_correta,
          municipio: item.municipio,
          observacoes: [v.observacoes, nota(item, hoje)].filter(Boolean).join('\n'),
          updatedBy: operador.id,
          // Como na versão de 10/09: deixam de contar como linha da planilha e ficam protegidos da
          // exclusão automática da sincronização.
          importedFrom: 'manual',
          importedAt: null,
        };
        if (!v.tipoMaterial && item.natureza) dadosNovos.tipoMaterial = item.natureza;
        if (!v.numeroReds && REDS.test(item.reds || '')) dadosNovos.numeroReds = item.reds;
        if (!v.numeroPje && PJE.test(item.pje || '')) dadosNovos.numeroPje = item.pje;
        await tx.vestige.update({ where: { id: v.id }, data: dadosNovos });

        await tx.auditLog.create({
          data: {
            userId: operador.id,
            userEmail: operador.email,
            userName: operador.name,
            action: 'FIX_MUNICOES_COLUNAS',
            targetType: 'vestige',
            targetId: v.id,
            details: {
              motivo: 'Aba "Municoes" da planilha com coluna extra: campos deslocados uma posicao',
              fonte: item.fonte,
              registroFav: { antes: v.registroFav, depois: item.fav_correta },
              municipio: { antes: v.municipio, depois: item.municipio },
              involucros: { antes: invAntes, depois: [item.involucro] },
              requisicoes: { antes: reqAntes, depois: item.requisicoes },
              tipoMaterial: dadosNovos.tipoMaterial ? { antes: null, depois: dadosNovos.tipoMaterial } : undefined,
              numeroReds: dadosNovos.numeroReds ? { antes: null, depois: dadosNovos.numeroReds } : undefined,
              numeroPje: dadosNovos.numeroPje ? { antes: null, depois: dadosNovos.numeroPje } : undefined,
              arquivoSha256: sha,
            },
          },
        });
      }, TX_OPTIONS);
      corrigidos += 1;
    }
    console.log(`\n✅ Corrigidos: ${corrigidos}. Auditoria FIX_MUNICOES_COLUNAS em cada um, com antes e depois.\n`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('\n❌ ERRO:', error.message);
  console.error('   O vestígio em que o erro ocorreu não foi alterado (uma transação por vestígio).');
  console.error('   Os anteriores já corrigidos continuam corrigidos: rode de novo, eles serão pulados.\n');
  process.exit(1);
});

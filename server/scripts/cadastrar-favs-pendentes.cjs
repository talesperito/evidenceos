/**
 * Cadastra os 19 vestígios das FAVs que ficaram fora da migração.
 *
 * CONTEXTO — por que estes 19 não entraram sozinhos:
 * A sincronização nunca insere linha cuja FAV apareça mais de uma vez na
 * planilha, porque não há correspondência 1:1 possível e adivinhar produziria
 * duplicata silenciosa. Eram 18 FAVs (36 linhas) nessa condição. Com o marco
 * inicial de 2026-09-10 a planilha deixou de ser alimentada, então elas
 * perderam qualquer chance de entrar automaticamente.
 *
 * O usuário conferiu as 18 uma a uma contra o acervo e o PCNET em 2026-09-10.
 * Os dados abaixo são a transcrição dessas decisões — não são inferência do
 * script. Cada `nota` registra o que foi decidido e por quê.
 *
 * As 36 linhas viraram 19 vestígios: a maioria era a mesma evidência lançada
 * duas vezes (duplicata pura ou troca de lacre registrada como linha nova).
 *
 * Sem argumentos, NÃO escreve nada: só mostra o que seria gravado.
 *
 * Uso:
 *   node scripts/cadastrar-favs-pendentes.cjs                    # diagnóstico
 *   OPERADOR_EMAIL=voce@exemplo.com \
 *     node scripts/cadastrar-favs-pendentes.cjs --confirmar      # aplica
 */

const { createDbClients } = require('./_phase2-common.cjs');

// Data em UTC puro, para não deslocar o dia conforme o fuso de quem roda.
const d = (ano, mes, dia) => new Date(Date.UTC(ano, mes - 1, dia));

/**
 * Os 19 vestígios, conforme decidido pelo usuário em 2026-09-10.
 *
 * `involucros` em ordem cronológica: o primeiro é o original, o último é o
 * atual. Nos casos de troca de lacre os dois são gravados de propósito — o
 * invólucro rompido é elo da cadeia de custódia e descartá-lo apagaria o
 * registro de que houve substituição.
 */
const VESTIGIOS = [
  // ---- Bloco 1: linhas duplicadas na planilha (mesma evidência, lançada 2x) ----
  {
    fav: '2165107', material: 'Iphone', categoria: 'Celulares', requisicao: null,
    involucros: ['6534056'], municipio: 'Lavras', data: d(2026, 5, 26),
    nota: 'Linha duplicada na planilha (as duas eram idênticas nos 7 campos).',
  },
  {
    fav: '2173421', material: 'Samsung', categoria: 'Celulares', requisicao: null,
    involucros: ['8284084'], municipio: 'Lavras', data: d(2026, 5, 26),
    nota: 'Linha duplicada na planilha (as duas eram idênticas nos 7 campos).',
  },
  {
    fav: '2254052', material: 'Cocaína', categoria: 'Drogas', requisicao: '58113247',
    involucros: ['8628348'], municipio: 'Lavras', data: d(2026, 7, 25),
    nota: 'Linha duplicada na planilha (as duas eram idênticas nos 7 campos).',
  },
  {
    fav: '2275806', material: 'Motorola', categoria: 'Celulares', requisicao: null,
    involucros: ['8382996'], municipio: 'Lavras', data: d(2026, 8, 12),
    nota: 'Linha duplicada na planilha (as duas eram idênticas nos 7 campos).',
  },
  {
    fav: '2105362', material: 'Crack', categoria: 'Drogas', requisicao: '56919225',
    involucros: ['6329190'], municipio: 'Lavras', data: d(2026, 4, 1),
    nota: 'Linha duplicada na planilha, divergindo só na data. Entrada correta: 01/04/2026.',
  },
  {
    fav: '2262657', material: 'Espingarda', categoria: 'ArmasSimulacros', requisicao: '058177195',
    involucros: ['8532990', '8021422'], municipio: 'Lavras', data: d(2026, 7, 31),
    nota: 'Planilha tinha as colunas trocadas: gravou a FAV no campo invólucro e o invólucro novo no campo requisição. Invólucro original 8532990, substituído por 8021422 após exame pericial. Requisição e município confirmados pelo usuário.',
  },

  // ---- Bloco 2: troca de lacre registrada como linha nova (Grupo B) ----
  {
    fav: '2002724', material: 'Motorola', categoria: 'Celulares', requisicao: '58012844',
    involucros: ['4128390', '6389579'], municipio: 'Lavras', data: d(2026, 1, 21),
    nota: 'Troca de invólucro lançada como linha nova na planilha. Invólucro 4128390 rompido, substituído por 6389579.',
  },
  {
    fav: '2142702', material: 'Motorola', categoria: 'Celulares', requisicao: '58280217',
    involucros: ['6581567', '4204020'], municipio: 'Lavras', data: d(2026, 5, 2),
    nota: 'Troca de invólucro lançada como linha nova na planilha. Invólucro 6581567 rompido, substituído por 4204020.',
  },
  {
    fav: '2159585', material: 'Realme', categoria: 'Celulares', requisicao: '58318046',
    involucros: ['6581521', '5177720'], municipio: 'Lavras', data: d(2026, 5, 15),
    nota: 'Troca de invólucro lançada como linha nova na planilha. Invólucro 6581521 rompido, substituído por 5177720.',
  },
  {
    fav: '2183976', material: 'Motorola', categoria: 'Celulares', requisicao: '57843554',
    involucros: ['8548870', '8549013'], municipio: 'Perdões', data: d(2026, 6, 2),
    nota: 'Troca de invólucro lançada como linha nova na planilha. Invólucro 8548870 rompido, substituído por 8549013.',
  },
  {
    fav: '2183978', material: 'Iphone', categoria: 'Celulares', requisicao: '57843555',
    involucros: ['6584717', '5177699'], municipio: 'Perdões', data: d(2026, 6, 2),
    nota: 'Troca de invólucro lançada como linha nova na planilha. Invólucro 6584717 rompido, substituído por 5177699.',
  },
  {
    // ⚠ Este é o único com duas requisições. Ver aviso impresso pelo script.
    fav: '2186911', material: 'Samsung', categoria: 'Celulares', requisicao: '58140608',
    involucros: ['8548963', '8600203'], municipio: 'Lavras', data: d(2026, 6, 5),
    nota: 'Vestígio com DUAS requisições: 58140608 e 58391924. O sistema só comporta uma no campo próprio hoje, então a segunda fica registrada aqui. Invólucro 8548963 substituído por 8600203.',
    duasRequisicoes: ['58140608', '58391924'],
  },
  {
    fav: '2218731', material: 'Faca', categoria: 'Armas Branca', requisicao: '57869457',
    involucros: ['6747777', '6389354'], municipio: 'Lavras', data: d(2026, 6, 29),
    nota: 'Troca de invólucro lançada como linha nova na planilha, com datas divergentes. Entrada correta: 29/06/2026. Invólucro 6747777 substituído por 6389354.',
  },
  {
    fav: '2267318', material: 'Samsung', categoria: 'Celulares', requisicao: '58309776',
    involucros: ['8382993', '5177715'], municipio: 'Lavras', data: d(2026, 8, 4),
    nota: 'Troca de invólucro lançada como linha nova na planilha. Invólucro 8382993 rompido, substituído por 5177715.',
  },

  // ---- Bloco 3: erros de digitação e objetos distintos (Grupo C) ----
  {
    fav: '2142692', material: 'Motorola', categoria: 'Celulares', requisicao: '58280170',
    involucros: ['6581566', '4204402'], municipio: 'Lavras', data: d(2026, 5, 2),
    nota: 'A segunda linha da planilha trazia a marca "Xiaomi" por erro de digitação — é Motorola. Invólucro 6581566 rompido, substituído por 4204402.',
  },
  {
    fav: '2183965', material: 'Iphone', categoria: 'Celulares', requisicao: '57843553',
    involucros: ['8548980'], municipio: 'Lavras', data: d(2026, 6, 2),
    nota: 'A segunda linha da planilha foi descartada: trazia invólucro 67638742, número inválido (8 dígitos, fora do padrão da base). Vale o invólucro 8548980.',
  },
  {
    fav: '2229797', material: 'Samsung', categoria: 'Celulares', requisicao: '57925645',
    involucros: ['5177721', '4203945'], municipio: 'Perdões', data: d(2026, 7, 3),
    nota: 'Mesma evidência lançada duas vezes, com municípios divergentes. Correto: Perdões. Invólucro 5177721 rompido, substituído por 4203945.',
  },
  {
    fav: '2249472', material: '01 balança', categoria: 'Balanças', requisicao: null,
    involucros: ['3840966'], municipio: 'Santo Antônio do Amparo', data: d(2026, 7, 21),
    nota: 'FAV corrigida: a planilha trazia 2249473 por erro de digitação. A FAV correta é 2249472, e ela não existia em lugar nenhum da base.',
  },
  {
    fav: '2249473', material: 'Saquinhos plásticos', categoria: 'Diversos', requisicao: null,
    involucros: ['8382995'], municipio: 'Santo Antônio do Amparo', data: d(2026, 7, 21),
    nota: 'Vestígio distinto do anterior (aba Diversos, não Balanças). Manteve a FAV 2249473, que era a correta desta linha.',
  },
];

function linha(char = '─', n = 78) {
  return char.repeat(n);
}

const fmt = (dt) => dt.toISOString().slice(0, 10).split('-').reverse().join('/');

async function main() {
  const confirmado = process.argv.includes('--confirmar');
  const operadorEmail = process.env.OPERADOR_EMAIL;
  const operadorNome = process.env.OPERADOR_NOME || operadorEmail;

  const { pool, prisma, schema } = createDbClients();

  try {
    // --- Categorias: falhar aqui é melhor do que criar categoria errada ---
    const categorias = await prisma.vestigeCategory.findMany({ select: { id: true, name: true } });
    const mapaCategorias = new Map(categorias.map((c) => [c.name, c.id]));
    const faltando = [...new Set(VESTIGIOS.map((v) => v.categoria))].filter((n) => !mapaCategorias.has(n));

    // --- Já existe? Torna o script seguro de rodar duas vezes ---
    const favs = VESTIGIOS.map((v) => v.fav);
    const existentes = await prisma.vestige.findMany({
      where: { registroFav: { in: favs }, deletedAt: null },
      select: { registroFav: true, material: true },
    });
    const jaExistem = new Set(existentes.map((e) => e.registroFav));
    const aInserir = VESTIGIOS.filter((v) => !jaExistem.has(v.fav));

    console.log(`\n${linha('═')}`);
    console.log(confirmado ? 'CADASTRO DAS FAVS PENDENTES — APLICANDO' : 'CADASTRO DAS FAVS PENDENTES — DIAGNÓSTICO (nada será gravado)');
    console.log(linha('═'));
    console.log(`Banco (schema)      : ${schema}`);
    console.log(`Definidos no script : ${VESTIGIOS.length}`);
    console.log(`Já existem no banco : ${jaExistem.size}`);
    console.log(`A inserir           : ${aInserir.length}`);
    console.log(linha('═'));

    if (faltando.length) {
      console.error(`\n❌ Categoria(s) inexistente(s) no banco: ${faltando.join(', ')}`);
      console.error('   Nada foi gravado. Crie a categoria antes ou corrija o nome no script.\n');
      process.exit(1);
    }

    if (jaExistem.size) {
      console.log('\nJá existentes (serão ignorados):');
      for (const e of existentes) console.log(`  FAV ${String(e.registroFav).padEnd(10)} ${e.material}`);
    }

    if (!aInserir.length) {
      console.log('\nNada a fazer — todas as FAVs já estão no banco.');
      return;
    }

    console.log('\n' + linha('═'));
    console.log('O QUE SERÁ GRAVADO');
    console.log(linha('═'));
    for (const v of aInserir) {
      console.log(`\nFAV ${v.fav}  ·  ${v.material}  ·  ${v.categoria}`);
      console.log(`   requisição : ${v.requisicao || '(vazia)'}`);
      console.log(`   invólucros : ${v.involucros.join('  →  ')}${v.involucros.length > 1 ? '   (o último é o atual)' : ''}`);
      console.log(`   município  : ${v.municipio}`);
      console.log(`   data       : ${fmt(v.data)}`);
      console.log(`   observação : ${v.nota}`);
    }

    const comDuas = aInserir.filter((v) => v.duasRequisicoes);
    if (comDuas.length) {
      console.log(`\n${linha('═')}`);
      console.log('⚠ ATENÇÃO — vestígio com mais de uma requisição');
      console.log(linha('═'));
      for (const v of comDuas) {
        console.log(`FAV ${v.fav}: requisições ${v.duasRequisicoes.join(' e ')}.`);
        console.log(`   Vai para o campo próprio: ${v.requisicao}`);
        console.log('   A outra fica só na observação, porque o vestígio comporta um');
        console.log('   único campo de requisição hoje. Se a que deve constar no campo');
        console.log('   for a outra, edite o script antes de aplicar.');
      }
    }

    console.log(`\n${linha('═')}`);

    if (!confirmado) {
      console.log('\nEste foi o diagnóstico. Para aplicar:');
      console.log('  OPERADOR_EMAIL=voce@exemplo.com node scripts/cadastrar-favs-pendentes.cjs --confirmar\n');
      return;
    }

    if (!operadorEmail) {
      console.error('\n❌ Defina OPERADOR_EMAIL — a auditoria não pode ficar anônima.\n');
      process.exit(1);
    }

    const inseridos = await prisma.$transaction(async (tx) => {
      const feitos = [];
      for (const v of aInserir) {
        const criado = await tx.vestige.create({
          data: {
            categoryId: mapaCategorias.get(v.categoria),
            registroFav: v.fav,
            requisicao: v.requisicao,
            material: v.material,
            municipio: v.municipio,
            dataColeta: v.data,
            observacoes: v.nota,
            // Estes vestígios NÃO vêm da planilha: são cadastro feito no sistema,
            // a partir de conferência manual. Marcá-los como importados os
            // colocaria na fila de exclusão automática da sincronização.
            importedFrom: 'manual',
            importedAt: null,
            involucros: { create: v.involucros.map((numero) => ({ numero })) },
          },
          select: { id: true, registroFav: true, material: true },
        });
        feitos.push(criado);
      }

      await tx.auditLog.create({
        data: {
          userEmail: operadorEmail,
          userName: operadorNome,
          action: 'CREATE_FAVS_PENDENTES',
          targetType: 'vestige',
          details: {
            schema,
            motivo: 'FAVs repetidas na planilha, conferidas manualmente pelo usuário em 2026-09-10 e deixadas fora da sincronização automática',
            inseridos: feitos.length,
            favs: feitos.map((f) => f.registroFav),
          },
        },
      });

      return feitos;
    }, { maxWait: 30_000, timeout: 120_000 });

    console.log(`\n${linha('═')}`);
    console.log('✅ CADASTRO APLICADO');
    console.log(linha('═'));
    for (const f of inseridos) {
      console.log(`  FAV ${String(f.registroFav).padEnd(10)} ${f.material}`);
    }
    console.log(linha('-'));
    console.log(`Inseridos           : ${inseridos.length}`);
    console.log('Registrado em AuditLog com action=CREATE_FAVS_PENDENTES.');
    console.log('Marcados como criados no sistema — protegidos de exclusão automática.');
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

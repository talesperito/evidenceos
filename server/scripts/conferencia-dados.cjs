/**
 * Conferência de dados dos vestígios: repetidos, incompletos, formato suspeito, campos trocados,
 * falhas de auditoria e retiradas vencidas. Um achado por linha, com o campo a corrigir e a ação.
 *
 * Design: docs/plans/2026-10-08-conferente-vestigios-design.md
 * Origem: docs/plans/2026-09-29-busca-paginacao-e-duplicatas.md
 *
 * COMO FUNCIONA
 * As regras são determinísticas e moram aqui, não no agente: custódia não se confere "no olho".
 * O script só aponta. Nada é corrigido por ele — toda correção é feita pela tela, que grava
 * quem alterou nos Logs de Auditoria.
 *
 * O QUE NÃO É TRATADO COMO ERRO, de propósito:
 *   - vestígio sem requisição (situação de negócio, tem acompanhamento próprio);
 *   - a mesma requisição em FAVs diferentes (uma requisição cobre vários objetos);
 *   - data antiga em FAV recente (material antigo que só ganhou FAV no PCNET depois).
 *
 * SÓ LEITURA: a sessão abre com `default_transaction_read_only = on`; o PostgreSQL recusa
 * qualquer escrita mesmo que o código tivesse uma. Por isso este script não precisa da trava
 * por unidade que os scripts de escrita têm.
 *
 * Uso (console do serviço `api` no Easypanel, em /app — ou local, em server/):
 *   node scripts/conferencia-dados.cjs                    # resumo: quantos achados por regra
 *   node scripts/conferencia-dados.cjs --bloco            # relatório completo compactado, para
 *                                                         # colar num arquivo local e virar planilha
 *   node scripts/conferencia-dados.cjs --bloco --parte 2  # demais partes, quando o bloco é grande
 *   node scripts/conferencia-dados.cjs --bloco --linhas-por-parte 300
 *                                                         # se o terminal cortar o começo do bloco
 *   node scripts/conferencia-dados.cjs --csv              # relatório completo em CSV (uso local)
 *
 * O bloco vira Excel + CSV com: python scripts/gerar-planilha-conferencia.py gerar <arquivo>
 */

require('dotenv/config');
const { Client } = require('pg');
const zlib = require('zlib');
const crypto = require('crypto');

// O que é próprio de cada unidade. Quando existir `server/src/config/unit.ts` (plano de Campo
// Belo), a lista de municípios deve vir de lá em vez de ser repetida aqui.
const UNIDADES = {
  lavras: {
    // Mesma lista de OFFICIAL_CITIES em client/hooks/useVestiges.ts.
    cidades: ['Lavras', 'Ribeirão Vermelho', 'Perdões', 'Cana Verde', 'Santo Antônio do Amparo', 'Nepomuceno',
      'Ijaci', 'Bom Sucesso', 'Ibituruna', 'Ingaí', 'Luminárias', 'Itumirim', 'Itutinga', 'Carrancas'],
    // Antes do marco inicial, exclusões podem ter vindo do sync-apply, que grava um único log
    // SYNC_DRIVE para o lote — não um DELETE por vestígio.
    marcoInicial: '2026-09-11',
    // A aba "Munições" veio com as colunas deslocadas (ver corrigir-municoes.cjs). Esses
    // registros têm correção em lote preparada; listá-los regra a regra só faria barulho.
    municoesDeslocadas: true,
  },
};

const FAMILIAS = ['Repetidos', 'Incompletos', 'Formato suspeito', 'Campos trocados', 'Auditoria e retiradas', 'Munições (em lote)'];

const AVISAR_ADMIN = 'Não é correção de dado: avisar o administrador do sistema';
const REGRAS = {
  REP_A: { familia: 'Repetidos', problema: 'Mesma FAV e mesmo conteúdo (duplicata)', certeza: 'Certo' },
  REP_B1: { familia: 'Repetidos', problema: 'Troca de lacre lançada como registro novo', certeza: 'Provável' },
  REP_B2: { familia: 'Repetidos', problema: 'Mesma FAV e categoria, com dados diferentes', certeza: 'Conferir' },
  REP_B3: { familia: 'Repetidos', problema: 'FAV antiga cadastrada de novo no app', certeza: 'Conferir' },
  REP_B4: { familia: 'Repetidos', problema: 'Mesma FAV em categorias diferentes', certeza: 'Provável legítimo' },
  REP_C: { familia: 'Repetidos', problema: 'Mesmo invólucro em FAVs diferentes', certeza: 'Conferir' },

  SEM_DATA: { familia: 'Incompletos', problema: 'Sem data de entrada', campo: 'Data de entrada', acao: 'Preencher a data conforme a FAV no PCNET', certeza: 'Certo' },
  SEM_FAV: { familia: 'Incompletos', problema: 'Sem número de FAV', campo: 'FAV', acao: 'Informar a FAV (localizar no PCNET pelo invólucro ou pela requisição)', certeza: 'Certo' },
  SEM_MATERIAL: { familia: 'Incompletos', problema: 'Sem descrição do material', campo: 'Material', acao: 'Descrever o material', certeza: 'Certo' },
  SEM_MUNICIPIO: { familia: 'Incompletos', problema: 'Sem município', campo: 'Município', acao: 'Selecionar o município', certeza: 'Certo' },
  SEM_INVOLUCRO: { familia: 'Incompletos', problema: 'Sem número de invólucro', campo: 'Invólucro', acao: 'Incluir o número do invólucro (lacre)', certeza: 'Certo' },

  FAV_FORMATO: { familia: 'Formato suspeito', problema: 'FAV fora do padrão', campo: 'FAV', acao: 'Conferir a FAV no PCNET e corrigir', certeza: 'Provável' },
  INV_FORMATO: { familia: 'Formato suspeito', problema: 'Invólucro fora do padrão', campo: 'Invólucro', acao: 'Conferir o número do lacre. Se estiver errado, remover e incluir o correto', certeza: 'Indício' },
  REQ_FORMATO: { familia: 'Formato suspeito', problema: 'Requisição fora do padrão', campo: 'Requisição', acao: 'Conferir o número. Se estiver errado, remover e incluir o correto', certeza: 'Indício' },
  DATA_IMPOSSIVEL: { familia: 'Formato suspeito', problema: 'Data de entrada impossível', campo: 'Data de entrada', acao: 'Corrigir a data', certeza: 'Certo' },
  MUNICIPIO_FORA_LISTA: { familia: 'Formato suspeito', problema: 'Município fora da lista da unidade', campo: 'Município', acao: 'Conferir e selecionar o município correto', certeza: 'Conferir' },

  FAV_IGUAL_INVOLUCRO: { familia: 'Campos trocados', problema: 'FAV igual ao número do invólucro', campo: 'FAV / Invólucro', acao: 'Um dos dois foi digitado no campo errado: conferir no PCNET', certeza: 'Provável' },
  INV_IGUAL_REQ: { familia: 'Campos trocados', problema: 'Mesmo número no invólucro e na requisição', campo: 'Invólucro / Requisição', acao: 'Um dos dois foi digitado no campo errado: conferir no PCNET', certeza: 'Provável' },
  COLETA_APOS_CADASTRO: { familia: 'Campos trocados', problema: 'Data de entrada posterior ao cadastro', campo: 'Data de entrada', acao: 'Conferir a data', certeza: 'Provável' },
  FAV_DATA_FORA_ORDEM: { familia: 'Campos trocados', problema: 'FAV e data não combinam', campo: 'FAV / Data de entrada', acao: 'Conferir os dois no PCNET', certeza: 'Indício' },

  SEM_LOG_CADASTRO: { familia: 'Auditoria e retiradas', problema: 'Cadastro feito no app sem registro nos Logs de Auditoria', campo: 'Logs de Auditoria', acao: AVISAR_ADMIN, certeza: 'Conferir' },
  SEM_LOG_EDICAO: { familia: 'Auditoria e retiradas', problema: 'Edição sem registro nos Logs de Auditoria', campo: 'Logs de Auditoria', acao: AVISAR_ADMIN, certeza: 'Conferir' },
  SEM_LOG_EXCLUSAO: { familia: 'Auditoria e retiradas', problema: 'Exclusão sem registro nos Logs de Auditoria', campo: 'Logs de Auditoria', acao: AVISAR_ADMIN, certeza: 'Conferir' },
  RETIRADA_VENCIDA: { familia: 'Auditoria e retiradas', problema: 'Retirada agendada vencida e ainda em aberto', campo: 'Painel Retiradas Agendadas', acao: 'Registrar o desfecho: concluída, não compareceu ou cancelada', certeza: 'Certo' },

  // `valor` e `obs` desta regra só repetem campos do próprio vestígio: vão como modelo, uma vez,
  // em vez de 400 textos quase iguais dentro do bloco.
  MUNICOES_DESLOCADO: {
    familia: 'Munições (em lote)', problema: 'Aba Munições: colunas deslocadas na importação',
    campo: 'Todos (FAV, invólucro, requisição, município)', acao: 'Não corrigir à mão: aguarda a correção em lote já preparada', certeza: 'Certo',
    valorModelo: 'Gravado como FAV: {fav}',
    obsModelo: 'Pela rotação das colunas: FAV real {municipio}, invólucro real {fav}, requisição real {invs}.',
  },
};

// Posições da ficha do vestígio dentro do bloco. O gerador da planilha usa os mesmos nomes.
const CAMPOS_VESTIGIO = ['id', 'fav', 'cat', 'material', 'invs', 'reqs', 'municipio', 'coleta', 'origem', 'historico'];
const preencher = (modelo, ficha) => modelo.replace(/\{(\w+)\}/g, (_, campo) => ficha[CAMPOS_VESTIGIO.indexOf(campo)] || '(vazio)');

// A planilha usava literais no lugar de vazio (mesma lista de _sync-common.cjs).
const VAZIO = new Set(['', 'x', 'n/i', 'ni', '-', '--', 'nao informado']);
const nrm = (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const vazio = (s) => VAZIO.has(nrm(s));
const soDigitos = (s) => /^\d+$/.test(s);
const semZeros = (s) => s.replace(/^0+/, '');
const lista = (s) => (s ? s.split(' / ') : []);
const ordemNatural = (a, b) => a.localeCompare(b, undefined, { numeric: true });
const ref = (v) => v.id.slice(0, 8);
const hist = (v) => v.movs + v.retiradas + v.pcnet;

// Padrões medidos na base de Lavras: FAV com 5 a 7 dígitos; invólucro com 7 dígitos ou letra + 9
// dígitos; requisição com 8 dígitos, ou 9 começando com zero.
const FAV_OK = /^\d{5,7}$/;
const INV_OK = /^(\d{7}|[A-Za-z]\d{9})$/;
const REQ_OK = /^(\d{8}|0\d{8})$/;

// FAV x data: só a direção "data bem DEPOIS das FAVs vizinhas". A contrária é material antigo
// que ganhou FAV no PCNET anos depois — legítimo, e era 80% do que a regra simétrica marcava.
const JANELA_FAVS = 10;
const TOLERANCIA_DIAS = 365;

async function carregar(c, filtro, params = []) {
  const { rows } = await c.query(`
    SELECT v.id, trim(coalesce(v.registro_fav, '')) fav, k.name cat, trim(v.material) material,
      trim(v.municipio) municipio, to_char(v.data_coleta, 'DD/MM/YYYY') coleta,
      extract(year FROM v.data_coleta)::int ano_coleta,
      (extract(epoch FROM v.data_coleta) / 86400)::float8 dia_coleta,
      coalesce(v.data_coleta > now(), false) coleta_futura,
      coalesce(v.data_coleta::date > v.created_at::date + 2, false) coleta_apos_cadastro,
      to_char(v.created_at, 'DD/MM/YY HH24:MI') criado, v.created_at,
      to_char(v.deleted_at, 'DD/MM/YYYY HH24:MI') excluido_em,
      v.imported_at IS NULL AS do_sistema, trim(u.name) criador,
      coalesce((SELECT string_agg(trim(i.numero), ' / ' ORDER BY i.numero) FROM vestige_involucros i
                WHERE i.vestige_id = v.id AND i.removed_at IS NULL), '') invs,
      coalesce((SELECT string_agg(trim(r.numero), ' / ' ORDER BY r.numero) FROM vestige_requisicoes r
                WHERE r.vestige_id = v.id AND r.removed_at IS NULL), '') reqs,
      (SELECT count(*) FROM vestige_destination_logs d WHERE d.vestige_id = v.id)::int movs,
      (SELECT count(*) FROM withdrawal_request_items w WHERE w.vestige_id = v.id)::int retiradas,
      (SELECT count(*) FROM pcnet_action_logs p WHERE p.vestige_id = v.id)::int pcnet
    FROM vestiges v
    JOIN vestige_categories k ON k.id = v.category_id
    LEFT JOIN users u ON u.id = v.created_by
    WHERE ${filtro}`, params);
  return rows;
}

/**
 * Repetidos. Em cada grupo fica o registro com histórico (destinação, retirada, ação no PCNET);
 * depois o mais antigo; depois o id. Critério fixo: rodar de novo devolve as mesmas escolhas.
 */
function repetidos(rows) {
  const semReq = (v) => lista(v.reqs).every(vazio);
  const conteudo = (v) => [v.cat, nrm(v.material), v.invs, v.reqs].join('|');
  const completo = (v) => [conteudo(v), nrm(v.municipio), v.coleta].join('|');
  const prioridade = (a, b) => hist(b) - hist(a) || a.created_at - b.created_at || a.id.localeCompare(b.id);

  const porFav = new Map();
  for (const v of rows) {
    if (vazio(v.fav)) continue;
    if (!porFav.has(v.fav)) porFav.set(v.fav, []);
    porFav.get(v.fav).push(v);
  }
  const porInv = new Map();
  for (const v of rows) {
    for (const n of lista(v.invs)) {
      if (vazio(n)) continue;
      if (!porInv.has(n)) porInv.set(n, []);
      porInv.get(n).push(v);
    }
  }

  const grupos = { A: [], B1: [], B2: [], B3: [], B4: [] };
  for (const g of porFav.values()) {
    if (g.length < 2) continue;
    if (new Set(g.map(conteudo)).size === 1) grupos.A.push(g);
    else if (g.some((v) => v.do_sistema)) grupos.B3.push(g);
    else if (new Set(g.map((v) => v.cat)).size > 1) grupos.B4.push(g);
    else if (g.some(semReq) && g.some((v) => !semReq(v)) && new Set(g.map((v) => v.invs)).size > 1) grupos.B1.push(g);
    else grupos.B2.push(g);
  }
  const ordenar = (gs) => gs.sort((a, b) => a[0].cat.localeCompare(b[0].cat) || ordemNatural(a[0].fav, b[0].fav));
  const numero = (p, i) => `${p}-${String(i + 1).padStart(3, '0')}`;

  const EXCLUIR = 'Excluir o registro (lixeira do card)';
  const saida = [];
  const add = (secao, grupo, v, acao, campo, obs) => saida.push({ id: v.id, regra: `REP_${secao}`, grupo, acao, campo, obs });

  ordenar(grupos.A).forEach((g, i) => {
    g.sort(prioridade);
    const fica = g[0];
    const divergem = new Set(g.map(completo)).size > 1;
    // Mesmo operador, mesmo conteúdo, minutos de diferença: é o duplo clique no botão Salvar.
    const duploClique = g.every((v) => v.do_sistema && v.criador === fica.criador)
      && Math.max(...g.map((v) => v.created_at)) - Math.min(...g.map((v) => v.created_at)) <= 2 * 60 * 1000;
    const sufixo = duploClique ? ' Cadastros feitos no mesmo minuto: provável duplo clique.' : '';
    add('A', numero('A', i), fica,
      divergem ? 'MANTER - conferir município/data no PCNET' : 'MANTER',
      divergem ? 'Município / Data de entrada' : '—',
      (divergem ? 'Município ou data divergem entre as cópias: se o PCNET der razão à outra cópia, corrigir este registro antes de apagar a outra.' : '') + sufixo);
    g.slice(1).forEach((v) => add('A', numero('A', i), v,
      divergem ? 'APAGAR após conferir no PCNET' : 'APAGAR', EXCLUIR,
      `Cópia de ${ref(fica)}.` + (hist(v) ? ' ATENÇÃO: esta cópia também tem histórico.' : '') + sufixo));
  });

  ordenar(grupos.B1).forEach((g, i) => {
    const comReq = g.filter((v) => !semReq(v)).sort(prioridade);
    const semR = g.filter(semReq).sort(prioridade);
    const fica = comReq[0];
    add('B1', numero('B1', i), fica, 'MANTER e ADICIONAR o(s) invólucro(s) da outra linha', 'Invólucro (editar o registro)',
      'Registro com requisição. Adicionar aqui o(s) invólucro(s) antigo(s) das linhas abaixo.');
    comReq.slice(1).forEach((v) => add('B1', numero('B1', i), v, 'CONFERIR NO PCNET', 'Conferir antes de alterar',
      `Também tem requisição: pode ser outro objeto ou a mesma evidência de ${ref(fica)}.`));
    semR.forEach((v) => add('B1', numero('B1', i), v, 'APAGAR depois de juntar', EXCLUIR,
      `Adicionar o invólucro ${v.invs || '-'} em ${ref(fica)} e só depois apagar.` + (hist(v) ? ' ATENÇÃO: tem histórico.' : '')));
  });

  for (const [p, acao, campo, obs] of [
    ['B2', 'CONFERIR NO PCNET', 'Conferir antes de alterar', 'Mesma FAV e categoria, mas material, invólucro ou requisição diferem.'],
    ['B3', 'CONFERIR NO PCNET', 'Conferir antes de alterar', 'FAV antiga cadastrada de novo no app. Se for o mesmo objeto, juntar os dados num registro só.'],
    ['B4', 'MANTER (provável objeto distinto)', '—', 'Mesma FAV em categorias diferentes.'],
  ]) {
    ordenar(grupos[p]).forEach((g, i) => {
      g.sort(prioridade);
      for (const v of g) {
        // Numa FAV com vários objetos, dois idênticos entre si ainda são duplicata.
        const gemeos = g.filter((o) => o !== v && conteudo(o) === conteudo(v)).map(ref);
        if (gemeos.length) add(p, numero(p, i), v, 'DUPLICATA dentro do grupo - CONFERIR', 'Conferir antes de excluir', `Idêntico a ${gemeos.join(', ')}.`);
        else add(p, numero(p, i), v, acao, campo, obs);
      }
    });
  }

  let iC = 0;
  for (const [n, g] of [...porInv].sort((a, b) => ordemNatural(a[0], b[0]))) {
    if (g.length < 2 || new Set(g.map((v) => v.fav)).size < 2) continue;
    const id = numero('C', iC++);
    g.sort(prioridade).forEach((v) => add('C', id, v, 'CONFERIR NO PCNET', 'FAV / Invólucro',
      `O invólucro ${n} também está na FAV ${g.filter((o) => o !== v).map((o) => o.fav || '(sem FAV)').join(', ')}.`));
  }
  return saida;
}

/** Regras que olham um vestígio de cada vez. */
function porVestigio(rows, cfg) {
  const saida = [];
  const deslocados = new Set();
  const add = (v, regra, extra = {}) => saida.push({ id: v.id, regra, ...extra });

  const tipoFav = (n) => {
    if (/^[A-Za-z]\d{9}$/.test(n)) return 'Tem formato de invólucro (letra + 9 dígitos).';
    if (soDigitos(n)) return `${n.length} dígitos: o padrão tem de 5 a 7.`;
    return 'Contém letras ou símbolos.';
  };
  const tipoInv = (n) => {
    if (soDigitos(n)) return n.length >= 8 ? `${n.length} dígitos: parece número de requisição.` : `${n.length} dígito(s): o padrão tem 7.`;
    return 'Formato fora do padrão (7 dígitos, ou letra + 9 dígitos).';
  };
  const tipoReq = (n) => {
    if (soDigitos(n)) return n.length === 7 ? '7 dígitos: parece número de invólucro.' : `${n.length} dígitos: o padrão tem 8, ou 9 começando com zero.`;
    return 'Texto no lugar do número.';
  };
  const unicos = (xs) => [...new Set(xs)].join(' ');

  for (const v of rows) {
    const invs = lista(v.invs).filter((n) => !vazio(n));
    const reqs = lista(v.reqs).filter((n) => !vazio(n));

    if (cfg?.municoesDeslocadas && nrm(v.cat) === 'municoes' && soDigitos(v.municipio)) {
      deslocados.add(v.id);
      add(v, 'MUNICOES_DESLOCADO');
      continue;
    }

    if (!v.coleta) add(v, 'SEM_DATA', { valor: '(vazio)' });
    if (vazio(v.fav)) add(v, 'SEM_FAV', { valor: v.fav || '(vazio)' });
    if (vazio(v.material)) add(v, 'SEM_MATERIAL', { valor: v.material || '(vazio)' });
    if (vazio(v.municipio)) add(v, 'SEM_MUNICIPIO', { valor: v.municipio || '(vazio)' });
    if (!invs.length) add(v, 'SEM_INVOLUCRO', { valor: v.invs || '(nenhum)' });

    if (!vazio(v.fav) && !FAV_OK.test(v.fav)) add(v, 'FAV_FORMATO', { valor: v.fav, obs: tipoFav(v.fav) });
    const invRuins = invs.filter((n) => !INV_OK.test(n));
    if (invRuins.length) add(v, 'INV_FORMATO', { valor: invRuins.join(' / '), obs: unicos(invRuins.map(tipoInv)) });
    const reqRuins = reqs.filter((n) => !REQ_OK.test(n));
    if (reqRuins.length) add(v, 'REQ_FORMATO', { valor: reqRuins.join(' / '), obs: unicos(reqRuins.map(tipoReq)) });
    if (v.coleta && (v.coleta_futura || v.ano_coleta < 2000)) {
      add(v, 'DATA_IMPOSSIVEL', { valor: v.coleta, obs: v.coleta_futura ? 'Data no futuro.' : 'Ano anterior a 2000.' });
    }
    if (cfg && !vazio(v.municipio) && !soDigitos(v.municipio) && !cfg.cidades.includes(v.municipio)) {
      const oficial = cfg.cidades.find((cidade) => nrm(cidade) === nrm(v.municipio));
      add(v, 'MUNICIPIO_FORA_LISTA', oficial
        ? { valor: v.municipio, certeza: 'Provável', acao: `Corrigir para "${oficial}"`, obs: 'Grafia diferente da oficial: some dos filtros por cidade.' }
        : { valor: v.municipio, obs: 'Não está na lista de municípios da unidade.' });
    }

    if (/^\d{5,}$/.test(v.fav) && invs.includes(v.fav)) add(v, 'FAV_IGUAL_INVOLUCRO', { valor: v.fav });
    const emDois = invs.filter((i) => /^\d{5,}$/.test(i) && reqs.some((r) => semZeros(r) === semZeros(i)));
    if (emDois.length) add(v, 'INV_IGUAL_REQ', { valor: emDois.join(' / ') });
    if (v.do_sistema && v.coleta_apos_cadastro) add(v, 'COLETA_APOS_CADASTRO', { valor: v.coleta, obs: `Cadastrado em ${v.criado}.` });
  }

  // As FAVs são sequenciais no PCNET: número próximo, data próxima.
  const pontos = rows
    .filter((v) => !deslocados.has(v.id) && FAV_OK.test(v.fav) && v.coleta && !v.coleta_futura && v.ano_coleta >= 2000)
    .map((v) => ({ v, n: Number(v.fav) }))
    .sort((a, b) => a.n - b.n || a.v.id.localeCompare(b.v.id));
  const mediana = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  pontos.forEach((p, i) => {
    const vizinhas = [];
    for (let k = Math.max(0, i - JANELA_FAVS); k <= Math.min(pontos.length - 1, i + JANELA_FAVS); k++) {
      if (pontos[k].n !== p.n) vizinhas.push(pontos[k].v.dia_coleta);
    }
    if (vizinhas.length < 6) return;
    const meio = mediana(vizinhas);
    if (p.v.dia_coleta - meio <= TOLERANCIA_DIAS) return;
    const d = new Date(meio * 864e5);
    const mesAno = `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
    add(p.v, 'FAV_DATA_FORA_ORDEM', {
      valor: `FAV ${p.v.fav} · ${p.v.coleta}`,
      obs: `As FAVs de número próximo são de ${mesAno}. Pode faltar um dígito na FAV ou o ano da data estar errado.`,
    });
  });

  return saida;
}

/**
 * Rastro de auditoria e retiradas. A falha de gravação de log é silenciosa por decisão de
 * projeto (a tela continua funcionando), então só uma conferência como esta a revela.
 */
async function auditoriaERetiradas(c, cfg, porId) {
  const saida = [];
  const ids = async (sql, params = []) => (await c.query(sql, params)).rows;

  for (const { id } of await ids(`
    SELECT v.id FROM vestiges v
    WHERE v.deleted_at IS NULL AND v.imported_at IS NULL AND v.created_by IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM audit_logs a WHERE a.action = 'CREATE' AND a.target_id = v.id)`)) {
    saida.push({ id, regra: 'SEM_LOG_CADASTRO', valor: `Cadastrado em ${porId.get(id).criado}` });
  }

  // A conclusão de retirada também grava `updated_by`, com log próprio (WITHDRAWAL_COMPLETED).
  for (const { id } of await ids(`
    SELECT v.id FROM vestiges v
    WHERE v.deleted_at IS NULL AND v.updated_by IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM audit_logs a WHERE a.action = 'UPDATE' AND a.target_id = v.id)
      AND NOT EXISTS (SELECT 1 FROM withdrawal_request_items it JOIN withdrawal_requests w ON w.id = it.request_id
                      WHERE it.vestige_id = v.id AND w.status = 'CONCLUIDA')`)) {
    saida.push({ id, regra: 'SEM_LOG_EDICAO', valor: 'Editado (updated_by preenchido)' });
  }

  const excluidos = await carregar(c, `v.deleted_at IS NOT NULL AND ($1::date IS NULL OR v.deleted_at >= $1::date)
      AND NOT EXISTS (SELECT 1 FROM audit_logs a WHERE a.action = 'DELETE' AND a.target_id = v.id)`, [cfg?.marcoInicial ?? null]);
  for (const v of excluidos) {
    porId.set(v.id, v);
    saida.push({ id: v.id, regra: 'SEM_LOG_EXCLUSAO', valor: `Excluído em ${v.excluido_em}` });
  }

  const vencidas = await ids(`
    SELECT it.vestige_id id, to_char(w.scheduled_for, 'DD/MM/YYYY HH24:MI') agendada
    FROM withdrawal_request_items it JOIN withdrawal_requests w ON w.id = it.request_id
    WHERE w.status = 'SOLICITADA' AND w.scheduled_for < now() - interval '1 day'
    ORDER BY w.scheduled_for`);
  const faltam = [...new Set(vencidas.map((r) => r.id).filter((id) => !porId.has(id)))];
  if (faltam.length) for (const v of await carregar(c, 'v.id = ANY($1)', [faltam])) porId.set(v.id, v);
  for (const r of vencidas) {
    const excluido = porId.get(r.id).excluido_em;
    saida.push({ id: r.id, regra: 'RETIRADA_VENCIDA', valor: `Agendada para ${r.agendada}`, obs: excluido ? `O vestígio foi excluído em ${excluido}.` : '' });
  }
  return saida;
}

async function conferir(c, unidade) {
  const cfg = UNIDADES[unidade];
  const rows = await carregar(c, 'v.deleted_at IS NULL');
  const porId = new Map(rows.map((v) => [v.id, v]));

  const soltos = [...porVestigio(rows, cfg), ...await auditoriaERetiradas(c, cfg, porId)];
  // Repetidos mantêm a ordem dos grupos; os demais vão por regra e, dentro dela, por FAV.
  const ordemRegra = Object.keys(REGRAS);
  soltos.sort((a, b) => ordemRegra.indexOf(a.regra) - ordemRegra.indexOf(b.regra)
    || ordemNatural(porId.get(a.id).fav, porId.get(b.id).fav) || a.id.localeCompare(b.id));

  // Todos os ids, inclusive excluídos: o id encurtado do bloco tem que ser único na base inteira.
  const todosIds = (await c.query('SELECT id FROM vestiges')).rows.map((r) => r.id);
  // O nome do banco separa o histórico das rodadas: um teste no banco local não pode virar a
  // "rodada anterior" da produção.
  const banco = (await c.query('SELECT current_database() banco')).rows[0].banco;
  return { banco, ativos: rows.length, porId, todosIds, achados: [...repetidos(rows), ...soltos] };
}

const origem = (v) => (v.do_sistema ? `App - ${v.criador || '?'} ${v.criado}` : 'Planilha');
const historico = (v) => (hist(v) ? `mov ${v.movs} / ret ${v.retiradas} / pcnet ${v.pcnet}` : '');

/**
 * Cada vestígio e cada texto de regra entram uma vez só: é o que faz o bloco caber no console.
 * O id vai encurtado (o UUID inteiro não comprime e era quase metade do bloco): 12 caracteres,
 * ou mais se dois vestígios da base coincidirem nesse trecho.
 */
function montarPayload(unidade, { banco, ativos, porId, achados, todosIds }) {
  let tamanho = 12;
  while (tamanho < 36 && new Set(todosIds.map((id) => id.slice(0, tamanho))).size < todosIds.length) tamanho += 4;

  const indice = new Map();
  const vestigios = [];
  const posicao = (id) => {
    if (!indice.has(id)) {
      const v = porId.get(id);
      indice.set(id, vestigios.length);
      vestigios.push([v.id.slice(0, tamanho), v.fav, v.cat, v.material, v.invs, v.reqs, v.municipio, v.coleta || '', origem(v), historico(v)]);
    }
    return indice.get(id);
  };
  return {
    versao: 1,
    unidade,
    banco,
    regrasDaUnidade: Boolean(UNIDADES[unidade]),
    ativos,
    familias: FAMILIAS,
    regras: REGRAS,
    camposVestigio: CAMPOS_VESTIGIO,
    vestigios,
    achados: achados.map((a) => [posicao(a.id), a.regra, a.grupo || '', a.acao ?? null, a.certeza ?? null, a.campo ?? null, a.valor || '', a.obs || '']),
  };
}

function imprimirResumo(unidade, { banco, ativos, achados }) {
  const porRegra = {};
  for (const a of achados) {
    const r = porRegra[a.regra] ??= { linhas: 0, grupos: new Set(), ids: new Set() };
    r.linhas += 1;
    r.ids.add(a.id);
    if (a.grupo) r.grupos.add(a.grupo);
  }
  console.log(`Unidade: ${unidade}${UNIDADES[unidade] ? '' : ' (sem regras próprias: lista de municípios não conferida)'} · banco: ${banco}`);
  console.log(`Vestígios ativos: ${ativos} · achados: ${achados.length} em ${new Set(achados.map((a) => a.id)).size} vestígios`);
  for (const familia of FAMILIAS) {
    console.log(`\n${familia}`);
    for (const [codigo, regra] of Object.entries(REGRAS)) {
      if (regra.familia !== familia) continue;
      const r = porRegra[codigo];
      const grupos = r?.grupos.size ? ` em ${r.grupos.size} grupo(s)` : '';
      console.log(`  ${String(r?.linhas ?? 0).padStart(5)}  ${regra.problema}${grupos}`);
    }
  }
  console.log('\nRelatório completo, com o campo a corrigir em cada linha: --bloco (vira planilha) ou --csv.');
}

function imprimirCsv(payload) {
  const limpo = (s) => String(s ?? '').replace(/[;\r\n\t]+/g, ',').trim();
  console.log(['Aba', 'Grupo', 'FAV', 'Ref', 'Problema', 'Onde corrigir', 'Valor atual', 'Ação sugerida', 'Certeza', 'Categoria',
    'Material', 'Invólucro(s)', 'Requisição(ões)', 'Município', 'Data de entrada', 'Origem', 'Histórico', 'Observação', 'ID'].join(';'));
  for (const [iv, codigo, grupo, acao, certeza, campo, valor, obs] of payload.achados) {
    const ficha = payload.vestigios[iv];
    const [id, fav, cat, material, invs, reqs, municipio, coleta, org, hst] = ficha;
    const regra = REGRAS[codigo];
    console.log([regra.familia, grupo, fav, id.slice(0, 8), regra.problema, campo ?? regra.campo,
      valor || (regra.valorModelo ? preencher(regra.valorModelo, ficha) : ''), acao ?? regra.acao, certeza ?? regra.certeza,
      cat, material, invs, reqs, municipio, coleta, org, hst, obs || (regra.obsModelo ? preencher(regra.obsModelo, ficha) : ''), id].map(limpo).join(';'));
  }
}

// Linhas de 100 caracteres. O terminal do Easypanel só guarda um tanto de linhas para rolar de
// volta e copiar; se o começo do bloco sumir, diminuir com --linhas-por-parte.
const LINHAS_POR_PARTE = 600;

function imprimirBloco(payload, parte, porParte) {
  const texto = JSON.stringify(payload);
  const sha = crypto.createHash('sha256').update(texto).digest('hex').slice(0, 12);
  const b64 = zlib.gzipSync(Buffer.from(texto, 'utf8'), { level: 9 }).toString('base64');
  const linhas = b64.match(/.{1,100}/g);
  const partes = Math.ceil(linhas.length / porParte);
  if (parte < 1 || parte > partes) throw new Error(`--parte ${parte} não existe: o bloco tem ${partes} parte(s).`);

  const agora = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const gerado = `${agora.getFullYear()}-${p2(agora.getMonth() + 1)}-${p2(agora.getDate())}_${p2(agora.getHours())}${p2(agora.getMinutes())}`;

  console.log(`=====INICIO parte=${parte}/${partes} sha=${sha} gerado=${gerado}=====`);
  console.log(linhas.slice((parte - 1) * porParte, parte * porParte).join('\n'));
  console.log(`=====FIM parte=${parte}/${partes}=====`);
  if (partes > 1) {
    const outras = Array.from({ length: partes }, (_, i) => i + 1).filter((n) => n !== parte);
    console.log(`\n>>> O relatório tem ${partes} partes. Copie esta (de INICIO a FIM) e rode também, em seguida:`);
    const tamanho = porParte === LINHAS_POR_PARTE ? '' : ` --linhas-por-parte ${porParte}`;
    for (const n of outras) console.log(`>>>   node scripts/conferencia-dados.cjs --bloco --parte ${n}${tamanho}`);
    console.log('>>> Cole todas no mesmo arquivo, em qualquer ordem.');
  }
}

async function main() {
  const args = process.argv.slice(2);
  const modo = args.includes('--bloco') ? 'bloco' : args.includes('--csv') ? 'csv' : 'resumo';
  const numero = (opcao, padrao) => (args.includes(opcao) ? Number(args[args.indexOf(opcao) + 1]) : padrao);
  const parte = numero('--parte', 1);
  const porParte = numero('--linhas-por-parte', LINHAS_POR_PARTE);
  if (!Number.isInteger(parte) || !Number.isInteger(porParte) || porParte < 50) {
    throw new Error('--parte e --linhas-por-parte pedem números inteiros (mínimo de 50 linhas por parte).');
  }
  // Hoje a api de Lavras ainda não define UNIT; quando definir (plano de Campo Belo), vale o dela.
  const unidade = (process.env.UNIT || 'lavras').toLowerCase();

  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    await c.query('SET default_transaction_read_only = on');
    const resultado = await conferir(c, unidade);
    if (modo === 'resumo') imprimirResumo(unidade, resultado);
    else if (modo === 'csv') imprimirCsv(montarPayload(unidade, resultado));
    else imprimirBloco(montarPayload(unidade, resultado), parte, porParte);
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error('ERRO:', e.message);
  process.exit(1);
});

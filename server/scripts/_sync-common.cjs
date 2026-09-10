/**
 * Lógica compartilhada entre `sync-dryrun.cjs` (só lê) e `sync-apply.cjs` (escreve).
 *
 * A comparação Drive × banco mora AQUI, num lugar só, de propósito: se cada script
 * tivesse a sua cópia, uma mudança em um deles faria o dry-run deixar de prever
 * o que o apply realmente faz — que é justamente a garantia que o fluxo depende.
 *
 * Ver docs/plans/2026-07-26-reimportacao-planilha-google.md.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { APPS_SCRIPT_URL, DATABASE_DIR, ensureDatabaseDir } = require('./_phase2-common.cjs');

// O snapshot original (abril) é base histórica e não deve ser sobrescrito.
const LATEST_SNAPSHOT_PATH = path.join(DATABASE_DIR, 'sheets-snapshot-latest.json');
const REPORT_PATH = path.join(DATABASE_DIR, 'sync-dryrun-report.json');

// A planilha usa literais como "x" e "N/I" no lugar de vazio. Tratar isso como valor
// produziria chaves falsas — ex.: 7 vestígios distintos com "FAV x".
const PLACEHOLDERS = new Set(['', 'x', 'n/i', 'ni', '-', '--', 'nao informado', 'não informado']);

function norm(value) {
  const text = String(value == null ? '' : value).trim();
  return PLACEHOLDERS.has(text.toLowerCase()) ? '' : text;
}

function normalizeCategoryName(value) {
  const raw = String(value || 'Geral').trim().replace(/\.[^/.]+$/, '');
  return raw || 'Geral';
}

function parseRawDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  const text = String(value).trim();
  if (!text || PLACEHOLDERS.has(text.toLowerCase())) return null;

  const brMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    const [, day, month, year] = brMatch;
    const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// Identificador estável: NÃO inclui índice de linha (o legacyId antigo incluía, o que
// fazia toda linha inserida no meio da planilha mudar a identidade das seguintes).
function buildStableLegacyId(item) {
  const payload = [norm(item.fav), norm(item.involucro), String(item.material || '').trim()].join('|');
  return `gs_${crypto.createHash('sha256').update(payload).digest('hex').slice(0, 24)}`;
}

async function fetchSnapshot(offline) {
  if (offline) {
    if (!fs.existsSync(LATEST_SNAPSHOT_PATH)) {
      throw new Error(`--offline pedido, mas não existe ${LATEST_SNAPSHOT_PATH}. Rode sem --offline uma vez.`);
    }
    console.log(`Usando snapshot local: ${LATEST_SNAPSHOT_PATH}`);
    return JSON.parse(fs.readFileSync(LATEST_SNAPSHOT_PATH, 'utf8'));
  }

  console.log('Baixando snapshot do Apps Script...');
  const response = await fetch(`${APPS_SCRIPT_URL}?t=${Date.now()}`, {
    method: 'GET',
    redirect: 'follow',
    cache: 'no-store',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
  });

  if (!response.ok) throw new Error(`Apps Script retornou status ${response.status}`);

  const data = await response.json();
  if (!Array.isArray(data)) throw new Error('Apps Script retornou um payload inesperado (esperado: array)');

  const snapshot = {
    generatedAt: new Date().toISOString(),
    source: APPS_SCRIPT_URL,
    total: data.length,
    items: data,
  };

  ensureDatabaseDir();
  fs.writeFileSync(LATEST_SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2));
  console.log(`Snapshot novo salvo em ${LATEST_SNAPSHOT_PATH} (${data.length} linhas)`);
  return snapshot;
}

async function carregarVestigios(prisma) {
  return prisma.vestige.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      registroFav: true,
      material: true,
      importedFrom: true,
      importedAt: true,
      estadoConservacao: true,
      destinacao: true,
      createdAt: true,
      // Só itens ativos: removedAt marca o que foi retirado por engano pela tela.
      requisicoes: { where: { removedAt: null }, select: { numero: true } },
      involucros: { where: { removedAt: null }, select: { numero: true } },
      category: { select: { name: true } },
      _count: { select: { destinationLogs: true, pcnetActionLogs: true } },
    },
  });
}

/**
 * Compara planilha × banco.
 *
 * CHAVE: FAV é a principal; o invólucro só é chave quando o vestígio não tem FAV.
 * O invólucro MUDA ao longo da vida do vestígio (troca de lacre), então usá-lo na
 * chave composta faria a troca de lacre parecer "excluído + novo" — comprovado em
 * dados reais (2026-07-26): 14 falsos positivos.
 */
function analisar(items, vestiges) {
  const sheetByFav = new Map();
  const sheetByInvolucro = new Map();
  const sheetSemChave = [];

  for (const item of items) {
    const fav = norm(item.fav);
    const inv = norm(item.involucro);

    if (fav) {
      if (!sheetByFav.has(fav)) sheetByFav.set(fav, []);
      sheetByFav.get(fav).push(item);
    } else if (inv) {
      if (!sheetByInvolucro.has(inv)) sheetByInvolucro.set(inv, []);
      sheetByInvolucro.get(inv).push(item);
    } else {
      sheetSemChave.push(item);
    }
  }

  // FAVs repetidas: sem correspondência 1:1 possível. Ficam FORA de qualquer
  // operação automática, por decisão registrada no Resumo de Impacto.
  const favsAmbiguas = [...sheetByFav.entries()].filter(([, arr]) => arr.length > 1);
  const favsAmbiguasSet = new Set(favsAmbiguas.map(([fav]) => fav));

  const dbFavs = new Set();
  const dbInvolucrosSemFav = new Set();
  for (const v of vestiges) {
    const fav = norm(v.registroFav);
    if (fav) {
      dbFavs.add(fav);
    } else {
      for (const i of v.involucros) {
        const inv = norm(i.numero);
        if (inv) dbInvolucrosSemFav.add(inv);
      }
    }
  }

  const acharNaPlanilha = (v) => {
    const fav = norm(v.registroFav);
    if (fav) return sheetByFav.get(fav) || null;
    for (const i of v.involucros) {
      const inv = norm(i.numero);
      if (inv && sheetByInvolucro.has(inv)) return sheetByInvolucro.get(inv);
    }
    return null;
  };

  const soNaVps = vestiges.filter((v) => !acharNaPlanilha(v));

  // Novos: FAVs (ou invólucros, quando sem FAV) presentes no Drive e ausentes no banco.
  // FAVs ambíguas são excluídas: não dá para saber qual linha inserir.
  const novosPorFav = [...sheetByFav.entries()]
    .filter(([fav, arr]) => !dbFavs.has(fav) && arr.length === 1)
    .map(([, arr]) => arr[0]);
  const novosPorInvolucro = [...sheetByInvolucro.entries()]
    .filter(([inv, arr]) => !dbInvolucrosSemFav.has(inv) && arr.length === 1)
    .map(([, arr]) => arr[0]);
  const novos = [...novosPorFav, ...novosPorInvolucro];

  const novosBloqueadosPorAmbiguidade = [...sheetByFav.entries()]
    .filter(([fav, arr]) => !dbFavs.has(fav) && arr.length > 1)
    .reduce((total, [, arr]) => total + arr.length, 0);

  // Casaram pela FAV mas o invólucro mudou → troca/rompimento de lacre → é UPDATE.
  const trocaDeInvolucro = [];
  for (const v of vestiges) {
    const linhas = acharNaPlanilha(v);
    if (!linhas || linhas.length !== 1) continue;
    const invDrive = norm(linhas[0].involucro);
    const invVps = v.involucros.map((i) => norm(i.numero)).filter(Boolean);
    if (invDrive && invVps.length && !invVps.includes(invDrive)) {
      trocaDeInvolucro.push({ vestige: v, invDrive, invVps, materialDrive: linhas[0].material });
    }
  }

  // Veio mesmo da planilha? Exige os DOIS sinais.
  //
  // `importedFrom` sozinho não serve: o schema tem `@default("google_sheets")` e a rota
  // de criação (vestigeRoutes.ts) não preenche o campo, então todo vestígio digitado na
  // tela nasce marcado como se tivesse vindo da planilha. Usar só esse campo faria o
  // Grupo B ficar sempre vazio e jogaria o trabalho da equipe na fila de exclusão.
  //
  // `importedAt` é o sinal confiável, porque depende de uma AUSÊNCIA: só quem passou por
  // um script de importação o tem preenchido (_phase2-common.cjs e sync-apply.cjs); a
  // rota de criação o deixa NULL e não há como preenchê-lo por engano.
  //
  // A conjunção é deliberadamente conservadora: na dúvida, o vestígio cai no Grupo B e
  // fica protegido de exclusão automática. Errar protegendo é barato; o contrário não.
  const veioDaPlanilha = (v) => v.importedFrom === 'google_sheets' && v.importedAt !== null;

  const grupoA = soNaVps.filter(veioDaPlanilha);
  const grupoB = soNaVps.filter((v) => !veioDaPlanilha(v));

  // Registros onde alguém já trabalhou dentro do EvidenceOS: não são resíduo inofensivo.
  const temTrabalho = (v) =>
    v.estadoConservacao !== 'NAO_AVALIADO' ||
    v.destinacao !== 'NAO_INICIADO' ||
    v.involucros.length > 1 ||
    v._count.destinationLogs > 0 ||
    v._count.pcnetActionLogs > 0;

  const grupoARisco = grupoA.filter(temTrabalho);
  // Só estes podem ser marcados como excluídos automaticamente.
  const excluiveis = grupoA.filter((v) => !temTrabalho(v));

  return {
    sheetByFav,
    sheetByInvolucro,
    sheetSemChave,
    favsAmbiguas,
    favsAmbiguasSet,
    novos,
    novosBloqueadosPorAmbiguidade,
    trocaDeInvolucro,
    soNaVps,
    grupoA,
    grupoB,
    grupoARisco,
    excluiveis,
    totalVps: vestiges.length,
  };
}

module.exports = {
  LATEST_SNAPSHOT_PATH,
  REPORT_PATH,
  PLACEHOLDERS,
  analisar,
  buildStableLegacyId,
  carregarVestigios,
  fetchSnapshot,
  norm,
  normalizeCategoryName,
  parseRawDate,
};

require('dotenv/config');

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwmcouawrn6FbbbWPBozjdobJzhCmGGKGynyzTrGzaT2PsCgAIE7uJCGTm14TJSTS1_MA/exec';
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const DATABASE_DIR = path.join(ROOT_DIR, 'database');
const SNAPSHOT_PATH = path.join(DATABASE_DIR, 'sheets-snapshot.json');
const VALIDATION_PATH = path.join(DATABASE_DIR, 'import-validation.json');

function ensureDatabaseDir() {
  fs.mkdirSync(DATABASE_DIR, { recursive: true });
}

function getSchemaFromDatabaseUrl() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  const parsedUrl = new URL(connectionString);
  return parsedUrl.searchParams.get('schema') || 'public';
}

function createDbClients() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  const schema = getSchemaFromDatabaseUrl();
  const pool = new Pool({
    connectionString,
    options: `-c search_path=${schema}`,
  });
  const prisma = new PrismaClient({
    adapter: new PrismaPg(pool, { schema }),
  });

  return { pool, prisma, schema };
}

function parseSnapshotFile() {
  if (!fs.existsSync(SNAPSHOT_PATH)) {
    throw new Error(`Snapshot not found at ${SNAPSHOT_PATH}`);
  }

  const raw = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
  if (Array.isArray(raw)) {
    return {
      generatedAt: null,
      total: raw.length,
      items: raw,
    };
  }

  if (!Array.isArray(raw.items)) {
    throw new Error('Snapshot file has an invalid format');
  }

  return raw;
}

function normalizeCategoryName(value) {
  const raw = String(value || 'Geral').trim().replace(/\.[^/.]+$/, '');
  return raw || 'Geral';
}

function parseRawDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  const text = String(value).trim();
  if (!text || text.toUpperCase() === 'N/I') {
    return null;
  }

  const brMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    const [, day, month, year] = brMatch;
    const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildLegacyId(item, index) {
  const payload = [
    item.planilhaOrigem,
    item.fav,
    item.requisicao,
    item.involucro,
    item.material,
    item.municipio,
    item.data,
    index,
  ].map((value) => String(value || '').trim()).join('|');

  return `gs_${crypto.createHash('sha256').update(payload).digest('hex').slice(0, 24)}`;
}

function mapVestigeForInsert(item, index, categoryId, importedAt) {
  return {
    legacyId: buildLegacyId(item, index),
    categoryId,
    registroFav: item.fav ? String(item.fav).trim() : null,
    requisicao: item.requisicao ? String(item.requisicao).trim() : null,
    involucro: item.involucro ? String(item.involucro).trim() : null,
    material: String(item.material || 'N/I').trim() || 'N/I',
    municipio: String(item.municipio || 'Lavras').trim() || 'Lavras',
    dataColeta: parseRawDate(item.data),
    importedFrom: 'google_sheets',
    importedAt,
  };
}

module.exports = {
  APPS_SCRIPT_URL,
  DATABASE_DIR,
  ROOT_DIR,
  SNAPSHOT_PATH,
  VALIDATION_PATH,
  buildLegacyId,
  createDbClients,
  ensureDatabaseDir,
  getSchemaFromDatabaseUrl,
  mapVestigeForInsert,
  normalizeCategoryName,
  parseSnapshotFile,
};

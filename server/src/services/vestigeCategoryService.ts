import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../db/connection';

const SNAPSHOT_PATH = path.resolve(__dirname, '..', '..', '..', 'database', 'sheets-snapshot.json');

const normalizeCategoryName = (value: unknown) => {
  const raw = String(value || 'Geral').trim().replace(/\.[^/.]+$/, '');
  return raw || 'Geral';
};

const readSnapshotCategories = (): string[] => {
  if (!fs.existsSync(SNAPSHOT_PATH)) {
    return [];
  }

  const raw = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
  const items = Array.isArray(raw) ? raw : raw.items;
  if (!Array.isArray(items)) {
    return [];
  }

  return Array.from(
    new Set(items.map((item) => normalizeCategoryName(item?.planilhaOrigem))),
  ).sort((left, right) => left.localeCompare(right, 'pt-BR'));
};

export async function ensureVestigeCategories() {
  const existingCount = await prisma.vestigeCategory.count();
  if (existingCount > 0) {
    return;
  }

  const categories = readSnapshotCategories();
  if (categories.length === 0) {
    return;
  }

  for (const name of categories) {
    await prisma.vestigeCategory.upsert({
      where: { name },
      create: {
        name,
        originalSheet: name,
        active: true,
      },
      update: {
        originalSheet: name,
        active: true,
      },
    });
  }
}

const {
  createDbClients,
  mapVestigeForInsert,
  normalizeCategoryName,
  parseSnapshotFile,
} = require('./_phase2-common.cjs');

const BATCH_SIZE = 500;

async function main() {
  const snapshot = parseSnapshotFile();
  const importedAt = snapshot.generatedAt ? new Date(snapshot.generatedAt) : new Date();
  const items = snapshot.items;

  const { pool, prisma, schema } = createDbClients();

  try {
    const categoryNames = Array.from(
      new Set(items.map((item) => normalizeCategoryName(item.planilhaOrigem))),
    ).sort((a, b) => a.localeCompare(b, 'pt-BR'));

    for (const categoryName of categoryNames) {
      await prisma.vestigeCategory.upsert({
        where: { name: categoryName },
        create: {
          name: categoryName,
          originalSheet: categoryName,
        },
        update: {
          active: true,
          originalSheet: categoryName,
        },
      });
    }

    const categories = await prisma.vestigeCategory.findMany({
      select: {
        id: true,
        name: true,
      },
    });
    const categoryMap = new Map(categories.map((category) => [category.name, category.id]));

    await prisma.vestige.deleteMany({
      where: { importedFrom: 'google_sheets' },
    });

    let inserted = 0;
    for (let index = 0; index < items.length; index += BATCH_SIZE) {
      const batch = items.slice(index, index + BATCH_SIZE);
      const data = batch.map((item, batchIndex) => {
        const categoryName = normalizeCategoryName(item.planilhaOrigem);
        const categoryId = categoryMap.get(categoryName);

        if (!categoryId) {
          throw new Error(`Category not found for item with category "${categoryName}"`);
        }

        return mapVestigeForInsert(item, index + batchIndex, categoryId, importedAt);
      });

      await prisma.vestige.createMany({ data });
      inserted += data.length;
      console.log(`Inserted ${inserted}/${items.length}`);
    }

    console.log(`Seed complete in schema ${schema}`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

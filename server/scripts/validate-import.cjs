const fs = require('fs');
const {
  VALIDATION_PATH,
  createDbClients,
  ensureDatabaseDir,
  normalizeCategoryName,
  parseSnapshotFile,
} = require('./_phase2-common.cjs');

async function main() {
  ensureDatabaseDir();
  const snapshot = parseSnapshotFile();
  const expectedCategoryCount = new Set(
    snapshot.items.map((item) => normalizeCategoryName(item.planilhaOrigem)),
  ).size;

  const { pool, prisma, schema } = createDbClients();

  try {
    const [
      importedVestiges,
      categories,
      emptyMaterial,
      nullDates,
      topCategories,
    ] = await Promise.all([
      prisma.vestige.count({ where: { importedFrom: 'google_sheets' } }),
      prisma.vestigeCategory.count(),
      prisma.vestige.count({
        where: {
          importedFrom: 'google_sheets',
          OR: [
            { material: '' },
            { material: 'N/I' },
          ],
        },
      }),
      prisma.vestige.count({
        where: {
          importedFrom: 'google_sheets',
          dataColeta: null,
        },
      }),
      prisma.vestige.groupBy({
        by: ['categoryId'],
        _count: { _all: true },
        where: { importedFrom: 'google_sheets' },
      }),
    ]);

    const categoryRows = await prisma.vestigeCategory.findMany({
      select: { id: true, name: true },
    });
    const categoryMap = new Map(categoryRows.map((row) => [row.id, row.name]));

    const report = {
      generatedAt: new Date().toISOString(),
      schema,
      snapshotTotal: snapshot.total,
      importedVestiges,
      expectedCategoryCount,
      importedCategoryCount: categories,
      countsMatch: snapshot.total === importedVestiges,
      categoriesMatch: expectedCategoryCount === categories,
      placeholderMaterialCount: emptyMaterial,
      nullDateCount: nullDates,
      topCategories: topCategories
        .sort((left, right) => right._count._all - left._count._all)
        .map((entry) => ({
        categoryId: entry.categoryId,
        categoryName: categoryMap.get(entry.categoryId) || 'unknown',
        total: entry._count._all,
        })),
    };

    fs.writeFileSync(VALIDATION_PATH, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

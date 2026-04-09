const fs = require('fs');
const {
  APPS_SCRIPT_URL,
  SNAPSHOT_PATH,
  ensureDatabaseDir,
} = require('./_phase2-common.cjs');

async function main() {
  ensureDatabaseDir();

  const response = await fetch(`${APPS_SCRIPT_URL}?t=${Date.now()}`, {
    method: 'GET',
    redirect: 'follow',
    cache: 'no-store',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
  });

  if (!response.ok) {
    throw new Error(`Apps Script returned status ${response.status}`);
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error('Apps Script returned an unexpected payload');
  }

  const snapshot = {
    generatedAt: new Date().toISOString(),
    source: APPS_SCRIPT_URL,
    total: data.length,
    items: data,
  };

  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2));
  console.log(`Snapshot exported to ${SNAPSHOT_PATH}`);
  console.log(`Total vestiges: ${data.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

const { spawnSync } = require('child_process');
const path = require('path');

const scripts = [
  'export-sheets.cjs',
  'seed-from-snapshot.cjs',
  'validate-import.cjs',
];

for (const script of scripts) {
  const result = spawnSync(process.execPath, [path.join(__dirname, script)], {
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

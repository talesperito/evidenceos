const { spawnSync } = require('node:child_process');

function commandExists(cmd) {
  const checker = process.platform === 'win32' ? 'where' : 'which';
  const res = spawnSync(checker, [cmd], { stdio: 'ignore', shell: true });
  return res.status === 0;
}

if (!commandExists('docker')) {
  console.log('[db:up] Docker nao encontrado no PATH. Pulando subida do banco via docker compose.');
  process.exit(0);
}

const res = spawnSync('docker', ['compose', 'up', '-d'], {
  stdio: 'inherit',
  shell: true,
});

if (res.status !== 0) {
  console.log('[db:up] Nao foi possivel subir o docker compose. Continuando assim mesmo.');
  process.exit(0);
}

process.exit(0);

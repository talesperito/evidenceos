/**
 * Peças comuns dos scripts da leitura das FAVs (REDS/PJe, munições, cadastro em dobro).
 * Desenho: docs/plans/2026-11-17-leitura-fav-reds-pje-design.md (seção 7).
 */
const crypto = require('crypto');
const fs = require('fs');
const { createDbClients } = require('./_phase2-common.cjs');

// Mesmo limite das rotas de custódia (server/src/services/auditService.ts → CUSTODY_TX_OPTIONS).
const TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 };

const linha = (char = '─', n = 78) => char.repeat(n);

/** Estes scripts são de Lavras: recusam rodar numa instância marcada como outra unidade. */
function exigirLavras() {
  const unidade = (process.env.UNIT || 'lavras').toLowerCase();
  if (unidade !== 'lavras') {
    console.error(`\n❌ UNIT=${unidade}: este script é só de Lavras. Nada foi feito.\n`);
    process.exit(1);
  }
}

/** Lê o JSON gerado no PC e mostra o SHA-256, que tem de bater com o informado na geração. */
function lerArquivo(caminho, tipoEsperado) {
  if (!caminho || !fs.existsSync(caminho)) {
    console.error(`\n❌ Arquivo não encontrado: ${caminho || '(não informado)'}\n`);
    process.exit(1);
  }
  const bytes = fs.readFileSync(caminho);
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  const dados = JSON.parse(bytes.toString('utf8'));
  if (dados.tipo !== tipoEsperado || !Array.isArray(dados.itens)) {
    console.error(`\n❌ O arquivo não é do tipo "${tipoEsperado}". Nada foi feito.\n`);
    process.exit(1);
  }
  return { dados, sha };
}

/** O operador assina a auditoria e o updatedBy: tem de ser um usuário ativo do sistema. */
async function exigirOperador(prisma) {
  const email = process.env.OPERADOR_EMAIL;
  if (!email) {
    console.error('\n❌ Defina OPERADOR_EMAIL — a auditoria não pode ficar anônima.\n');
    process.exit(1);
  }
  const user = await prisma.user.findFirst({
    where: { email, deletedAt: null, active: true },
    select: { id: true, email: true, name: true },
  });
  if (!user) {
    console.error(`\n❌ OPERADOR_EMAIL ${email} não é um usuário ativo. Nada foi feito.\n`);
    process.exit(1);
  }
  return user;
}

/** FAV comparada sem espaços e sem zeros à esquerda. */
const semZeros = (valor) => String(valor ?? '').trim().replace(/^0+(?=\d)/, '');
const mesmaFav = (a, b) => semZeros(a) !== '' && semZeros(a) === semZeros(b);

module.exports = { createDbClients, TX_OPTIONS, linha, exigirLavras, lerArquivo, exigirOperador, semZeros, mesmaFav };

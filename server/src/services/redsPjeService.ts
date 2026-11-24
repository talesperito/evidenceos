// Nº REDS e Nº PJe do vestígio. Regras: docs/plans/2026-11-17-leitura-fav-reds-pje-design.md
// (P3, P4, P12, P13). As mesmas regras estão no leitor das FAVs (scripts/pcnet-leitura-fav.py) e na
// tela (client/services/redsPje.ts) — manter as três iguais.

/** REDS no padrão AAAA-NNNNNNNNN-SSS. Fora dele, a tela só avisa: o servidor NÃO recusa (P12). */
export const REDS_PADRAO = /^\d{4}-\d{9}-\d{3}$/;

/** Espaços nas pontas fora; texto vazio vira null (campo limpo). */
export const normalizeReds = (value?: string | null): string | null => {
  const trimmed = (value ?? '').trim();
  return trimmed ? trimmed : null;
};

/**
 * Dígito verificador do número único do CNJ (módulo 97). Formato NNNNNNN-DD.AAAA.J.TR.OOOO.
 * DD = 98 - ((NNNNNNN AAAA J TR OOOO 00) mod 97). BigInt: o número passa de 2^53.
 */
export const pjeDvValido = (digits: string): boolean => {
  if (!/^\d{20}$/.test(digits)) return false;
  const sequencial = digits.slice(0, 7);
  const dv = Number(digits.slice(7, 9));
  const resto = digits.slice(9);
  return dv === 98 - Number(BigInt(`${sequencial}${resto}00`) % 97n);
};

export class PjeInvalidoError extends Error {}

/**
 * PJe guardado só com os 20 dígitos (P3). Aceita com ou sem pontuação. Vazio vira null (P4: "Não
 * informado" na tela). Qualquer outra coisa é recusada com mensagem pronta para a tela.
 */
export const normalizePje = (value?: string | null): string | null => {
  const raw = (value ?? '').trim();
  if (!raw) return null;
  const digits = raw.replace(/[.\-\s]/g, '');
  if (!/^\d{20}$/.test(digits)) {
    throw new PjeInvalidoError('Nº PJe inválido: use os 20 dígitos do processo (NNNNNNN-DD.AAAA.J.TR.OOOO).');
  }
  if (!pjeDvValido(digits)) {
    throw new PjeInvalidoError('Nº PJe com dígito verificador inválido. Confira o número do processo.');
  }
  return digits;
};

/** Variantes do termo de busca para achar REDS e PJe com ou sem pontuação. */
export const searchVariants = (search: string): string[] => {
  const digits = search.replace(/\D/g, '');
  return Array.from(new Set([search.trim(), digits].filter((s) => s.length >= 3)));
};

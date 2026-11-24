// Nº REDS e Nº PJe. Regras: docs/plans/2026-11-17-leitura-fav-reds-pje-design.md (P3, P4, P12, P13).
// As mesmas regras estão no servidor (server/src/services/redsPjeService.ts) — manter iguais.

export const NAO_INFORMADO = 'Não informado';

/** REDS no padrão AAAA-NNNNNNNNN-SSS. Fora dele a tela avisa, mas deixa salvar (P12). */
export const REDS_PADRAO = /^\d{4}-\d{9}-\d{3}$/;

export const REDS_FORA_DO_PADRAO = 'REDS fora do padrão AAAA-NNNNNNNNN-SSS. Confira antes de salvar.';

export const redsForaDoPadrao = (reds: string): boolean => {
  const value = reds.trim();
  return value.length > 0 && !REDS_PADRAO.test(value);
};

/** Dígito verificador do número único do CNJ (módulo 97). */
export const pjeDvValido = (digits: string): boolean => {
  if (!/^\d{20}$/.test(digits)) return false;
  const dv = Number(digits.slice(7, 9));
  return dv === 98 - Number(BigInt(`${digits.slice(0, 7)}${digits.slice(9)}00`) % 97n);
};

export const pjeDigits = (value: string): string => value.replace(/[.\-\s]/g, '');

/** Mensagem de erro do PJe digitado, ou null se estiver vazio ou válido. */
export const validatePje = (value: string): string | null => {
  const raw = value.trim();
  if (!raw) return null;
  const digits = pjeDigits(raw);
  if (!/^\d{20}$/.test(digits)) return 'Nº PJe inválido: use os 20 dígitos do processo (NNNNNNN-DD.AAAA.J.TR.OOOO).';
  if (!pjeDvValido(digits)) return 'Nº PJe com dígito verificador inválido. Confira o número do processo.';
  return null;
};

/** NNNNNNN-DD.AAAA.J.TR.OOOO. Vazio vira "Não informado"; valor fora do formato é mostrado como está. */
export const formatPje = (value?: string | null): string => {
  const digits = pjeDigits(value || '');
  if (!digits) return NAO_INFORMADO;
  if (!/^\d{20}$/.test(digits)) return value || NAO_INFORMADO;
  return `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits[13]}.${digits.slice(14, 16)}.${digits.slice(16)}`;
};

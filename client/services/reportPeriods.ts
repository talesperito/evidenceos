// Períodos do Relatório Analítico de Custódia, calculados a partir da data de hoje (sem ano fixo no código).
// Decisão do usuário em 25/11/2026:
//  - gráfico e tabela: os 2 anos fechados anteriores (anuais) + os semestres desde o 1º semestre do ano passado até
//    o atual, que aparece marcado como parcial;
//  - comparações (card, "categorias em crescimento", top 10, cores): os 2 últimos semestres FECHADOS, porque o
//    semestre em curso está incompleto e mostraria queda falsa;
//  - alerta "Atenção": o último semestre fechado acima da média semestral do ano fechado anterior ao dele.

export interface Semestre {
  ano: number;
  s: 1 | 2;
}

/** Histórico de entradas por semestre: chave "AAAA.S" (ex.: "2026.1"). */
export type HistoricoSemestral = Record<string, number>;

export const semestreDe = (data: Date): Semestre => ({ ano: data.getFullYear(), s: data.getMonth() < 6 ? 1 : 2 });

export const chaveSemestre = ({ ano, s }: Semestre): string => `${ano}.${s}`;

/** Rótulo curto usado no relatório: "26.1". */
export const rotuloSemestre = ({ ano, s }: Semestre): string => `${String(ano).slice(-2)}.${s}`;

export const semestreAnterior = ({ ano, s }: Semestre): Semestre => (s === 2 ? { ano, s: 1 } : { ano: ano - 1, s: 2 });

export const valorSemestre = (h: HistoricoSemestral, sem: Semestre): number => h[chaveSemestre(sem)] || 0;

export const valorAno = (h: HistoricoSemestral, ano: number): number =>
  valorSemestre(h, { ano, s: 1 }) + valorSemestre(h, { ano, s: 2 });

export interface PeriodosRelatorio {
  /** Semestre em curso (incompleto). */
  atual: Semestre;
  /** Anos fechados mostrados como colunas anuais, do mais antigo para o mais recente. */
  anos: number[];
  /** Semestres mostrados um a um, do mais antigo até o atual (o último é parcial). */
  semestres: Semestre[];
  /** Último semestre fechado: é o que se compara. */
  fechado: Semestre;
  /** Semestre fechado anterior ao `fechado`. */
  anteriorAoFechado: Semestre;
  /** Ano fechado cuja média semestral serve de referência para o alerta "Atenção". */
  anoReferencia: number;
  /** Últimos 4 semestres fechados, para a mini tendência da tabela. */
  tendencia: Semestre[];
}

export function periodosRelatorio(hoje: Date): PeriodosRelatorio {
  const atual = semestreDe(hoje);
  const semestres: Semestre[] = [];
  for (let sem: Semestre = { ano: atual.ano - 1, s: 1 }; ; sem = sem.s === 1 ? { ano: sem.ano, s: 2 } : { ano: sem.ano + 1, s: 1 }) {
    semestres.push(sem);
    if (sem.ano === atual.ano && sem.s === atual.s) break;
  }
  const fechado = semestreAnterior(atual);
  const anteriorAoFechado = semestreAnterior(fechado);
  const tendencia = [semestreAnterior(semestreAnterior(anteriorAoFechado)), semestreAnterior(anteriorAoFechado), anteriorAoFechado, fechado];
  return {
    atual,
    anos: [atual.ano - 3, atual.ano - 2],
    semestres,
    fechado,
    anteriorAoFechado,
    anoReferencia: fechado.ano - 1,
    tendencia,
  };
}

/** Soma o histórico de várias categorias. */
export const somarHistoricos = (historicos: HistoricoSemestral[]): HistoricoSemestral => {
  const total: HistoricoSemestral = {};
  historicos.forEach((h) => {
    Object.entries(h).forEach(([k, v]) => {
      total[k] = (total[k] || 0) + v;
    });
  });
  return total;
};

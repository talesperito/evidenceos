import React from 'react';

export type Tone = 'crit' | 'warn' | 'ok';

const toneBg: Record<Tone, string> = {
  crit: 'bg-red-500',
  warn: 'bg-orange-400',
  ok: 'bg-cyan-500',
};

interface BigNumberProps {
  label: string;
  value: number;
  suffix?: string;
  deltaPct?: number;
  lowerIsBetter?: boolean;
  helpText?: string;
}

export const BigNumber: React.FC<BigNumberProps> = ({ label, value, suffix, deltaPct, lowerIsBetter, helpText }) => {
  const isGood = deltaPct == null ? undefined : (deltaPct < 0) === !!lowerIsBetter;
  const arrow = deltaPct == null ? '' : deltaPct > 0 ? '▲' : deltaPct < 0 ? '▼' : '■';
  const deltaColor = isGood == null ? 'text-slate-400' : isGood ? 'text-emerald-400' : 'text-red-400';

  return (
    <div className="bg-slate-800 rounded-lg p-4 border border-slate-700 print:bg-white print:border-black">
      <p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold print:text-black">{label}</p>
      <p className="mt-1 text-3xl font-bold text-white tabular-nums print:text-black">
        {value.toLocaleString('pt-BR')}
        {suffix ? <span className="text-base font-medium text-slate-400 ml-1 print:text-black">{suffix}</span> : null}
      </p>
      {deltaPct != null && (
        <p className={`mt-1 text-sm font-semibold tabular-nums ${deltaColor} print:text-black`}>
          {arrow} {Math.abs(deltaPct).toFixed(1)}% <span className="text-slate-500 font-normal print:text-black">vs. semestre anterior</span>
        </p>
      )}
      {helpText && <p className="mt-1 text-xs text-slate-500 print:text-black">{helpText}</p>}
    </div>
  );
};

export interface BarDatum {
  label: string;
  value: number;
  tone?: Tone;
}

export const HBarChart: React.FC<{ data: BarDatum[]; unit?: string; ariaLabel: string }> = ({ data, unit, ariaLabel }) => {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-2" role="img" aria-label={ariaLabel}>
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-3">
          <span
            className="w-32 sm:w-40 shrink-0 text-xs sm:text-sm text-slate-300 break-words leading-tight print:text-black"
            title={d.label}
          >
            {d.label}
          </span>
          <div className="flex-1 bg-slate-900/40 rounded h-6 relative min-w-0 print:bg-gray-100">
            <div
              className={`h-6 rounded ${toneBg[d.tone ?? 'ok']} print:opacity-100`}
              style={{ width: `${(d.value / max) * 100}%` }}
            />
            <span className="absolute right-2 top-0 h-6 flex items-center text-xs font-mono font-bold text-white/90 print:text-black">
              {d.value.toLocaleString('pt-BR')}
              {unit ? ` ${unit}` : ''}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};

export interface RangeDatum {
  label: string;
  over1: number; // >1 ano (inclui over2 e over3)
  over2: number; // >2 anos (inclui over3)
  over3: number; // >3 anos
}

/**
 * Bullet chart: as 3 faixas são cumulativas (quem está >3 anos também está >1 ano),
 * então cada uma é desenhada sobreposta na mesma trilha, não empilhada lado a lado.
 */
export const RangeBarChart: React.FC<{ data: RangeDatum[]; ariaLabel: string }> = ({ data, ariaLabel }) => {
  const max = Math.max(...data.map((d) => d.over1), 1);
  return (
    <div className="space-y-3" role="img" aria-label={ariaLabel}>
      <div className="flex items-center gap-4 text-[11px] text-slate-400 print:text-black">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-yellow-400/70" /> {'>'} 1 ano</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-orange-500" /> {'>'} 2 anos</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-600" /> {'>'} 3 anos</span>
      </div>
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-3">
          <span
            className="w-32 sm:w-40 shrink-0 text-xs sm:text-sm text-slate-300 break-words leading-tight print:text-black"
            title={d.label}
          >
            {d.label}
          </span>
          <div className="flex-1 bg-slate-900/40 rounded h-7 relative min-w-0 print:bg-gray-100">
            <div className="absolute inset-y-0 left-0 bg-yellow-400/70 rounded print:opacity-100" style={{ width: `${(d.over1 / max) * 100}%` }} />
            <div className="absolute inset-y-0 left-0 bg-orange-500 rounded print:opacity-100" style={{ width: `${(d.over2 / max) * 100}%` }} />
            <div className="absolute inset-y-0 left-0 bg-red-600 rounded print:opacity-100" style={{ width: `${(d.over3 / max) * 100}%` }} />
            <span className="absolute right-2 top-0 h-7 flex items-center gap-1.5 text-[11px] font-mono font-bold text-white/95 print:text-black">
              {d.over1}<span className="opacity-60">/{d.over2}/{d.over3}</span>
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};

export interface TrendPoint {
  label: string;
  value: number;
}

/**
 * Linha/área com rótulo de valor em cada ponto — para série temporal agregada.
 * Barra vira ruído com muitos pontos no tempo; linha mostra a trajetória de forma direta.
 */
export const TrendLineChart: React.FC<{ points: TrendPoint[]; ariaLabel: string }> = ({ points, ariaLabel }) => {
  const width = 640;
  const height = 200;
  const padTop = 28;
  const padBottom = 28;
  const padX = 8;

  const max = Math.max(...points.map((p) => p.value), 1);
  const min = 0; // eixo começa em zero: honestidade de escala
  const range = max - min || 1;
  const innerWidth = width - padX * 2;
  const step = points.length > 1 ? innerWidth / (points.length - 1) : 0;

  const coords = points.map((p, i) => {
    const x = padX + i * step;
    const y = padTop + (height - padTop - padBottom) * (1 - (p.value - min) / range);
    return { x, y, value: p.value, label: p.label };
  });

  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${coords[coords.length - 1].x.toFixed(1)},${height - padBottom} L${coords[0].x.toFixed(1)},${height - padBottom} Z`;

  const rising = coords.length > 1 && coords[coords.length - 1].value > coords[coords.length - 2].value;
  const strokeColor = rising ? 'stroke-red-500' : 'stroke-emerald-500';
  const dotColor = rising ? 'fill-red-500' : 'fill-emerald-500';

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-auto overflow-visible"
      role="img"
      aria-label={ariaLabel}
    >
      <line x1={padX} y1={height - padBottom} x2={width - padX} y2={height - padBottom} className="stroke-slate-700 print:stroke-black" strokeWidth={1} />
      <path d={areaPath} className={`${rising ? 'fill-red-500/10' : 'fill-emerald-500/10'} print:fill-transparent`} stroke="none" />
      <path d={linePath} fill="none" strokeWidth={2.5} className={`${strokeColor} print:stroke-black`} />
      {coords.map((c) => (
        <g key={c.label}>
          <circle cx={c.x} cy={c.y} r={4} className={`${dotColor} print:fill-black`} />
          <text x={c.x} y={c.y - 10} textAnchor="middle" className="fill-white text-[11px] font-mono font-bold print:fill-black">
            {c.value.toLocaleString('pt-BR')}
          </text>
          <text x={c.x} y={height - padBottom + 16} textAnchor="middle" className="fill-slate-400 text-[10px] font-medium print:fill-black">
            {c.label}
          </text>
        </g>
      ))}
    </svg>
  );
};

export const Heatmap: React.FC<{ rows: string[]; cols: string[]; cells: number[][]; ariaLabel: string }> = ({
  rows,
  cols,
  cells,
  ariaLabel,
}) => {
  const max = Math.max(...cells.flat(), 1);
  const tone = (v: number) => {
    const t = v / max;
    if (v === 0) return 'bg-slate-800 text-slate-600 print:bg-white print:text-slate-400';
    if (t > 0.66) return 'bg-red-500/80 text-white print:bg-red-100 print:text-black';
    if (t > 0.33) return 'bg-orange-400/80 text-black print:bg-orange-100 print:text-black';
    return 'bg-yellow-400/70 text-black print:bg-yellow-100 print:text-black';
  };
  return (
    <table className="border-collapse text-xs w-full" role="img" aria-label={ariaLabel}>
      <thead>
        <tr>
          <th className="text-left p-1 text-slate-400 font-medium print:text-black">Categoria</th>
          {cols.map((c) => (
            <th key={c} className="p-1 text-slate-400 font-medium text-center print:text-black">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={row}>
            <td className="p-1 pr-2 text-slate-300 whitespace-nowrap print:text-black">{row}</td>
            {cols.map((_, j) => (
              <td
                key={j}
                className={`h-9 text-center font-mono font-bold rounded ${tone(cells[i][j])} print:border print:border-black`}
              >
                {cells[i][j] || ''}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

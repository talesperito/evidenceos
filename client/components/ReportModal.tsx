
import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ReportData, CategoryStats } from '../types';
import { XIcon } from './icons/XIcon';
import { PrinterIcon } from './icons/PrinterIcon';
import { BigNumber, HBarChart, RangeBarChart, TrendLineChart, BarDatum } from './charts/ReportCharts';

interface ReportModalProps {
  reportData: ReportData;
  onClose: () => void;
}

const ReportModal: React.FC<ReportModalProps> = ({ reportData, onClose }) => {
  const [showCriticalOnly, setShowCriticalOnly] = useState(true); // Padrão: Só mostra o que é problema
  const [showFullTable, setShowFullTable] = useState(false); // Tabela detalhada colapsada na tela; sempre visível no PDF (ver print:block abaixo)

  const formatDate = (date: Date | null) => {
    return date ? date.toLocaleDateString('pt-BR') : 'N/A';
  };

  const handlePrint = () => {
    window.print();
  };

  // Processamento dos dados da tabela Passivo: Filtro, Ordenação e Totais
  const { sortedRows, totals } = useMemo(() => {
    const rows = (Object.entries(reportData.byCategory) as [string, CategoryStats][])
      .filter(([, stats]) => stats.missingReqOver1Year > 0); // Filtra quem tem pendência > 1 ano

    rows.sort(([, a], [, b]) => {
      if (b.missingReqOver3Years !== a.missingReqOver3Years) return b.missingReqOver3Years - a.missingReqOver3Years;
      if (b.missingReqOver2Years !== a.missingReqOver2Years) return b.missingReqOver2Years - a.missingReqOver2Years;
      return b.missingReqOver1Year - a.missingReqOver1Year;
    });

    const calculatedTotals = rows.reduce((acc, [, stats]) => ({
      over1: acc.over1 + stats.missingReqOver1Year,
      over2: acc.over2 + stats.missingReqOver2Years,
      over3: acc.over3 + stats.missingReqOver3Years
    }), { over1: 0, over2: 0, over3: 0 });

    return { sortedRows: rows, totals: calculatedTotals };
  }, [reportData.byCategory]);

  // Processamento da Evolução Temporal com Filtro Inteligente
  const evolutionRows = useMemo(() => {
    const rows = (Object.entries(reportData.byCategory) as [string, CategoryStats][]).map(([category, stats]) => {
      const h = stats.history;
      const current = h.y2025_s2;
      const prev = h.y2025_s1;
      const avg2024 = (h.y2024_s1 + h.y2024_s2) / 2;

      let criticalityScore = 0;

      if (current === 0 && prev === 0 && avg2024 === 0) {
        criticalityScore = 0;
      } else if (current > prev) {
        criticalityScore = 3; // Vermelho
      } else if (current > avg2024) {
        criticalityScore = 2; // Laranja
      } else {
        criticalityScore = 1; // Verde
      }

      return { category, stats, criticalityScore };
    });

    const filteredRows = rows.filter(row => {
      if (row.criticalityScore === 0) return false;
      if (showCriticalOnly && row.criticalityScore === 1) return false;
      return true;
    });

    return filteredRows.sort((a, b) => {
      if (b.criticalityScore !== a.criticalityScore) return b.criticalityScore - a.criticalityScore;
      return b.stats.total - a.stats.total;
    });
  }, [reportData.byCategory, showCriticalOnly]);

  // KPIs agregados: resposta direta às perguntas "o passivo está crescendo?" e "quanto falta requisição?"
  const { aggregateHistory, globalDeltaPct, criticalCategoryCount } = useMemo(() => {
    const agg = { y2022: 0, y2023: 0, y2024_s1: 0, y2024_s2: 0, y2025_s1: 0, y2025_s2: 0 };
    (Object.values(reportData.byCategory) as CategoryStats[]).forEach((stats) => {
      agg.y2022 += stats.history.y2022;
      agg.y2023 += stats.history.y2023;
      agg.y2024_s1 += stats.history.y2024_s1;
      agg.y2024_s2 += stats.history.y2024_s2;
      agg.y2025_s1 += stats.history.y2025_s1;
      agg.y2025_s2 += stats.history.y2025_s2;
    });
    const delta = agg.y2025_s1 > 0 ? ((agg.y2025_s2 - agg.y2025_s1) / agg.y2025_s1) * 100 : 0;
    const criticalCount = (Object.values(reportData.byCategory) as CategoryStats[]).filter((stats) => {
      const h = stats.history;
      return h.y2025_s2 > h.y2025_s1;
    }).length;
    return { aggregateHistory: agg, globalDeltaPct: delta, criticalCategoryCount: criticalCount };
  }, [reportData.byCategory]);

  // Destaques (substitui a antiga grade de cards repetidos por 2 insights acionáveis)
  const highlights = useMemo(() => {
    const entries = Object.entries(reportData.byCategory) as [string, CategoryStats][];

    const worstMissingReq = entries
      .filter(([, stats]) => stats.total >= 10)
      .reduce<{ category: string; pct: number; count: number; total: number } | null>((worst, [category, stats]) => {
        const pct = (stats.missingRequisition / stats.total) * 100;
        if (!worst || pct > worst.pct) return { category, pct, count: stats.missingRequisition, total: stats.total };
        return worst;
      }, null);

    const oldest = entries.reduce<{ category: string; date: Date } | null>((acc, [category, stats]) => {
      if (!stats.oldestItemDate) return acc;
      if (!acc || stats.oldestItemDate < acc.date) return { category, date: stats.oldestItemDate };
      return acc;
    }, null);

    return { worstMissingReq, oldest };
  }, [reportData.byCategory]);

  const topCriticalBars: BarDatum[] = reportData.topCritical.map((item) => ({
    label: item.category,
    value: item.count,
    tone: 'ok',
  }));

  // Ordenado por volume (quem concentra mais itens agora), não por trajetória: uma categoria
  // gigante em leve queda ainda é mais urgente que uma pequena em alta. Vermelho = concentra
  // boa parte do volume entre as categorias em alerta; laranja = em alerta, mas volume menor.
  const topMovers = [...evolutionRows]
    .sort((a, b) => b.stats.history.y2025_s2 - a.stats.history.y2025_s2)
    .slice(0, 10);
  const topMoversMax = Math.max(...topMovers.map((m) => m.stats.history.y2025_s2), 1);
  const topMoversBars: BarDatum[] = topMovers.map(({ category, stats }) => ({
    label: category,
    value: stats.history.y2025_s2,
    tone: stats.history.y2025_s2 / topMoversMax >= 0.3 ? 'crit' : 'warn',
  }));

  const rangeBarData = sortedRows.map(([category, stats]) => ({
    label: category,
    over1: stats.missingReqOver1Year,
    over2: stats.missingReqOver2Years,
    over3: stats.missingReqOver3Years,
  })); // todas as categorias com pendência, já ordenadas por severidade

  return createPortal(
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200 fixed-backdrop no-print-backdrop">
      <div
        id="report-modal-container"
        className="bg-slate-900 rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col border border-slate-700"
      >

        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-slate-700 bg-slate-800/50 rounded-t-xl print:bg-transparent print:border-b-2 print:border-black">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2 print:text-black">
              📊 Relatório Analítico de Custódia
            </h2>
            <p className="text-sm text-slate-400 mt-1 print:text-black">
              Gerado em: {reportData.generatedAt} | Total de Vestígios: <span className="text-cyan-400 font-bold print:text-black">{reportData.totalGlobal}</span>
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white transition-colors no-print">
            <XIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-8 custom-scrollbar print:overflow-visible print:h-auto">

          {/* Section: KPIs Principais */}
          <section className="print:mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 print:grid-cols-3">
              <BigNumber
                label="Passivo sem requisição (> 1 ano)"
                value={totals.over1}
                suffix="itens"
                helpText={`${((totals.over1 / reportData.totalGlobal) * 100).toFixed(1)}% do total de ${reportData.totalGlobal} vestígios`}
              />
              <BigNumber
                label="Entradas 25.2 vs. 25.1"
                value={aggregateHistory.y2025_s2}
                suffix="itens"
                deltaPct={globalDeltaPct}
                lowerIsBetter
              />
              <BigNumber
                label="Categorias em crescimento"
                value={criticalCategoryCount}
                suffix="categorias"
                helpText="Entrada do último semestre maior que o anterior"
              />
            </div>
          </section>

          {/* Section: Tendência Geral (linha agregada — trajetória histórica do total de entradas) */}
          <section className="bg-slate-800/50 p-6 rounded-lg border border-slate-700/80 print:bg-white print:border-none print:p-0 print:mb-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2 print:text-black">
              <span className="bg-cyan-500/10 text-cyan-400 p-1 rounded print:hidden">📉</span> Tendência Geral de Entrada (Total, todas as categorias)
            </h3>
            <TrendLineChart
              points={[
                { label: '2022', value: aggregateHistory.y2022 },
                { label: '2023', value: aggregateHistory.y2023 },
                { label: '24.1', value: aggregateHistory.y2024_s1 },
                { label: '24.2', value: aggregateHistory.y2024_s2 },
                { label: '25.1', value: aggregateHistory.y2025_s1 },
                { label: '25.2', value: aggregateHistory.y2025_s2 },
              ]}
              ariaLabel="Trajetória do total de entradas de vestígios por período, de 2022 até o semestre 25.2"
            />
          </section>

          {/* Section: Top 5 Critical */}
          <section className="print:mb-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2 print:text-black">
              <span className="bg-red-500/10 text-red-400 p-1 rounded print:hidden">🔥</span> Top 5 Categorias Críticas (Volume Total)
            </h3>
            <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700/80 print:bg-white print:border-none print:p-0">
              <HBarChart data={topCriticalBars} unit="itens" ariaLabel="Top 5 categorias por volume total de vestígios" />
            </div>
          </section>

          {/* Section: Evolução Temporal */}
          <section className="bg-slate-800/50 p-6 rounded-lg border border-slate-700/80 print:bg-white print:border-none print:p-0">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-4 gap-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2 print:text-black">
                <span className="bg-blue-500/10 text-blue-400 p-1 rounded print:hidden">📈</span> Evolução Temporal de Entrada
              </h3>

              <label className="flex items-center cursor-pointer select-none bg-slate-900/50 px-3 py-1.5 rounded-lg border border-slate-700 hover:border-slate-500 transition-colors no-print">
                <div className="relative">
                  <input type="checkbox" className="sr-only" checked={showCriticalOnly} onChange={() => setShowCriticalOnly(!showCriticalOnly)} />
                  <div className={`block w-10 h-6 rounded-full transition-colors ${showCriticalOnly ? 'bg-red-500/80' : 'bg-slate-600'}`}></div>
                  <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${showCriticalOnly ? 'translate-x-4' : ''}`}></div>
                </div>
                <div className="ml-3 text-xs font-medium text-slate-300">
                  {showCriticalOnly ? 'Exibindo Apenas Críticos' : 'Exibindo Todos'}
                </div>
              </label>
            </div>

            <div className="flex flex-col gap-2 mb-4">
              <div className="flex flex-wrap items-center gap-4 text-xs bg-slate-900/40 p-2 rounded border border-slate-700/50 w-fit print:bg-transparent print:border-none print:p-0">
                <span className="text-slate-400 font-bold uppercase tracking-wide print:text-black">Legenda Tendência:</span>
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-500"></span><span className="text-slate-300 print:text-black">Crescimento</span></div>
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-orange-400"></span><span className="text-slate-300 print:text-black">Atenção</span></div>
                {!showCriticalOnly && <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500"></span><span className="text-slate-300 print:text-black">Redução</span></div>}
              </div>
            </div>

            {/* Gráfico: categorias em alerta (crescendo ou ainda acima da média 2024), ordenadas por volume */}
            <div className="mb-6">
              <h4 className="text-xs uppercase tracking-wide font-bold text-slate-400 mb-2 print:text-black">
                Top 10 categorias em alerta, por volume (semestre 25.2)
              </h4>
              <HBarChart data={topMoversBars} unit="itens" ariaLabel="Top 10 categorias em alerta ordenadas por volume, vermelho para maior concentração" />
            </div>

            {/* Tabela detalhada (mantida sempre no PDF para rastreabilidade/auditoria; colapsável só na tela) */}
            <button
              onClick={() => setShowFullTable((v) => !v)}
              className="no-print text-xs font-bold uppercase tracking-wide text-slate-400 hover:text-slate-200 mb-3 select-none"
            >
              {showFullTable ? 'Ocultar' : 'Ver'} tabela completa por semestre {showFullTable ? '▴' : '▾'}
            </button>
            <div className={`${showFullTable ? 'block' : 'hidden'} print:block overflow-x-auto rounded-lg border border-slate-700 print:overflow-visible print:border-none mt-3`}>
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-900/50 border-b border-slate-700 text-slate-400 text-xs uppercase tracking-wider print:bg-gray-100 print:text-black">
                      <th className="p-3 font-semibold">Categoria</th>
                      <th className="p-3 font-semibold text-center bg-slate-800/30 border-l border-slate-700 print:text-black">2022</th>
                      <th className="p-3 font-semibold text-center bg-slate-800/30 border-l border-slate-700 print:text-black">2023</th>
                      <th className="p-3 font-semibold text-center border-l border-slate-700 text-cyan-200 bg-cyan-900/10 print:text-black">24.1</th>
                      <th className="p-3 font-semibold text-center text-cyan-200 bg-cyan-900/10 print:text-black">24.2</th>
                      <th className="p-3 font-semibold text-center border-l border-slate-700 text-green-200 bg-green-900/10 print:text-black">25.1</th>
                      <th className="p-3 font-semibold text-center text-green-200 bg-green-900/10 print:text-black">25.2</th>
                      <th className="p-3 font-semibold text-center border-l border-slate-700 w-32 bg-slate-900 print:bg-gray-100 print:text-black">Tendência</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50 bg-slate-800 print:bg-transparent">
                    {evolutionRows.map(({ category, stats }) => {
                      const h = stats.history;
                      const trendValues = [h.y2024_s1, h.y2024_s2, h.y2025_s1, h.y2025_s2];
                      const maxVal = Math.max(...trendValues, 1);
                      const avg2024 = (h.y2024_s1 + h.y2024_s2) / 2;
                      return (
                        <tr key={category} className="hover:bg-slate-700/30 transition-colors text-sm print:text-black">
                          <td className="p-3 font-medium text-slate-200 print:text-black">{category}</td>
                          <td className="p-3 text-center text-slate-600 border-l border-slate-700/50 print:text-black">{h.y2022}</td>
                          <td className="p-3 text-center text-slate-600 border-l border-slate-700/50 print:text-black">{h.y2023}</td>
                          <td className="p-3 text-center text-slate-400 border-l border-slate-700/50 print:text-black">{h.y2024_s1}</td>
                          <td className="p-3 text-center text-slate-400 print:text-black">{h.y2024_s2}</td>
                          <td className="p-3 text-center font-bold text-slate-300 border-l border-slate-700/50 print:text-black">{h.y2025_s1}</td>
                          <td className="p-3 text-center font-bold text-white print:text-black">{h.y2025_s2}</td>
                          <td className="p-3 border-l border-slate-700 bg-slate-900/30 align-bottom print:bg-transparent">
                            <div className="flex items-end gap-1 h-8 pb-1 justify-center">
                              {trendValues.map((val, idx) => {
                                const hP = Math.max((val / maxVal) * 100, 15);
                                const isL = idx === trendValues.length - 1;
                                let color = 'bg-slate-600';
                                if (isL) {
                                  const prev = trendValues[idx - 1] || 0;
                                  if (val > prev) color = 'bg-red-500';
                                  else if (val > avg2024) color = 'bg-orange-400';
                                  else color = 'bg-emerald-500';
                                }
                                return <div key={idx} className={`w-2 rounded-t transition-all ${color} ${!isL ? 'opacity-40' : ''}`} style={{ height: `${hP}%` }}></div>;
                              })}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
            </div>
          </section>

          {/* Section: Passivo Sem Requisição */}
          <section className="bg-slate-800/50 p-6 rounded-lg border border-slate-700/80 print:bg-white print:border-none print:p-0 print:mt-6">
            <h3 className="text-lg font-semibold text-white mb-1 flex items-center gap-2 print:text-black">
              <span className="bg-amber-500/10 text-amber-400 p-1 rounded print:hidden">⚠️</span> Passivo Sem Requisição (Alvos de Descarte)
            </h3>
            <p className="text-xs text-slate-500 mb-4 print:text-black">
              Todas as {rangeBarData.length} categorias com pendência, ordenadas por severidade. Os números são cumulativos: quem está há mais de 3 anos também conta em "&gt;1 ano".
            </p>
            <div className="overflow-y-auto max-h-[420px] print:max-h-none print:overflow-visible pr-2">
              <RangeBarChart
                data={rangeBarData}
                ariaLabel="Passivo sem requisição por categoria, faixas de mais de 1, 2 e 3 anos sobrepostas"
              />
            </div>
            <div className="flex gap-6 mt-4 pt-4 border-t border-slate-700/50 text-sm print:border-black/20">
              <span className="text-slate-400 print:text-black">Total geral (todas as categorias):</span>
              <span className="text-yellow-500 font-mono font-bold print:text-black">{totals.over1} &gt;1 ano</span>
              <span className="text-orange-500 font-mono font-bold print:text-black">{totals.over2} &gt;2 anos</span>
              <span className="text-red-500 font-mono font-bold print:text-black">{totals.over3} &gt;3 anos</span>
            </div>
          </section>

          {/* Section: Destaques (substitui a antiga grade de cards por categoria) */}
          <section className="print:break-inside-avoid print:mt-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2 print:text-black">
              <span className="bg-blue-500/10 text-blue-400 p-1 rounded print:hidden">📋</span> Destaques
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {highlights.worstMissingReq && (
                <BigNumber
                  label="Maior concentração sem requisição"
                  value={Math.round(highlights.worstMissingReq.pct)}
                  suffix="%"
                  helpText={`${highlights.worstMissingReq.category} — ${highlights.worstMissingReq.count} de ${highlights.worstMissingReq.total} itens`}
                />
              )}
              {highlights.oldest && (
                <div className="bg-slate-800 rounded-lg p-4 border border-slate-700 print:bg-white print:border-black">
                  <p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold print:text-black">Vestígio mais antigo em custódia</p>
                  <p className="mt-1 text-3xl font-bold text-white tabular-nums print:text-black">{formatDate(highlights.oldest.date)}</p>
                  <p className="mt-1 text-xs text-slate-500 print:text-black">{highlights.oldest.category}</p>
                </div>
              )}
            </div>
          </section>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-700 bg-slate-800/50 rounded-b-xl text-right flex justify-end gap-3 no-print">
          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-slate-700 text-white font-semibold rounded-md hover:bg-slate-600 transition-colors hidden sm:inline-flex items-center gap-2"
          >
            <PrinterIcon className="w-5 h-5" />
            Imprimir / Salvar PDF
          </button>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-cyan-600 text-white font-semibold rounded-md hover:bg-cyan-700 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ReportModal;

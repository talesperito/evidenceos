
import React, { useMemo, useState } from 'react';
import { ReportData, CategoryStats } from '../types';
import { XIcon } from './icons/XIcon';
import { PrinterIcon } from './icons/PrinterIcon';

interface ReportModalProps {
  reportData: ReportData;
  onClose: () => void;
}

const ReportModal: React.FC<ReportModalProps> = ({ reportData, onClose }) => {
  const [showCriticalOnly, setShowCriticalOnly] = useState(true); // Padrão: Só mostra o que é problema

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

  return (
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

          {/* Section: Top 5 Critical */}
          <section className="print:mb-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2 print:text-black">
              <span className="bg-red-500/10 text-red-400 p-1 rounded print:hidden">🔥</span> Top 5 Categorias Críticas (Volume Total)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 print:grid-cols-5">
              {reportData.topCritical.map((item, index) => (
                <div key={item.category} className="bg-slate-800 p-4 rounded-lg border border-slate-700 relative overflow-hidden group print:bg-white print:border-black">
                  <div className="absolute top-0 right-0 p-2 opacity-10 text-6xl font-black group-hover:opacity-20 transition-opacity select-none print:opacity-20 print:text-black">
                    {index + 1}
                  </div>
                  <h4 className="text-sm text-slate-400 uppercase font-bold tracking-wider truncate print:text-black" title={item.category}>
                    {item.category}
                  </h4>
                  <p className="text-3xl font-bold text-white mt-2 print:text-black">{item.count}</p>
                </div>
              ))}
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

            <div className="overflow-x-auto rounded-lg border border-slate-700 print:overflow-visible print:border-none">
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
                        <td className="p-3 font-medium text-slate-200 truncate print:text-black">{category}</td>
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
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2 print:text-black">
              <span className="bg-amber-500/10 text-amber-400 p-1 rounded print:hidden">⚠️</span> Passivo Sem Requisição (Alvos de Descarte)
            </h3>
            <div className="overflow-x-auto rounded-lg border border-slate-700 print:overflow-visible print:border-none">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900/50 border-b border-slate-700 text-slate-400 text-xs uppercase tracking-wider print:bg-gray-100 print:text-black">
                    <th className="p-3 font-semibold">Categoria / Origem</th>
                    <th className="p-3 font-semibold text-center text-yellow-500 border-l border-slate-700 print:text-black">{'>'} 1 Ano</th>
                    <th className="p-3 font-semibold text-center text-orange-500 border-l border-slate-700 print:text-black">{'>'} 2 Anos</th>
                    <th className="p-3 font-semibold text-center text-red-500 border-l border-slate-700 print:text-black">{'>'} 3 Anos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50 bg-slate-800 print:bg-transparent">
                  {sortedRows.map(([category, stats]) => (
                    <tr key={category} className="hover:bg-slate-700/30 transition-colors print:text-black">
                      <td className="p-3 font-medium text-slate-200 print:text-black">{category}</td>
                      <td className="p-3 text-center border-l border-slate-700/50 print:text-black">{stats.missingReqOver1Year}</td>
                      <td className="p-3 text-center border-l border-slate-700/50 print:text-black">{stats.missingReqOver2Years}</td>
                      <td className="p-3 text-center border-l border-slate-700/50 print:text-black font-bold text-red-400">{stats.missingReqOver3Years}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-900/80 border-t-2 border-slate-600 font-bold print:bg-gray-100 print:text-black">
                    <td className="p-3 text-right text-slate-400 text-xs uppercase print:text-black">Total Geral:</td>
                    <td className="p-3 text-center text-yellow-500 border-l border-slate-700 font-mono text-lg print:text-black">{totals.over1}</td>
                    <td className="p-3 text-center text-orange-500 border-l border-slate-700 font-mono text-lg print:text-black">{totals.over2}</td>
                    <td className="p-3 text-center text-red-500 border-l border-slate-700 font-mono text-lg print:text-black">{totals.over3}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Section: Visão Geral por Categoria (EXPANDIDA) */}
          <section className="print:break-inside-avoid">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2 print:text-black print:mt-10">
              <span className="bg-blue-500/10 text-blue-400 p-1 rounded print:hidden">📋</span> Radiografia por Categoria (Métricas Completas)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 print:grid-cols-2">
              {(Object.entries(reportData.byCategory) as [string, CategoryStats][])
                .sort(([, a], [, b]) => b.total - a.total)
                .filter(([category]) => {
                  if (!showCriticalOnly) return true;
                  const stats = reportData.byCategory[category];
                  const h = stats.history;
                  return (h.y2025_s2 > h.y2025_s1) || (h.y2025_s2 > (h.y2024_s1 + h.y2024_s2) / 2);
                })
                .map(([category, stats]) => (
                  <div key={category} className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden print:bg-white print:border-black print:break-inside-avoid flex flex-col">
                    <div className="bg-slate-700/50 p-4 border-b border-slate-700 flex justify-between items-center print:bg-gray-100 print:border-black">
                      <h4 className="font-bold text-white truncate pr-2 print:text-black" title={category}>{category}</h4>
                      <span className="bg-cyan-600 text-white text-xs px-2.5 py-1 rounded-full font-bold shadow-lg print:bg-white print:text-black print:border print:border-black">
                        {stats.total} total
                      </span>
                    </div>

                    <div className="p-4 space-y-4 flex-grow">
                      {/* Linha: Sem Requisição */}
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-400 print:text-black">Sem Requisição:</span>
                        <div className="flex flex-col items-end">
                          <span className={`text-lg font-bold ${stats.missingRequisition > 0 ? 'text-amber-400' : 'text-slate-500'} print:text-black`}>
                            {stats.missingRequisition}
                          </span>
                          <span className="text-[10px] text-slate-500">{((stats.missingRequisition / stats.total) * 100).toFixed(1)}% do total</span>
                        </div>
                      </div>

                      <div className="h-px bg-slate-700/50 print:bg-black/20"></div>

                      {/* Linha: Prazos de Custódia */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-900/40 p-2 rounded border border-slate-700/30 print:bg-transparent print:border-black/10">
                          <span className="text-[10px] text-slate-500 uppercase font-bold block mb-1">Passivo {'>'} 1 Ano</span>
                          <span className={`text-sm font-bold ${stats.over1Year > 0 ? 'text-yellow-200' : 'text-slate-600'} print:text-black`}>
                            {stats.over1Year} itens
                          </span>
                        </div>
                        <div className="bg-slate-900/40 p-2 rounded border border-slate-700/30 print:bg-transparent print:border-black/10">
                          <span className="text-[10px] text-slate-500 uppercase font-bold block mb-1">Passivo {'>'} 2 Anos</span>
                          <span className={`text-sm font-bold ${stats.over2Years > 0 ? 'text-red-400' : 'text-slate-600'} print:text-black`}>
                            {stats.over2Years} itens
                          </span>
                        </div>
                      </div>

                      <div className="h-px bg-slate-700/50 print:bg-black/20"></div>

                      {/* Linha: Item Mais Antigo */}
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500 print:text-black">Vestígio mais antigo:</span>
                        <span className="font-mono text-cyan-300 font-bold bg-slate-900 px-2 py-0.5 rounded print:bg-transparent print:text-black">
                          {formatDate(stats.oldestItemDate)}
                        </span>
                      </div>
                    </div>

                    {/* Footer do Card com indicador de tendência (Cor discreta) */}
                    <div className={`h-1 w-full ${stats.history.y2025_s2 > stats.history.y2025_s1 ? 'bg-red-500' :
                        stats.history.y2025_s2 > (stats.history.y2024_s1 + stats.history.y2024_s2) / 2 ? 'bg-orange-400' : 'bg-emerald-500'
                      } print:hidden`}></div>
                  </div>
                ))}
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
    </div>
  );
};

export default ReportModal;

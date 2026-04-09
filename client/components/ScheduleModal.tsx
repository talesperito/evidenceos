
import React, { useState } from 'react';
import { Vestige } from '../types';
import { XIcon } from './icons/XIcon';
import { CalendarIcon } from './icons/CalendarIcon';
import { ExclamationCircleIcon } from './icons/ExclamationCircleIcon'; // Assumindo existência ou usando SVG inline se necessário

interface ScheduleModalProps {
  vestiges: Vestige[];
  onClose: () => void;
}

const REASONS = [
  'Destruição',
  'Restituição',
  'Análise pela Investigação',
  'Solicitação Judicial',
  'Outros'
];

const ScheduleModal: React.FC<ScheduleModalProps> = ({ vestiges, onClose }) => {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  // Estado para armazenar o motivo de cada vestígio (Chave: ID do vestígio)
  const [selectedReasons, setSelectedReasons] = useState<Record<string, string>>({});
  // Estado para armazenar o texto customizado de "Outros" (Chave: ID do vestígio)
  const [customReasonTexts, setCustomReasonTexts] = useState<Record<string, string>>({});

  const isBulk = vestiges.length > 1;

  // Helper para aplicar motivo a todos (Usabilidade)
  const handleApplyToAll = (reason: string) => {
    const newReasons: Record<string, string> = {};
    vestiges.forEach(v => {
        newReasons[v.id] = reason;
    });
    setSelectedReasons(newReasons);
    
    // Limpa os textos customizados se mudar para algo que não seja Outros
    if (reason !== 'Outros') {
        setCustomReasonTexts({});
    }
  };

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!date || !time) {
        setError("Por favor, selecione data e hora para o agendamento.");
        return;
    }

    // --- VALIDAÇÃO DE 24 HORAS ---
    const selectedDateTime = new Date(`${date}T${time}`);
    const now = new Date();
    // Adiciona 24 horas ao tempo atual
    const minimumAllowedTime = new Date(now.getTime() + (24 * 60 * 60 * 1000));

    if (selectedDateTime < minimumAllowedTime) {
        setError("ERRO: Agendamento bloqueado. É necessária antecedência mínima de 24h. Para urgências, contate a administração da URC.");
        return;
    }
    // -----------------------------

    // Validação: Verifica se todos os itens têm motivo
    const missingReason = vestiges.some(v => !selectedReasons[v.id]);
    if (missingReason) {
        setError("Atenção: É obrigatório informar o motivo da retirada para TODOS os itens da lista.");
        return;
    }

    // Validação: Verifica se "Outros" tem texto preenchido
    const missingCustomText = vestiges.some(v => selectedReasons[v.id] === 'Outros' && !customReasonTexts[v.id]?.trim());
    if (missingCustomText) {
        setError("Para motivos classificados como 'Outros', é obrigatório digitar a justificativa.");
        return;
    }

    const startDateTime = selectedDateTime;
    const endDateTime = new Date(startDateTime.getTime() + 30 * 60000); 

    const formatGCalDate = (dateObj: Date) => {
        return dateObj.toISOString().replace(/-|:|\.\d\d\d/g, "");
    };

    // Título dinâmico do evento
    const titleText = isBulk 
      ? `Retirada de ${vestiges.length} Vestígios - URC`
      : `Retirada de Vestígio - FAV: ${vestiges[0].fav}`;

    const title = encodeURIComponent(titleText);

    // Corpo da mensagem com lista de itens E MOTIVOS DETALHADOS
    const itemsList = vestiges.map(v => {
      const reason = selectedReasons[v.id];
      const finalReason = reason === 'Outros' 
        ? `Outros: ${customReasonTexts[v.id] || ''}` 
        : reason;

      return `---
MATERIAL: ${v.material}
FAV: ${v.fav}
REQUISIÇÃO: ${v.requisicao} | INVÓLUCRO: ${v.involucro}
MOTIVO DA SAÍDA: ${finalReason}`;
    }).join('\n');

    const detailsText = `Solicitação de Retirada ${isBulk ? 'em Lote' : ''}

MUNICÍPIO(S): ${Array.from(new Set(vestiges.map(v => v.municipio))).join(', ')}

LISTA DE ITENS E MOTIVOS:
${itemsList}

OBSERVAÇÕES GERAIS:
${notes || 'Nenhuma observação.'}

--
Gerado pelo Sistema de Controle de Vestígios URC Lavras`;

    const details = encodeURIComponent(detailsText);
    const location = encodeURIComponent("URC Lavras/MG - Unidade Regional de Custódia");
    const emails = encodeURIComponent("pericia.lavras@gmail.com");

    const gCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${formatGCalDate(startDateTime)}/${formatGCalDate(endDateTime)}&details=${details}&location=${location}&add=${emails}`;

    window.open(gCalUrl, '_blank');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden">
        
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-white/5 bg-zinc-800/50 shrink-0">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <div className="bg-amber-500/20 p-1.5 rounded-lg text-amber-500">
                <CalendarIcon className="w-5 h-5" />
            </div>
            {isBulk ? `Agendar Retirada (${vestiges.length} itens)` : 'Agendar Retirada'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-zinc-400 hover:text-white transition-colors">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleConfirm} className="flex flex-col flex-grow overflow-hidden bg-zinc-900/50">
            
            {/* Aviso Informativo (Azul/Neutro) */}
            <div className="px-6 pt-6 shrink-0">
                <div className="bg-blue-500/10 border border-blue-500/20 p-3 rounded-lg flex gap-3 items-start">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                    <p className="text-sm text-blue-200">
                        O motivo da retirada é obrigatório. O agendamento deve respeitar <strong>antecedência mínima de 24h</strong>.
                    </p>
                </div>
            </div>

            {/* Lista de Itens com Seleção de Motivo */}
            <div className="px-6 py-4 flex-grow overflow-y-auto custom-scrollbar">
                <div className="flex justify-between items-center mb-2 sticky top-0 bg-zinc-900 z-10 py-2 border-b border-white/5">
                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">
                        Itens e Motivos <span className="text-red-400" title="Obrigatório">*</span>
                    </label>
                    {isBulk && (
                        <select 
                            className="text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-amber-500 focus:border-amber-500 outline-none cursor-pointer hover:bg-zinc-700 transition-colors font-medium"
                            onChange={(e) => handleApplyToAll(e.target.value)}
                            defaultValue=""
                        >
                            <option value="" disabled>Aplicar motivo a todos...</option>
                            {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                    )}
                </div>

                <div className="space-y-3">
                  {vestiges.map(v => (
                    <div key={v.id} className="bg-white/5 p-3 rounded-lg border border-white/5 flex flex-col sm:flex-row gap-3 items-start sm:items-center hover:border-white/10 transition-colors">
                        <div className="flex-grow min-w-0">
                            <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold text-white truncate">{v.material}</p>
                                {!selectedReasons[v.id] && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" title="Motivo pendente"></span>
                                )}
                            </div>
                            <p className="text-xs text-zinc-500 font-mono mt-0.5">FAV: {v.fav} | Inv: {v.involucro}</p>
                        </div>
                        
                        <div className="flex flex-col gap-2 w-full sm:w-auto shrink-0">
                            <select
                                required
                                value={selectedReasons[v.id] || ''}
                                onChange={(e) => setSelectedReasons(prev => ({...prev, [v.id]: e.target.value}))}
                                className={`bg-black/40 border rounded-lg px-2 py-1.5 text-white text-xs focus:ring-1 outline-none w-full sm:w-40 transition-colors ${
                                    !selectedReasons[v.id] 
                                    ? 'border-red-900/50 focus:border-red-500 focus:ring-red-500/50' 
                                    : 'border-zinc-700 focus:border-amber-500 focus:ring-amber-500/50'
                                }`}
                            >
                                <option value="" disabled>Selecione o motivo...</option>
                                {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>

                            {selectedReasons[v.id] === 'Outros' && (
                                <input 
                                    type="text"
                                    maxLength={20}
                                    required
                                    placeholder="Justificativa (máx 20)"
                                    value={customReasonTexts[v.id] || ''}
                                    onChange={(e) => setCustomReasonTexts(prev => ({...prev, [v.id]: e.target.value}))}
                                    className="bg-black/40 border border-zinc-700 rounded-lg px-2 py-1.5 text-white text-xs focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none w-full sm:w-40 animate-in fade-in slide-in-from-top-1"
                                    autoFocus
                                />
                            )}
                        </div>
                    </div>
                  ))}
                </div>
            </div>

            {/* Configuração de Data/Hora e Footer */}
            <div className="p-6 pt-4 bg-zinc-900 border-t border-white/5 shrink-0 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1.5">
                            Data <span className="text-red-400">*</span>
                        </label>
                        <input 
                            type="date" 
                            required
                            min={new Date().toISOString().split('T')[0]} // Impede selecionar datas passadas visualmente
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 outline-none transition-all"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1.5">
                            Horário <span className="text-red-400">*</span>
                        </label>
                        <input 
                            type="time" 
                            required
                            value={time}
                            onChange={(e) => setTime(e.target.value)}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 outline-none transition-all"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Observações Gerais (Opcional)</label>
                    <textarea 
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Observações que se aplicam a todo o agendamento..."
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 outline-none h-16 resize-none"
                    ></textarea>
                </div>
                
                {/* MENSAGEM DE ERRO VISUAL */}
                {error && (
                    <div className="bg-red-500/10 border border-red-500/50 p-3 rounded-lg flex gap-3 items-start animate-in fade-in slide-in-from-bottom-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-red-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                        <p className="text-sm font-semibold text-red-400 leading-snug">
                            {error}
                        </p>
                    </div>
                )}

                <button 
                    type="submit" 
                    className="w-full py-3 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white font-bold rounded-lg shadow-lg shadow-amber-900/30 transition-all flex justify-center items-center gap-2 transform active:scale-[0.98]"
                >
                    Confirmar e Abrir Agenda
                </button>
            </div>
        </form>

      </div>
    </div>
  );
};

export default ScheduleModal;

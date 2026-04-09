
import React, { useState, useMemo } from 'react';
import { Vestige, User } from '../types';
import { CalendarIcon } from './icons/CalendarIcon';
import { PencilIcon } from './icons/PencilIcon';
import { TrashIcon } from './icons/TrashIcon';
import ScheduleModal from './ScheduleModal';

interface VestigeCardProps {
  vestige: Vestige;
  isSelected?: boolean;
  onToggleSelect?: (vestige: Vestige) => void;
  user?: User; // Passamos o user para verificar permissões de edição
  onEdit?: (vestige: Vestige) => void;
  onDelete?: (vestige: Vestige) => void;
}

// Utility to parse date and calculate difference
const parseDate = (dateStr: string): Date | null => {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        const [day, month, year] = parts.map(Number);
        return new Date(year, month - 1, day);
    }
    return null;
};

const calculateCustodyTime = (dateStr: string): string => {
    const entryDate = parseDate(dateStr);
    if (!entryDate) return 'Data inválida';

    const now = new Date();
    const diffTime = Math.abs(now.getTime() - entryDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 30) return `${diffDays} dia(s)`;
    const diffMonths = Math.floor(diffDays / 30);
    if (diffMonths < 12) return `${diffMonths} mese(s)`;
    const diffYears = Math.floor(diffMonths / 12);
    const remainingMonths = diffMonths % 12;
    return `${diffYears} ano(s) e ${remainingMonths} mese(s)`;
};

const VestigeCard: React.FC<VestigeCardProps> = ({ 
    vestige, 
    isSelected = false, 
    onToggleSelect, 
    user,
    onEdit,
    onDelete
}) => {
    const [showScheduleModal, setShowScheduleModal] = useState(false);
    const custodyTime = useMemo(() => calculateCustodyTime(vestige.data), [vestige.data]);
    const canEdit = user?.isAdmin; // Apenas ADMIN edita/exclui
    
  return (
    <div className={`group rounded-xl p-5 transition-all duration-300 relative border ${
        isSelected 
        ? 'bg-amber-900/10 border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.1)]' 
        : 'bg-white/5 border-white/5 hover:border-white/10 hover:bg-white/[0.07]'
    }`}>
      
      {/* Badge de Selecionado (Feedback Visual) */}
      {isSelected && (
          <div className="absolute -top-3 -right-2 bg-amber-500 text-black text-[10px] font-bold px-3 py-1 rounded-full shadow-lg flex items-center gap-1 animate-in zoom-in duration-200 z-10 tracking-wider">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              SELECIONADO
          </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pl-0">
        {/* Main Details */}
        <div className="col-span-2 md:col-span-3 lg:col-span-4 border-b border-white/5 pb-3 mb-1 flex justify-between items-start">
             <div>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Origem</p>
                <span className="font-semibold text-amber-500">{vestige.planilhaOrigem}</span>
                {/* ID Discreto para debug se necessário */}
                <p className="text-[10px] text-zinc-700 font-mono hidden sm:block mt-1">Ref: {vestige.id}</p>
             </div>
             
             {/* Ações Administrativas (Editar/Excluir) */}
             {canEdit && (
                 <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                     <button 
                        onClick={() => onEdit && onEdit(vestige)}
                        className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/10 rounded transition-colors"
                        title="Editar"
                     >
                        <PencilIcon className="w-4 h-4" />
                     </button>
                     <button 
                        onClick={() => onDelete && onDelete(vestige)}
                        className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                        title="Excluir"
                     >
                        <TrashIcon className="w-4 h-4" />
                     </button>
                 </div>
             )}
        </div>
        <div>
          <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-0.5">Material</p>
          <p className="font-medium text-white text-sm sm:text-base leading-snug">{vestige.material}</p>
        </div>
        <div>
          <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-0.5">Requisição</p>
          <p className="font-medium text-white text-sm sm:text-base font-mono">{vestige.requisicao || 'N/A'}</p>
        </div>
        <div>
          <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-0.5">Invólucro</p>
          <p className="font-medium text-white text-sm sm:text-base font-mono">{vestige.involucro}</p>
        </div>
        <div>
          <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-0.5">FAV</p>
          <p className="font-medium text-white text-sm sm:text-base font-mono text-amber-200">{vestige.fav}</p>
        </div>
        <div>
          <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-0.5">Município</p>
          <p className="font-medium text-white text-sm sm:text-base">{vestige.municipio}</p>
        </div>
        <div>
          <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-0.5">Data Entrada</p>
          <p className="font-medium text-white text-sm sm:text-base">{vestige.data}</p>
        </div>
        <div className="col-span-2 md:col-span-1">
          <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-0.5">Tempo de Custódia</p>
          <p className="font-bold text-lg text-amber-500 leading-tight">{custodyTime}</p>
        </div>
      </div>
      
      {/* Actions Area */}
      <div className="mt-5 pt-4 border-t border-white/5 flex flex-col sm:flex-row justify-end gap-3">
        
        {/* Botão de Agendamento Individual */}
        <button 
            onClick={() => setShowScheduleModal(true)} 
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 text-xs bg-transparent hover:bg-white/5 border border-zinc-700 hover:border-zinc-500 text-zinc-300 font-medium py-2 px-4 rounded-lg transition-colors"
        >
            <CalendarIcon className="w-4 h-4 text-zinc-400"/>
            Agendar (Individual)
        </button>

        {/* Botão Principal: Adicionar/Remover da Lista */}
        {onToggleSelect && (
            <button
                onClick={() => onToggleSelect(vestige)}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-2 text-xs font-bold py-2 px-4 rounded-lg transition-all transform active:scale-95 ${
                    isSelected 
                    ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30' 
                    : 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-900/20'
                }`}
            >
                {isSelected ? (
                    <>
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        Remover
                    </>
                ) : (
                    <>
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        Adicionar
                    </>
                )}
            </button>
        )}
      </div>

      {showScheduleModal && (
        <ScheduleModal 
            vestiges={[vestige]} // Passa array com 1 item
            onClose={() => setShowScheduleModal(false)} 
        />
      )}
    </div>
  );
};

export default VestigeCard;

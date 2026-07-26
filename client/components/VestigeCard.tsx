
import React, { useState, useMemo } from 'react';
import { Vestige, User, canDeleteVestige, canEditVestige, getEstadoConservacaoLabel, getDestinacaoLabel, estaForaDaUrc } from '../types';
import { CalendarIcon } from './icons/CalendarIcon';
import { PencilIcon } from './icons/PencilIcon';
import { TrashIcon } from './icons/TrashIcon';
import { DocumentReportIcon } from './icons/DocumentReportIcon';
import ScheduleModal from './ScheduleModal';
import { buildPcnetUrl, logPcnetAction } from '../services/dataService';

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
    const canEdit = user ? canEditVestige(user) : false;
    const canDelete = user ? canDeleteVestige(user) : false;

    // Integração PCNET: só é possível consultar a FAV se o vestígio tiver esse número registrado.
    const hasFav = Boolean(vestige.fav && vestige.fav.trim());

    // Vestígio que não está mais fisicamente na URC — precisa saltar aos olhos na listagem.
    const foraDaUrc = estaForaDaUrc(vestige.destinacao);

    // Abre a FAV no PCNET em outra aba. O EvidenceOS não autentica no PCNET — depende da sessão
    // que o usuário já tem aberta lá. Se não estiver logado, o próprio PCNET exibe sua tela de login.
    const handleVerFav = () => {
        if (!hasFav) return;
        window.open(buildPcnetUrl('VIEW_FAV', vestige.fav), '_blank', 'noopener,noreferrer');
        // Registra a solicitação para auditoria. Não bloqueia nem desfaz a abertura da aba se falhar,
        // por isso o erro é apenas logado no console.
        logPcnetAction(vestige.id, 'VIEW_FAV', vestige.fav).catch((error) => {
            console.error('Falha ao registrar consulta ao PCNET na auditoria:', error);
        });
    };

    // Abre a tela "Sob Custódia" do PCNET já carregada com esta FAV. O EvidenceOS não preenche nem
    // salva nada: quem escolhe a Finalidade e clica em "Salvar" é sempre o usuário, dentro do PCNET.
    // Por isso o aviso abaixo é obrigatório — a gravação lá é oficial e irreversível, e o número da
    // FAV é exibido para o usuário conferir que é o vestígio certo antes de a aba abrir.
    const handleMovimentarFav = () => {
        if (!hasFav) return;

        const confirmado = window.confirm(
            `Isso vai abrir a tela de movimentação no PCNET para a FAV ${vestige.fav}.\n\n` +
            'A movimentação só é gravada de fato se você escolher a Finalidade e clicar em Salvar lá dentro.'
        );
        if (!confirmado) return;

        window.open(buildPcnetUrl('MOVIMENTAR', vestige.fav), '_blank', 'noopener,noreferrer');
        // Mesma regra do "Ver FAV": o log registra que a tela foi aberta, nunca que algo foi gravado —
        // o EvidenceOS não tem retorno do PCNET. Falha de auditoria não desfaz a abertura da aba.
        logPcnetAction(vestige.id, 'MOVIMENTAR', vestige.fav).catch((error) => {
            console.error('Falha ao registrar movimentação no PCNET na auditoria:', error);
        });
    };


  return (
    <div className={`group rounded-xl p-5 transition-all duration-300 relative border overflow-hidden ${
        isSelected
        ? 'bg-amber-900/10 border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.1)]'
        : 'bg-white/5 border-white/5 hover:border-white/10 hover:bg-white/[0.07]'
    }`}>

      {/* Faixa lateral + aviso: o vestígio não está mais fisicamente na URC.
          Marcamos só estes dois pontos (mais o badge de Situação) em vez de tingir o card
          inteiro: sair da URC é o processo funcionando, não um erro, e com o tempo será a
          situação da maioria dos vestígios — vermelho em tudo deixaria de destacar qualquer coisa. */}
      {foraDaUrc && (
        <>
          <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-red-500" aria-hidden="true" />
          <div className="flex items-center gap-2 mb-3 text-red-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            <span className="text-xs font-bold uppercase tracking-wider">Não está na URC</span>
            <span className="text-[10px] text-red-400/70 normal-case font-normal">— consulte a FAV para saber quem retirou</span>
          </div>
        </>
      )}

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
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Categoria</p>
                <span className="font-semibold text-amber-500">{vestige.planilhaOrigem}</span>
                {/* ID Discreto para debug se necessário */}
                <p className="text-[10px] text-zinc-700 font-mono hidden sm:block mt-1">Ref: {vestige.id}</p>
             </div>
             
             {/* Ações Administrativas (Editar/Excluir) */}
             {canEdit && (
                 <div className="flex items-center gap-1 transition-opacity">
                     <button 
                        onClick={() => onEdit && onEdit(vestige)}
                        className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/10 rounded transition-colors"
                        title="Editar"
                     >
                        <PencilIcon className="w-4 h-4" />
                     </button>
                     {canDelete && (
                         <button 
                            onClick={() => onDelete && onDelete(vestige)}
                            className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                            title="Excluir"
                         >
                            <TrashIcon className="w-4 h-4" />
                         </button>
                     )}
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
          <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-0.5">
            {vestige.involucros.length > 1 ? 'Invólucros' : 'Invólucro'}
          </p>
          {vestige.involucros.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {vestige.involucros.map((inv, idx) => (
                <span key={idx} className="font-medium text-white text-xs sm:text-sm font-mono bg-slate-700/60 rounded px-1.5 py-0.5">
                  {inv}
                </span>
              ))}
            </div>
          ) : (
            <p className="font-medium text-white text-sm sm:text-base font-mono">N/A</p>
          )}
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
        
        {/* Estado de Conservação */}
        <div>
          <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-0.5">Conservação</p>
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
            vestige.estadoConservacao === 'NAO_AVALIADO' ? 'bg-zinc-700 text-zinc-300' :
            vestige.estadoConservacao === 'NOVO_LACRADO' ? 'bg-emerald-500/20 text-emerald-400' :
            vestige.estadoConservacao === 'SEMI_NOVO' ? 'bg-blue-500/20 text-blue-400' :
            vestige.estadoConservacao === 'USADO_FUNCIONANDO' ? 'bg-amber-500/20 text-amber-400' :
            vestige.estadoConservacao === 'DANIFICADO' ? 'bg-red-500/20 text-red-400' :
            'bg-orange-500/20 text-orange-400'
          }`}>
            {getEstadoConservacaoLabel(vestige.estadoConservacao)}
          </span>
        </div>

        {/* Situação física do vestígio. Vermelho = saiu da URC (ver estaForaDaUrc). */}
        <div>
          <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-0.5">Situação</p>
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
            foraDaUrc ? 'bg-red-500/20 text-red-400 ring-1 ring-red-500/40' :
            vestige.destinacao === 'SOLICITADO' ? 'bg-yellow-500/20 text-yellow-400' :
            'bg-zinc-700 text-zinc-300'
          }`}>
            {getDestinacaoLabel(vestige.destinacao)}
          </span>
          {vestige.destinacaoObs && (
            <p className="text-[10px] text-zinc-400 mt-1 italic truncate max-w-[200px]" title={vestige.destinacaoObs}>
              {vestige.destinacaoObs}
            </p>
          )}
        </div>
      </div>
      
      {/* Actions Area */}
      <div className="mt-5 pt-4 border-t border-white/5 flex flex-col sm:flex-row sm:items-center justify-end gap-3">

        {/* Ação PCNET: abre a FAV oficial (leitura). O asterisco remete à nota de pré-requisito abaixo. */}
        <button
            onClick={handleVerFav}
            disabled={!hasFav}
            title={hasFav
                ? 'Abre a Ficha de Acompanhamento de Vestígio no PCNET, em outra aba. É necessário estar logado no PCNET.'
                : 'Este vestígio não possui número de FAV registrado.'}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 text-xs bg-transparent hover:bg-white/5 border border-zinc-700 hover:border-zinc-500 text-zinc-300 font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:border-zinc-700"
        >
            <DocumentReportIcon className="w-4 h-4 text-zinc-400"/>
            Ver FAV
            <span className="text-amber-500/70" aria-hidden="true">*</span>
        </button>

        {/* Ação PCNET: abre a tela de movimentação (escrita feita pelo usuário dentro do PCNET). */}
        <button
            onClick={handleMovimentarFav}
            disabled={!hasFav}
            title={hasFav
                ? 'Abre a tela de movimentação desta FAV no PCNET, em outra aba. A gravação é feita por você, dentro do PCNET. É necessário estar logado no PCNET.'
                : 'Este vestígio não possui número de FAV registrado.'}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 text-xs bg-transparent hover:bg-white/5 border border-zinc-700 hover:border-zinc-500 text-zinc-300 font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:border-zinc-700"
        >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>
            Movimentar FAV
            <span className="text-amber-500/70" aria-hidden="true">*</span>
        </button>

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

      {/* Nota de pré-requisito: vale só para os botões marcados com * (ações que abrem o PCNET) */}
      {hasFav && (
        <p className="mt-2 text-[10px] text-zinc-500 text-right leading-tight">
            <span className="text-amber-500/70" aria-hidden="true">*</span> Requer login no PCNET em outra aba
        </p>
      )}

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

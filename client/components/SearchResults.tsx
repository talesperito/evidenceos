
import React from 'react';
import { Vestige, User } from '../types';
import VestigeCard from './VestigeCard';
import { MagnifyingGlassIcon } from './icons/MagnifyingGlassIcon';
import { PrinterIcon } from './icons/PrinterIcon';
import { RefreshIcon } from './icons/RefreshIcon';
import { ClipboardListIcon } from './icons/ClipboardListIcon';

interface SearchResultsProps {
  vestiges: Vestige[];
  loading: boolean;
  totalVestiges: number;
  hasSearched: boolean;
  onClear: () => void;
  // Novos props de controle
  selectedIds: Set<string>;
  onToggleSelect: (vestige: Vestige) => void;
  onToggleSelectAll: () => void;
  // Visualização de Seleção
  isViewingSelection?: boolean;
  onBackToSearch?: () => void;
  // Props para gestão (opcional se não tiver user)
  user?: User;
  onEdit?: (vestige: Vestige) => void;
  onDelete?: (vestige: Vestige) => void;
}

const SearchResults: React.FC<SearchResultsProps> = ({ 
    vestiges, 
    loading, 
    totalVestiges, 
    hasSearched, 
    onClear,
    selectedIds,
    onToggleSelect,
    onToggleSelectAll,
    isViewingSelection,
    onBackToSearch,
    user,
    onEdit,
    onDelete
}) => {

  const handlePrint = () => {
    window.print();
  };

  const allVisibleSelected = vestiges.length > 0 && vestiges.every(v => selectedIds.has(v.id));

  if (loading) {
    return (
      <div className="text-center p-12 bg-white/5 rounded-2xl mt-4 border border-white/5 border-dashed backdrop-blur-sm">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto"></div>
        <p className="mt-3 text-amber-500 text-sm font-bold tracking-wide">BUSCANDO NA BASE DE DADOS...</p>
      </div>
    );
  }

  // Estado Inicial (Antes de qualquer busca e não vendo lista)
  // COMPACTADO PARA CABER O RODAPÉ NA TELA
  if (!hasSearched && !isViewingSelection) {
    return (
      <div className="flex flex-col items-center justify-center py-8 mt-4 bg-white/5 rounded-2xl border border-white/5 border-dashed gap-3 backdrop-blur-sm">
        <div className="flex items-center gap-3 opacity-60">
            <MagnifyingGlassIcon className="w-6 h-6 text-zinc-400" />
            <p className="text-zinc-400 text-sm">
                Utilize a barra acima para iniciar uma pesquisa.
            </p>
        </div>
      </div>
    );
  }

  // Estado "Não Encontrado" (Só exibe se NÃO estiver vendo a lista de seleção)
  if (vestiges.length === 0 && !isViewingSelection) {
    return (
      <div className="text-center p-8 mt-4 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-sm">
        <h3 className="text-lg font-semibold text-white">Nenhum resultado encontrado</h3>
        <p className="text-zinc-400 text-sm mt-1">Verifique o termo digitado e tente novamente.</p>
        <button 
          onClick={onClear}
          className="mt-6 px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold uppercase tracking-wider rounded-lg border border-zinc-700 transition-colors inline-flex items-center gap-2"
        >
           <RefreshIcon className="w-3 h-3" />
           Limpar Filtros
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      
      {/* Header Diferenciado para "Minha Lista" vs "Resultados da Busca" */}
      <div className={`flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 p-4 rounded-xl border backdrop-blur-md ${isViewingSelection ? 'bg-amber-900/20 border-amber-500/30' : 'bg-zinc-900/40 border-white/10'}`}>
        <div>
            {isViewingSelection ? (
                <div className="flex items-center gap-4">
                    <div className="p-2 bg-amber-500 text-black rounded-lg shadow-lg shadow-amber-500/20">
                        <ClipboardListIcon className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-base font-bold text-white uppercase tracking-wide">Minha Lista de Retirada</h3>
                        <p className="text-xs text-amber-200/80 font-medium">
                            Revisando {vestiges.length} iten(s) selecionado(s).
                        </p>
                    </div>
                </div>
            ) : (
                <div>
                    <p className="text-sm text-zinc-400">
                    <span className="text-white font-bold text-lg mr-1">{vestiges.length}</span> resultado(s) encontrado(s).
                    </p>
                </div>
            )}
        </div>
        
        <div className="flex items-center gap-3 w-full sm:w-auto mt-4 sm:mt-0">
            {isViewingSelection && onBackToSearch ? (
                 <button 
                 onClick={onBackToSearch}
                 className="no-print flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold uppercase rounded-lg border border-zinc-600 transition-colors"
             >
                 <RefreshIcon className="w-3 h-3" />
                 Voltar
             </button>
            ) : (
                <button 
                    onClick={onClear}
                    className="no-print flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold uppercase rounded-lg border border-zinc-700 transition-colors"
                >
                    <RefreshIcon className="w-3 h-3" />
                    Nova Pesquisa
                </button>
            )}

            <button 
                onClick={handlePrint}
                className="no-print flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-zinc-200 hover:text-white text-xs font-bold uppercase rounded-lg border border-white/10 transition-colors"
            >
                <PrinterIcon className="w-3 h-3" />
                Imprimir
            </button>
        </div>
      </div>
      
      {/* Atalho para selecionar todos visíveis (Opcional, mas útil se vierem muitos resultados) */}
      {!isViewingSelection && vestiges.length > 1 && (
        <div className="flex justify-end mb-2 px-1">
            <button 
                onClick={onToggleSelectAll} 
                className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 hover:text-amber-500 transition-colors flex items-center gap-1"
            >
                {allVisibleSelected ? 'Desmarcar Todos' : 'Selecionar Todos da Tela'}
            </button>
        </div>
      )}

      {vestiges.length === 0 && isViewingSelection && (
          <div className="text-center py-12 text-zinc-500 text-sm">
              <p>Sua lista está vazia. Volte para a pesquisa e adicione itens.</p>
          </div>
      )}

      {vestiges.map((vestige) => (
        <div key={vestige.id} className="vestige-card animate-in fade-in slide-in-from-bottom-2 duration-500">
          <VestigeCard 
            vestige={vestige} 
            isSelected={selectedIds.has(vestige.id)}
            onToggleSelect={onToggleSelect}
            user={user}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </div>
      ))}
      
      {/* Rodapé da lista para impressão */}
      <div className="hidden print:block text-center mt-8 pt-4 border-t border-black text-xs text-black">
        <p>Documento gerado pelo sistema EvidenceOS</p>
      </div>

    </div>
  );
};

export default SearchResults;

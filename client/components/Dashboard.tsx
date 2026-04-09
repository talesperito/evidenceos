import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Header from './Header';
import SearchBar from './SearchBar';
import SearchResults from './SearchResults';
import AdminPanel from './AdminPanel';
import ScheduleModal from './ScheduleModal';
import VestigeFormModal from './VestigeFormModal';
import { CalendarIcon } from './icons/CalendarIcon';
import { ClipboardListIcon } from './icons/ClipboardListIcon';
import { PlusIcon } from './icons/PlusIcon';
import { useVestiges } from '../hooks/useVestiges';
import { User, SearchFilters, Vestige } from '../types';
import { logAction } from '../services/auditService';
import { createVestige, deleteVestige, updateVestige } from '../services/dataService';

interface DashboardProps {
  user: User;
  onLogout: () => void | Promise<void>;
}

const Dashboard: React.FC<DashboardProps> = ({ user, onLogout }) => {
  const {
    vestiges,
    filteredVestiges,
    availableOptions,
    loading,
    error,
    report,
    hasSearched,
    searchVestiges,
    resetSearch,
    refreshData,
    generateReport,
    clearReport,
  } = useVestiges();

  const [selectedVestiges, setSelectedVestiges] = useState<Vestige[]>([]);
  const [showBulkScheduleModal, setShowBulkScheduleModal] = useState(false);
  const [isViewingSelection, setIsViewingSelection] = useState(false);
  const [searchKey, setSearchKey] = useState(0);
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingVestige, setEditingVestige] = useState<Vestige | null>(null);

  const selectedIds = useMemo(() => new Set(selectedVestiges.map((vestige) => vestige.id)), [selectedVestiges]);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  const handleToggleSelect = useCallback((vestige: Vestige) => {
    setSelectedVestiges((previous) => {
      const exists = previous.some((item) => item.id === vestige.id);
      return exists
        ? previous.filter((item) => item.id !== vestige.id)
        : [...previous, vestige];
    });
  }, []);

  const handleToggleSelectAllVisible = useCallback(() => {
    if (filteredVestiges.length === 0) return;

    const allVisibleAreSelected = filteredVestiges.every((vestige) => selectedIds.has(vestige.id));
    if (allVisibleAreSelected) {
      setSelectedVestiges((previous) => previous.filter((vestige) => !filteredVestiges.some((visible) => visible.id === vestige.id)));
      return;
    }

    setSelectedVestiges((previous) => {
      const newItems = filteredVestiges.filter((vestige) => !previous.some((item) => item.id === vestige.id));
      return [...previous, ...newItems];
    });
  }, [filteredVestiges, selectedIds]);

  const clearSelection = () => {
    if (confirm('Deseja limpar toda a lista de itens selecionados?')) {
      setSelectedVestiges([]);
      setIsViewingSelection(false);
    }
  };

  const handleSearchWithLog = useCallback(async (filters: SearchFilters) => {
    setIsViewingSelection(false);
    await searchVestiges(filters);

    const hasActiveFilters = filters.term || filters.municipio || filters.origin || filters.startDate;
    if (hasActiveFilters) {
      let details = '';
      if (filters.term) details += `Termo: "${filters.term}" `;
      if (filters.municipio) details += `| Cidade: ${filters.municipio} `;
      if (filters.origin) details += `| Tipo: ${filters.origin} `;
      if (filters.startDate) details += `| Periodo: ${filters.startDate} a ${filters.endDate || 'hoje'}`;
      try {
        await logAction(user, 'SEARCH', details.trim());
      } catch {
        // A busca principal não deve falhar por causa da auditoria.
      }
    }
  }, [searchVestiges, user]);

  const handleNewSearch = () => {
    resetSearch();
    setIsViewingSelection(false);
    setSearchKey((previous) => previous + 1);
  };

  const handleCreateNew = () => {
    if (!user.isAdmin) return;
    setEditingVestige(null);
    setShowFormModal(true);
  };

  const handleEdit = (vestige: Vestige) => {
    if (!user.isAdmin) return;
    setEditingVestige(vestige);
    setShowFormModal(true);
  };

  const handleDelete = async (vestige: Vestige) => {
    if (!user.isAdmin) return;
    if (!confirm(`ATENÇÃO: Deseja realmente excluir permanentemente o item FAV ${vestige.fav}?\n\nEsta ação não poderá ser desfeita.`)) {
      return;
    }

    try {
      await deleteVestige(vestige.id);
      await logAction(user, 'DELETE', `Exclusão de vestígio FAV ${vestige.fav}`);
      await refreshData();
      setSelectedVestiges((previous) => previous.filter((item) => item.id !== vestige.id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Falha ao excluir vestígio.');
    }
  };

  const handleSaveForm = async (formData: Partial<Vestige>) => {
    const isEdit = Boolean(editingVestige);
    if (isEdit && editingVestige) {
      await updateVestige(editingVestige.id, formData);
      await logAction(user, 'UPDATE', `Atualização de vestígio FAV ${formData.fav || editingVestige.fav}`);
    } else {
      await createVestige(formData);
      await logAction(user, 'CREATE', `Criação de vestígio FAV ${formData.fav || ''}`.trim());
    }

    await refreshData();
  };

  const displayedVestiges = isViewingSelection ? selectedVestiges : filteredVestiges;

  return (
    <div className="flex flex-col min-h-screen relative pb-32">
      <Header user={user} onLogout={() => void onLogout()} />
      <main className="flex-grow container mx-auto px-4 py-8 max-w-6xl">
        <AdminPanel
          user={user}
          onRefresh={() => void refreshData()}
          onGenerateReport={() => void generateReport()}
          reportData={report}
          onCloseReport={clearReport}
          isLoading={loading}
        />

        <div className={`${isViewingSelection ? 'opacity-50 pointer-events-none grayscale' : ''} transition-all duration-300 relative`}>
          <SearchBar
            key={searchKey}
            onSearch={(filters) => void handleSearchWithLog(filters)}
            isLoading={loading}
            options={availableOptions}
          />
        </div>

        <div className="mt-6 flex flex-col sm:flex-row justify-between items-center gap-4 pb-4">
          <div className="text-sm text-zinc-400" />

          <div className="flex flex-col sm:flex-row items-center justify-end w-full sm:w-auto gap-3">
            <span className="text-[10px] text-zinc-500 flex items-center gap-1 order-2 sm:order-1 font-medium tracking-wide">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
              Acesso Restrito
            </span>

            <button
              onClick={handleCreateNew}
              disabled={!user.isAdmin}
              className={`order-1 sm:order-2 w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg font-bold text-sm transition-all shadow-lg ${
                user.isAdmin
                  ? 'bg-zinc-800 hover:bg-zinc-700 text-white border border-white/10 hover:border-amber-500/50'
                  : 'bg-zinc-900/50 text-zinc-600 cursor-not-allowed border border-zinc-800'
              }`}
            >
              <PlusIcon className={`w-5 h-5 ${user.isAdmin ? 'text-amber-500' : ''}`} />
              Novo Vestígio
            </button>
          </div>
        </div>

        {error && <p className="text-center text-red-400 mt-4 bg-red-500/10 py-2 rounded border border-red-500/20">{error}</p>}

        <SearchResults
          vestiges={displayedVestiges}
          loading={loading}
          totalVestiges={vestiges.length}
          hasSearched={hasSearched || isViewingSelection}
          onClear={handleNewSearch}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onToggleSelectAll={handleToggleSelectAllVisible}
          isViewingSelection={isViewingSelection}
          onBackToSearch={() => setIsViewingSelection(false)}
          user={user}
          onEdit={handleEdit}
          onDelete={(vestige) => void handleDelete(vestige)}
        />
      </main>

      {selectedVestiges.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-900/90 backdrop-blur-xl text-white px-4 sm:px-6 py-3 rounded-2xl shadow-2xl border border-amber-500/30 flex items-center gap-4 sm:gap-6 z-40 animate-in slide-in-from-bottom-4 duration-200 w-[95%] sm:w-auto justify-between sm:justify-center ring-1 ring-amber-500/20">
          <div className="flex items-center gap-3">
            <div className="bg-amber-500 text-black font-bold w-8 h-8 rounded-lg flex items-center justify-center text-sm shadow-lg shadow-amber-500/20">
              {selectedVestiges.length}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold text-amber-50 leading-tight">Itens Salvos</span>
              <span className="text-[10px] text-amber-200/60 font-medium">Lista de Retirada</span>
            </div>
          </div>

          <div className="h-8 w-px bg-zinc-700 mx-1 hidden sm:block" />

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsViewingSelection(!isViewingSelection)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                isViewingSelection
                  ? 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                  : 'bg-zinc-800 text-amber-400 hover:bg-zinc-700 border border-zinc-600'
              }`}
            >
              {isViewingSelection ? 'Voltar à Busca' : (<><ClipboardListIcon className="w-4 h-4" />Ver Lista</>)}
            </button>

            <button
              onClick={() => setShowBulkScheduleModal(true)}
              className="flex items-center gap-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white px-5 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all shadow-lg shadow-amber-900/50 hover:shadow-amber-500/30 transform hover:-translate-y-0.5"
            >
              <CalendarIcon className="w-4 h-4" />
              Agendar Lote
            </button>
          </div>

          <button
            onClick={clearSelection}
            className="text-zinc-500 hover:text-red-400 ml-1 p-2 rounded-full hover:bg-zinc-800 transition-colors"
            title="Limpar seleção"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      )}

      {showBulkScheduleModal && (
        <ScheduleModal
          vestiges={selectedVestiges}
          onClose={() => setShowBulkScheduleModal(false)}
        />
      )}

      {showFormModal && (
        <VestigeFormModal
          initialData={editingVestige}
          onClose={() => setShowFormModal(false)}
          onSave={handleSaveForm}
          options={availableOptions}
        />
      )}

      <footer className="w-full text-center py-8 mt-auto border-t border-white/5 bg-black/20">
        <div className="container mx-auto px-4 flex flex-col items-center gap-4">
          <p className="text-[10px] text-amber-500/50 uppercase tracking-[0.2em] font-bold">
            Desenvolvido por
          </p>

          <div className="flex flex-col gap-1 items-center">
            <p className="text-xs font-medium text-zinc-400">
              <span className="text-zinc-200">Tales Vieira</span> • Perito Criminal, Coordenador do 6° Depto e Cientista de Dados
            </p>
            <p className="text-xs font-medium text-zinc-400">
              <span className="text-zinc-200">Matheus Vieira</span> • Desenvolvedor Full-Stack e Graduando em Direito
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Dashboard;

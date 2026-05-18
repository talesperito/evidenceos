
import React, { useState } from 'react';
import { MagnifyingGlassIcon } from './icons/MagnifyingGlassIcon';
import { SearchFilters, ESTADO_CONSERVACAO_OPTIONS, DESTINACAO_OPTIONS } from '../types';

interface SearchBarProps {
  onSearch: (filters: SearchFilters) => void;
  isLoading: boolean;
  options: {
    municipios: string[];
    origins: string[];
  };
}

const SearchBar: React.FC<SearchBarProps> = ({ onSearch, isLoading, options }) => {
  const [query, setQuery] = useState('');
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedMunicipio, setSelectedMunicipio] = useState('');
  const [selectedOrigin, setSelectedOrigin] = useState('');
  const [estadoConservacao, setEstadoConservacao] = useState('');
  const [destinacao, setDestinacao] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch({
      term: query,
      field: 'all',
      municipio: selectedMunicipio,
      origin: selectedOrigin,
      estadoConservacao,
      destinacao,
      startDate,
      endDate,
    });
  };

  const clearFilters = () => {
    setStartDate('');
    setEndDate('');
    setSelectedMunicipio('');
    setSelectedOrigin('');
    setEstadoConservacao('');
    setDestinacao('');
    setQuery('');
  };

  const hasActiveFilters = selectedMunicipio || selectedOrigin || startDate || endDate || estadoConservacao || destinacao;

  const selectClass =
    'w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/20 disabled:opacity-50 transition-colors';

  return (
    <div className="mt-4 bg-zinc-900/60 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden shadow-xl">
      <form onSubmit={handleSearch} className="p-5">

        {/* Main Search Row */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-grow">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Pesquisa rápida — FAV, Requisição ou Invólucro"
              className="w-full pl-10 pr-4 py-3 bg-zinc-800/60 text-white border border-white/10 rounded-xl placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all font-mono text-sm"
              disabled={isLoading}
            />
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
          </div>

          <div className="flex gap-2">
            {/* Toggle filtros avançados */}
            <button
              type="button"
              onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
              title="Busca Avançada"
              className={`flex-none px-3 py-3 rounded-xl border transition-all duration-150 hover:-translate-y-0.5 active:translate-y-0 hover:shadow-md ${
                isAdvancedOpen
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/40 shadow-[0_2px_8px_rgba(245,158,11,0.1)]'
                  : 'bg-zinc-800/60 hover:bg-zinc-700 text-zinc-400 hover:text-white border-white/10 hover:border-white/20'
              } ${hasActiveFilters && !isAdvancedOpen ? 'ring-1 ring-amber-500/30 text-amber-400' : ''}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
                <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
                <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
                <line x1="1" y1="14" x2="7" y2="14" />
                <line x1="9" y1="8" x2="15" y2="8" />
                <line x1="17" y1="16" x2="23" y2="16" />
              </svg>
            </button>

            {/* Botão Buscar */}
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed text-black font-bold rounded-xl transition-all duration-200 shadow-lg shadow-amber-900/30 hover:shadow-amber-500/20 hover:-translate-y-0.5 active:translate-y-0 min-w-[110px]"
            >
              {isLoading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span className="text-sm">Buscando</span>
                </>
              ) : (
                <span className="text-sm">Buscar</span>
              )}
            </button>
          </div>
        </div>

        {/* Advanced Filters Panel */}
        {isAdvancedOpen && (
          <div className="mt-4 pt-4 border-t border-white/5 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">Tipo / Origem</label>
                <select
                  value={selectedOrigin}
                  onChange={(e) => setSelectedOrigin(e.target.value)}
                  disabled={isLoading}
                  className={selectClass}
                >
                  <option value="">Todos os tipos</option>
                  {options.origins.map((origin) => (
                    <option key={origin} value={origin}>{origin}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">Município</label>
                <select
                  value={selectedMunicipio}
                  onChange={(e) => setSelectedMunicipio(e.target.value)}
                  disabled={isLoading}
                  className={selectClass}
                >
                  <option value="">Todas as cidades</option>
                  {options.municipios.map((city) => (
                    <option key={city} value={city}>{city}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">De (Data Entrada)</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={isLoading}
                  className={selectClass}
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">Até</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  disabled={isLoading}
                  className={selectClass}
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">Conservação</label>
                <select
                  value={estadoConservacao}
                  onChange={(e) => setEstadoConservacao(e.target.value)}
                  disabled={isLoading}
                  className={selectClass}
                >
                  <option value="">Todos</option>
                  {ESTADO_CONSERVACAO_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">Destinação</label>
                <select
                  value={destinacao}
                  onChange={(e) => setDestinacao(e.target.value)}
                  disabled={isLoading}
                  className={selectClass}
                >
                  <option value="">Todos</option>
                  {DESTINACAO_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end mt-4">
              <button
                type="button"
                onClick={clearFilters}
                disabled={isLoading}
                className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 hover:text-amber-400 transition-colors disabled:opacity-50"
              >
                Limpar Filtros
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
};

export default SearchBar;

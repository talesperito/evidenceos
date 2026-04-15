
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
  
  // Advanced Filters State
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
        endDate
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

  return (
    <div className="mt-4 bg-slate-800/50 rounded-lg border border-slate-700 overflow-hidden shadow-lg">
        <form onSubmit={handleSearch} className="p-6">
            
            {/* Main Search Row */}
            <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-grow">
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Pesquisa rápida (FAV, Requisição ou Invólucro)"
                        className="w-full pl-10 pr-4 py-3 bg-slate-700 text-white border border-slate-600 rounded-md focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-colors"
                        disabled={isLoading}
                    />
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                </div>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
                        className={`px-4 py-3 font-semibold rounded-md border transition-colors ${isAdvancedOpen ? 'bg-slate-600 text-cyan-300 border-cyan-500/50' : 'bg-slate-700 text-slate-300 border-slate-600 hover:bg-slate-600'}`}
                        title="Busca Avançada"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line>
                            <line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line>
                            <line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line>
                            <line x1="1" y1="14" x2="7" y2="14"></line>
                            <line x1="9" y1="8" x2="15" y2="8"></line>
                            <line x1="17" y1="16" x2="23" y2="16"></line>
                        </svg>
                    </button>
                    <button
                        type="submit"
                        className="flex-grow sm:flex-grow-0 px-8 py-3 bg-cyan-600 text-white font-semibold rounded-md hover:bg-cyan-700 disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors"
                        disabled={isLoading}
                    >
                        {isLoading ? '...' : 'Buscar'}
                    </button>
                </div>
            </div>

            {/* Advanced Filters Panel */}
            {isAdvancedOpen && (
                <div className="mt-4 pt-4 border-t border-slate-700 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                        
                        {/* Filtro: Tipo de Material (Origem) */}
                        <div>
                            <label className="block text-xs font-semibold text-slate-400 mb-1">TIPO / ORIGEM</label>
                            <select
                                value={selectedOrigin}
                                onChange={(e) => setSelectedOrigin(e.target.value)}
                                disabled={isLoading}
                                className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none disabled:opacity-50"
                            >
                                <option value="">Todos os tipos</option>
                                {options.origins.map(origin => (
                                    <option key={origin} value={origin}>{origin}</option>
                                ))}
                            </select>
                        </div>

                        {/* Filtro: Município */}
                        <div>
                            <label className="block text-xs font-semibold text-slate-400 mb-1">MUNICÍPIO</label>
                            <select
                                value={selectedMunicipio}
                                onChange={(e) => setSelectedMunicipio(e.target.value)}
                                disabled={isLoading}
                                className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none disabled:opacity-50"
                            >
                                <option value="">Todas as cidades</option>
                                {options.municipios.map(city => (
                                    <option key={city} value={city}>{city}</option>
                                ))}
                            </select>
                        </div>

                        {/* Filtro: Data Inicial */}
                        <div>
                            <label className="block text-xs font-semibold text-slate-400 mb-1">DE (DATA ENTRADA)</label>
                            <input 
                                type="date" 
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                disabled={isLoading}
                                className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none disabled:opacity-50"
                            />
                        </div>

                        {/* Filtro: Data Final */}
                        <div>
                            <label className="block text-xs font-semibold text-slate-400 mb-1">ATÉ</label>
                            <input 
                                type="date" 
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                disabled={isLoading}
                                className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none disabled:opacity-50"
                            />
                        </div>

                        {/* Filtro: Conservação */}
                        <div>
                            <label className="block text-xs font-semibold text-slate-400 mb-1">CONSERVAÇÃO</label>
                            <select
                                value={estadoConservacao}
                                onChange={(e) => setEstadoConservacao(e.target.value)}
                                disabled={isLoading}
                                className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none disabled:opacity-50 appearance-none"
                            >
                                <option value="">Todos</option>
                                {ESTADO_CONSERVACAO_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* Filtro: Destinação */}
                        <div>
                            <label className="block text-xs font-semibold text-slate-400 mb-1">DESTINAÇÃO</label>
                            <select
                                value={destinacao}
                                onChange={(e) => setDestinacao(e.target.value)}
                                disabled={isLoading}
                                className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none disabled:opacity-50 appearance-none"
                            >
                                <option value="">Todos</option>
                                {DESTINACAO_OPTIONS.map(opt => (
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
                            className="text-xs text-slate-400 hover:text-white underline disabled:opacity-50"
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

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { XIcon } from './icons/XIcon';
import { BookOpenIcon } from './icons/BookOpenIcon';
import { MagnifyingGlassIcon } from './icons/MagnifyingGlassIcon';
import { getFAQs } from '../services/faqService';
import { FAQItem } from '../data/faqData';

interface HelpModalProps {
  onClose: () => void;
}

const HelpModal: React.FC<HelpModalProps> = ({ onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());
  const [data, setData] = useState<FAQItem[]>([]);

  useEffect(() => {
    const load = async () => {
      setData(await getFAQs(true));
    };

    void load();
  }, []);

  const toggleItem = (id: string) => {
    const newOpen = new Set(openItems);
    if (newOpen.has(id)) newOpen.delete(id);
    else newOpen.add(id);
    setOpenItems(newOpen);
  };

  const filteredData = useMemo(() => {
    if (!searchTerm) return data;
    const lowerTerm = searchTerm.toLowerCase();
    return data.filter((item) =>
      item.question.toLowerCase().includes(lowerTerm) ||
      item.answer.toLowerCase().includes(lowerTerm) ||
      item.category.toLowerCase().includes(lowerTerm),
    );
  }, [data, searchTerm]);

  const groupedData = useMemo(() => {
    const groups: Record<string, FAQItem[]> = {};
    filteredData.forEach((item) => {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    });
    return groups;
  }, [filteredData]);

  return createPortal(
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-start pt-24 z-[9999] p-4 animate-in fade-in duration-200 overflow-hidden">
      <div className="bg-slate-900 rounded-xl shadow-2xl w-full max-w-3xl flex flex-col border border-slate-700 max-h-[70vh]">
        <div className="flex justify-between items-center p-5 border-b border-slate-700 bg-slate-800/50 rounded-t-xl shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-500/20 rounded-lg">
              <BookOpenIcon className="w-6 h-6 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Normas e Procedimentos</h2>
              <p className="text-sm text-slate-400">Consulta rápida de regras da URC</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white transition-colors">
            <XIcon className="w-6 h-6" />
          </button>
        </div>

        <div className="p-4 bg-slate-800/30 border-b border-slate-700 shrink-0">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
            <input
              type="text"
              placeholder="Pesquisar norma (ex: armas, lacre, descarte)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-md pl-10 pr-4 py-2.5 text-white placeholder-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none transition-all"
              autoFocus
            />
          </div>
        </div>

        <div className="flex-grow overflow-y-auto custom-scrollbar p-6 space-y-6">
          {Object.keys(groupedData).length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-500">
                {data.length === 0 ? 'Nenhuma norma cadastrada no sistema.' : `Nenhum resultado encontrado para "${searchTerm}".`}
              </p>
            </div>
          ) : (
            Object.entries(groupedData).map(([category, items]) => (
              <div key={category}>
                <h3 className="text-xs font-bold text-cyan-500 uppercase tracking-widest mb-3 border-b border-slate-700/50 pb-1">
                  {category}
                </h3>
                <div className="space-y-2">
                  {items.map((item) => (
                    <div key={item.id} className="bg-slate-800 rounded border border-slate-700 overflow-hidden">
                      <button
                        onClick={() => toggleItem(item.id)}
                        className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-700/50 transition-colors"
                      >
                        <span className="font-semibold text-slate-200 text-sm pr-4">{item.question}</span>
                        <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${openItems.has(item.id) ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {openItems.has(item.id) && (
                        <div className="p-4 pt-0 text-sm text-slate-300 bg-slate-800/50 leading-relaxed border-t border-slate-700/50 animate-in slide-in-from-top-1 duration-200">
                          <div className="pt-2 whitespace-pre-wrap">
                            {item.answer}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-slate-700 bg-slate-800/50 rounded-b-xl flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-700 text-white text-sm font-semibold rounded hover:bg-slate-600 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default HelpModal;

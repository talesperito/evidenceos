import React, { useEffect, useState } from 'react';
import { getFAQs, saveFAQ, deleteFAQ, resetFAQs } from '../services/faqService';
import { FAQItem } from '../data/faqData';
import { XIcon } from './icons/XIcon';
import { TrashIcon } from './icons/TrashIcon';
import { PencilIcon } from './icons/PencilIcon';
import { RefreshIcon } from './icons/RefreshIcon';

interface FAQManagementModalProps {
  onClose: () => void;
}

const CATEGORIES = [
  'Recebimento de Materiais',
  'Coleta e Armazenamento',
  'Destinação',
  'Geral'
];

const FAQManagementModal: React.FC<FAQManagementModalProps> = ({ onClose }) => {
  const [faqs, setFaqs] = useState<FAQItem[]>([]);
  const [formData, setFormData] = useState<Partial<FAQItem>>({ category: '', question: '', answer: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setError(null);
      setFaqs(await getFAQs());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar normas.');
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleEdit = (item: FAQItem) => {
    setFormData(item);
    setEditingId(item.id);
    setMsg(null);
    setError(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta pergunta?')) return;
    try {
      await deleteFAQ(id);
      await loadData();
      if (editingId === id) handleCancel();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao excluir norma.');
    }
  };

  const handleCancel = () => {
    setFormData({ category: '', question: '', answer: '' });
    setEditingId(null);
    setMsg(null);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.category || !formData.question || !formData.answer) {
      setMsg('Preencha todos os campos.');
      return;
    }

    try {
      await saveFAQ({
        id: editingId || undefined,
        category: formData.category,
        question: formData.question,
        answer: formData.answer
      });
      setMsg(editingId ? 'Norma atualizada!' : 'Norma criada!');
      setTimeout(() => setMsg(null), 3000);
      await loadData();
      handleCancel();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar norma.');
    }
  };

  const handleResetDefaults = async () => {
    if (!confirm('Isso substituirá o conteúdo atual pelas normas padrão do sistema. Continuar?')) return;
    try {
      await resetFAQs();
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao restaurar normas padrão.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col border border-slate-700">
        <div className="flex justify-between items-center p-5 border-b border-slate-700 bg-slate-800/50 rounded-t-xl">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            Gerenciar Normas
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white transition-colors">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col md:flex-row flex-grow overflow-hidden">
          <div className="w-full md:w-1/3 p-5 bg-slate-800/30 border-r border-slate-700 overflow-y-auto custom-scrollbar">
            <h3 className="text-sm font-bold text-cyan-400 uppercase tracking-wider mb-4">
              {editingId ? 'Editar Norma' : 'Nova Norma'}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">CATEGORIA</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none appearance-none"
                >
                  <option value="" disabled>Selecione uma categoria...</option>
                  {CATEGORIES.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">DÚVIDA / TÍTULO</label>
                <textarea
                  value={formData.question}
                  onChange={(e) => setFormData({ ...formData, question: e.target.value })}
                  placeholder="Qual a dúvida frequente?"
                  className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none h-20 resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">RESPOSTA / REGRA</label>
                <textarea
                  value={formData.answer}
                  onChange={(e) => setFormData({ ...formData, answer: e.target.value })}
                  placeholder="Explique a norma ou procedimento..."
                  className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none h-40 resize-none leading-relaxed"
                />
              </div>

              {msg && <p className="text-emerald-400 text-xs text-center font-bold animate-pulse">{msg}</p>}
              {error && <p className="text-red-400 text-xs text-center">{error}</p>}

              <div className="flex gap-2 pt-2">
                {editingId && (
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="flex-1 py-2 bg-slate-700 text-slate-300 rounded hover:bg-slate-600 text-sm font-semibold transition-colors"
                  >
                    Cancelar
                  </button>
                )}
                <button
                  type="submit"
                  className="flex-1 py-2 bg-cyan-600 text-white rounded hover:bg-cyan-500 text-sm font-semibold transition-colors shadow-lg"
                >
                  {editingId ? 'Salvar Edição' : 'Adicionar'}
                </button>
              </div>
            </form>

            <div className="mt-8 pt-6 border-t border-slate-700">
              <button
                onClick={() => void handleResetDefaults()}
                className="w-full flex items-center justify-center gap-2 py-2 border border-slate-600 text-slate-400 rounded hover:bg-slate-700 hover:text-white text-xs transition-colors"
              >
                <RefreshIcon className="w-3 h-3" />
                Restaurar Padrões
              </button>
            </div>
          </div>

          <div className="w-full md:w-2/3 p-5 overflow-y-auto custom-scrollbar bg-slate-900">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
                Normas Cadastradas ({faqs.length})
              </h3>
            </div>

            <div className="space-y-3">
              {faqs.map((item) => (
                <div
                  key={item.id}
                  className={`p-4 rounded border transition-all ${editingId === item.id ? 'bg-cyan-900/10 border-cyan-500/50' : 'bg-slate-800 border-slate-700 hover:border-slate-600'}`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] uppercase font-bold text-cyan-500 bg-cyan-950 px-2 py-0.5 rounded">
                      {item.category}
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleEdit(item)}
                        className="p-1.5 text-slate-400 hover:text-cyan-400 hover:bg-slate-700 rounded transition-colors"
                        title="Editar"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => void handleDelete(item.id)}
                        className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition-colors"
                        title="Excluir"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <h4 className="font-semibold text-slate-200 text-sm mb-1">{item.question}</h4>
                  <p className="text-xs text-slate-400 line-clamp-2">{item.answer}</p>
                </div>
              ))}

              {faqs.length === 0 && (
                <div className="text-center py-10 text-slate-500">
                  Nenhuma norma cadastrada.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FAQManagementModal;

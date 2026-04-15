
import React, { useState, useEffect } from 'react';
import { Vestige, ESTADO_CONSERVACAO_OPTIONS, DESTINACAO_OPTIONS } from '../types';
import { XIcon } from './icons/XIcon';

interface VestigeFormModalProps {
  initialData?: Vestige | null;
  onClose: () => void;
  onSave: (data: Partial<Vestige>) => Promise<void>;
  options: {
    municipios: string[];
    origins: string[];
  };
}

const VestigeFormModal: React.FC<VestigeFormModalProps> = ({ initialData, onClose, onSave, options }) => {
  const [formData, setFormData] = useState<Partial<Vestige>>({
    material: '',
    requisicao: '',
    involucro: '',
    fav: '',
    municipio: 'Lavras',
    data: new Date().toLocaleDateString('pt-BR'),
    planilhaOrigem: 'Geral',
    // NOVOS CAMPOS
    estadoConservacao: 'NAO_AVALIADO',
    destinacao: 'NAO_INICIADO',
    destinacaoObs: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
    }
  }, [initialData]);

  const handleChange = (field: keyof Vestige, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSaving(true);

    try {
      await onSave(formData);
      onClose();
    } catch (err: any) {
      setError(err.message);
      setIsSaving(false);
    }
  };

  // Input helper para datas (converte DD/MM/YYYY <-> YYYY-MM-DD para input date)
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value; // YYYY-MM-DD
    if (!val) return;
    const [year, month, day] = val.split('-');
    handleChange('data', `${day}/${month}/${year}`);
  };

  const getInputDate = () => {
    if (!formData.data) return '';
    const parts = formData.data.split('/');
    if (parts.length !== 3) return '';
    const [day, month, year] = parts;
    return `${year}-${month}-${day}`;
  };

  // Função helper para permitir apenas números
  const handleNumericInput = (field: keyof Vestige, value: string) => {
    const numericValue = value.replace(/\D/g, ''); // Remove tudo que não for dígito
    handleChange(field, numericValue);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 rounded-xl shadow-2xl w-full max-w-2xl border border-slate-700 max-h-[90vh] flex flex-col">
        
        <div className="flex justify-between items-center p-5 border-b border-slate-700 bg-slate-800/50 rounded-t-xl">
          <h2 className="text-xl font-bold text-white">
            {initialData ? 'Editar Vestígio' : 'Novo Vestígio'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white transition-colors">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto custom-scrollbar flex-grow">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Linha 1 */}
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-400 mb-1">MATERIAL / DESCRIÇÃO</label>
              <textarea
                required
                value={formData.material}
                onChange={e => handleChange('material', e.target.value)}
                className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none h-20 resize-none"
                placeholder="Ex: 01 (um) envelope contendo..."
              />
            </div>

            {/* Linha 2 */}
            <div>
               <label className="block text-xs font-semibold text-slate-400 mb-1">NÚMERO DA REQUISIÇÃO</label>
               <input
                 type="text"
                 value={formData.requisicao}
                 onChange={e => handleNumericInput('requisicao', e.target.value)}
                 pattern="\d*"
                 className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none"
                 placeholder="Ex: 2024123456001 (Apenas números)"
                 title="Digite apenas os números da requisição"
               />
            </div>
            <div>
               <label className="block text-xs font-semibold text-slate-400 mb-1">NÚMERO DO INVÓLUCRO</label>
               <input
                 type="text"
                 value={formData.involucro}
                 onChange={e => handleNumericInput('involucro', e.target.value)}
                 pattern="\d*"
                 className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none"
                 placeholder="Ex: 123456 (Apenas números)"
                 title="Digite apenas os números do invólucro"
               />
            </div>

            {/* Linha 3 */}
            <div>
               <label className="block text-xs font-semibold text-slate-400 mb-1">FAV</label>
               <input
                 type="text"
                 required
                 value={formData.fav}
                 onChange={e => handleChange('fav', e.target.value)}
                 className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none"
               />
            </div>
             <div>
               <label className="block text-xs font-semibold text-slate-400 mb-1">DATA DE ENTRADA</label>
               <input
                 type="date"
                 required
                 value={getInputDate()}
                 onChange={handleDateChange}
                 className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none"
               />
            </div>

            {/* Linha 4 */}
            <div>
               <label className="block text-xs font-semibold text-slate-400 mb-1">MUNICÍPIO</label>
               <select
                 required
                 value={formData.municipio}
                 onChange={e => handleChange('municipio', e.target.value)}
                 className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none appearance-none"
               >
                 {options.municipios.map(m => <option key={m} value={m}>{m}</option>)}
               </select>
            </div>
            <div>
               <label className="block text-xs font-semibold text-slate-400 mb-1">ORIGEM (TIPO/PLANILHA)</label>
               <select
                 required
                 value={formData.planilhaOrigem}
                 onChange={e => handleChange('planilhaOrigem', e.target.value)}
                 className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none appearance-none"
               >
                 {options.origins.map(o => <option key={o} value={o}>{o}</option>)}
               </select>
            </div>

            {/* Linha 5 — Novos Campos */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">ESTADO DE CONSERVAÇÃO</label>
              <select
                required
                value={formData.estadoConservacao}
                onChange={e => handleChange('estadoConservacao' as keyof Vestige, e.target.value)}
                className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none appearance-none"
              >
                {ESTADO_CONSERVACAO_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">DESTINAÇÃO</label>
              <select
                required
                value={formData.destinacao}
                onChange={e => handleChange('destinacao' as keyof Vestige, e.target.value)}
                className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none appearance-none"
              >
                {DESTINACAO_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Campo condicional de observação da destinação */}
            {(formData.destinacao === 'SOLICITADO' || formData.destinacao === 'FINALIZADO') && (
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  {formData.destinacao === 'SOLICITADO'
                    ? 'OBSERVAÇÃO DA SOLICITAÇÃO (Quem solicitou e motivo)'
                    : 'DADOS DA FINALIZAÇÃO'}
                </label>
                <textarea
                  required
                  value={formData.destinacaoObs || ''}
                  onChange={e => handleChange('destinacaoObs' as keyof Vestige, e.target.value)}
                  className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none h-20 resize-none"
                  placeholder={formData.destinacao === 'SOLICITADO'
                    ? 'Ex: Solicitado por Del. João Silva - Ofício 123/2026 - Restituição ao proprietário'
                    : 'Ex: Entregue ao requisitante em 15/04/2026 - Protocolo 456/2026'}
                />
              </div>
            )}

          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded shadow-lg transition-colors flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Salvando...
                </>
              ) : (
                'Salvar Alterações'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default VestigeFormModal;

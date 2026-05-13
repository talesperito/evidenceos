
import React, { useState, useEffect } from 'react';
import { Vestige, ESTADO_CONSERVACAO_OPTIONS, DESTINACAO_OPTIONS } from '../types';
import { XIcon } from './icons/XIcon';
import { checkDuplicate, DuplicateAlert } from '../services/dataService';

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
  const [duplicateAlerts, setDuplicateAlerts] = useState<DuplicateAlert[]>([]);
  const [pendingSubmit, setPendingSubmit] = useState(false);

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

    // Preflight: verificar duplicatas (apenas se não houve confirmação prévia)
    if (!pendingSubmit) {
      const involucro = formData.involucro?.trim();
      const requisicao = formData.requisicao?.trim();
      const excludeId = initialData?.id;

      if (involucro || requisicao) {
        try {
          const alerts = await checkDuplicate(involucro, requisicao, excludeId);
          if (alerts.length > 0) {
            setDuplicateAlerts(alerts);
            setPendingSubmit(true);
            return; // aguarda confirmação explícita do usuário
          }
        } catch {
          // Falha silenciosa: se o check falhar, não bloqueia o salvamento
        }
      }
    }

    setIsSaving(true);
    try {
      await onSave(formData);
      onClose();
    } catch (err: any) {
      setError(err.message);
      setIsSaving(false);
    }
  };

  const handleConfirmDespiteAlert = async () => {
    setDuplicateAlerts([]);
    setIsSaving(true);
    try {
      await onSave(formData);
      onClose();
    } catch (err: any) {
      setError(err.message);
      setIsSaving(false);
    }
  };

  const handleCancelDuplicate = () => {
    setDuplicateAlerts([]);
    setPendingSubmit(false);
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
                  placeholder="Ex: 123456001 (sem o ano)"
                  title="Informe apenas os números finais da requisição. Não inclua o ano nos primeiros dígitos."
                />
                <p className="text-[10px] text-slate-500 mt-1">Não inclua o ano (ex: 2024) no início do número.</p>
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
               <label className="block text-xs font-semibold text-slate-400 mb-1">DATA DO EVENTO / ENTRADA</label>
               <input
                 type="date"
                 required
                 value={getInputDate()}
                 onChange={handleDateChange}
                 className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none"
               />
               <p className="text-[10px] text-slate-500 mt-1">Informe a data real do evento. Datas retroativas são permitidas.</p>
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
               <label className="block text-xs font-semibold text-slate-400 mb-1">CATEGORIA DO VESTÍGIO</label>
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

          {/* Alerta de duplicata — exige confirmação explícita antes de salvar */}
          {duplicateAlerts.length > 0 && (
            <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <div className="flex items-start gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
                <div className="flex-grow">
                  <p className="text-amber-300 font-bold text-sm mb-2">Possível Duplicata Detectada</p>
                  <ul className="space-y-1.5 mb-3">
                    {duplicateAlerts.map((alert, idx) => (
                      <li key={idx} className="text-amber-200/80 text-xs">
                        <span className="font-semibold capitalize">{alert.field === 'involucro' ? 'Invólucro' : 'Requisição'} {alert.value}</span>
                        {' '}já existe no banco:{' '}
                        <span className="text-amber-100">{alert.material}</span>
                        {alert.registroFav && <span className="text-amber-200/60"> (FAV {alert.registroFav})</span>}
                      </li>
                    ))}
                  </ul>
                  <p className="text-amber-200/60 text-xs mb-3">Confirme se deseja cadastrar mesmo assim ou cancele para revisar os dados.</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleConfirmDespiteAlert()}
                      disabled={isSaving}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded transition-colors"
                    >
                      {isSaving ? 'Salvando...' : 'Salvar Mesmo Assim'}
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelDuplicate}
                      disabled={isSaving}
                      className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-bold rounded transition-colors"
                    >
                      Cancelar e Revisar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

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


import React, { useState, useEffect } from 'react';
import {
  Vestige,
  VestigeItem,
  User,
  ESTADO_CONSERVACAO_OPTIONS,
  DESTINACAO_OPTIONS,
  MOTIVOS_INVOLUCRO,
  MOTIVOS_REQUISICAO,
  getMotivoLabel,
  numerosDe,
} from '../types';
import { XIcon } from './icons/XIcon';
import { checkDuplicate, DuplicateAlert } from '../services/dataService';
import ConfirmEditModal, { computeVestigeChanges, FieldChange } from './ConfirmEditModal';

interface VestigeFormModalProps {
  initialData?: Vestige | null;
  onClose: () => void;
  onSave: (data: Partial<Vestige>) => Promise<void>;
  options: {
    municipios: string[];
    origins: string[];
  };
  /** Apenas para exibir na confirmação quem vai assinar a alteração na auditoria. */
  user?: User;
}

// Linha de invólucro/requisição no formulário. `novo` marca o que foi incluído nesta edição:
// só esses pedem motivo — os já gravados aparecem fixos, com o motivo que têm.
type FormItem = VestigeItem & { novo?: boolean };

const EMPTY_ITEM: FormItem = { numero: '', motivo: '' };

const inputClass = 'bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none';

interface ItemListFieldProps {
  label: string;
  addLabel: string;
  removeTitle: string;
  emptyLabel: string;
  placeholder: string;
  hint?: string;
  items: FormItem[];
  isEdit: boolean;
  motivos: ReadonlyArray<{ value: string; label: string }>;
  onChange: (items: FormItem[]) => void;
}

// Lista dinâmica, sem limite de quantidade — chegar com 2 invólucros ou 2 requisições é comum.
// Cadastro: só números (tudo vira "Registro inicial" no servidor).
// Edição: os gravados ficam fixos e removíveis; os incluídos agora pedem número e motivo.
const ItemListField: React.FC<ItemListFieldProps> = ({
  label,
  addLabel,
  removeTitle,
  emptyLabel,
  placeholder,
  hint,
  items,
  isEdit,
  motivos,
  onChange,
}) => {
  const update = (index: number, patch: Partial<FormItem>) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  // No cadastro sempre sobra uma linha para digitar; na edição a lista pode ficar vazia.
  const remove = (index: number) => {
    const next = items.filter((_, i) => i !== index);
    onChange(!isEdit && next.length === 0 ? [EMPTY_ITEM] : next);
  };

  const add = () => onChange([...items, { ...EMPTY_ITEM, novo: isEdit }]);

  return (
    <div className="md:col-span-2">
      <label className="block text-xs font-semibold text-slate-400 mb-1">{label}</label>
      <div className="space-y-2">
        {isEdit && items.length === 0 && (
          <p className="text-xs text-slate-500 italic">{emptyLabel}</p>
        )}
        {items.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            {isEdit && !item.novo ? (
              // Já gravado: o número não se edita. Para corrigir, remove-se e inclui-se de novo
              // com "Correção de cadastro" — assim nenhuma troca passa sem motivo.
              <div className="flex-grow flex items-center gap-3 bg-slate-800/50 border border-slate-700 rounded px-3 py-2 min-w-0">
                <span className="font-mono text-sm text-white">{item.numero}</span>
                <span className="text-xs text-slate-400 truncate">{getMotivoLabel(item.motivo)}</span>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  value={item.numero}
                  onChange={e => update(index, { numero: e.target.value.replace(/\D/g, '') })}
                  pattern="\d*"
                  inputMode="numeric"
                  className={`${inputClass} flex-grow min-w-0`}
                  placeholder={placeholder}
                  title="Digite apenas números"
                />
                {isEdit && (
                  <select
                    value={item.motivo}
                    onChange={e => update(index, { motivo: e.target.value })}
                    required={item.numero.trim() !== ''}
                    className={`${inputClass} w-40 sm:w-56 shrink-0 appearance-none`}
                    title="Motivo da inclusão"
                  >
                    <option value="" disabled>Motivo...</option>
                    {motivos.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                )}
              </>
            )}
            {(isEdit || items.length > 1) && (
              <button
                type="button"
                onClick={() => remove(index)}
                className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded transition-colors shrink-0"
                title={removeTitle}
              >
                <XIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={add}
        className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors"
      >
        <span className="text-base leading-none">+</span> {addLabel}
      </button>
      {hint && <p className="text-[10px] text-slate-500 mt-1">{hint}</p>}
    </div>
  );
};

const VestigeFormModal: React.FC<VestigeFormModalProps> = ({ initialData, onClose, onSave, options, user }) => {
  const isEdit = Boolean(initialData);
  const [formData, setFormData] = useState<Partial<Vestige>>({
    material: '',
    requisicoes: [EMPTY_ITEM],
    involucros: [EMPTY_ITEM],
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
  // Confirmação obrigatória da edição (ver requestSave). Só existe quando há initialData.
  const [showEditConfirm, setShowEditConfirm] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<FieldChange[]>([]);

  useEffect(() => {
    if (initialData) {
      setFormData({ ...initialData });
    }
  }, [initialData]);

  const handleChange = (field: keyof Vestige, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // A categoria é resolvida pelo nome (planilhaOrigem) no envio, mas só quando o payload não
  // traz categoryId — e na edição ele vem preenchido com o valor antigo. Limpamos o id ao
  // trocar a categoria para que a troca chegue de fato ao servidor: sem isto, o formulário
  // exibia (e a confirmação anunciaria) a categoria nova enquanto o banco mantinha a antiga.
  const handleCategoryChange = (value: string) => {
    setFormData(prev => ({ ...prev, planilhaOrigem: value, categoryId: undefined }));
  };

  // Grava de fato. Só é chamada depois de o usuário confirmar, quando se trata de edição.
  const performSave = async () => {
    setIsSaving(true);
    try {
      await onSave(formData);
      onClose();
    } catch (err: any) {
      // O erro precisa ficar visível no formulário, não atrás da confirmação.
      setShowEditConfirm(false);
      setError(err.message);
      setIsSaving(false);
    }
  };

  // Alterar um vestígio já cadastrado mexe na cadeia de custódia e fica registrado na
  // auditoria em nome de quem salvou: exige confirmação explícita do que será gravado.
  // Cadastro novo não passa por aqui — não há registro anterior para alterar sem querer.
  const requestSave = async () => {
    if (initialData) {
      setPendingChanges(computeVestigeChanges(initialData, formData));
      setShowEditConfirm(true);
      return;
    }
    await performSave();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Com a confirmação aberta, um Enter vindo do formulário atrás dela não pode
    // reabrir o fluxo nem disparar um segundo salvamento.
    if (showEditConfirm || isSaving) return;
    setError(null);

    // Preflight: verificar duplicatas (apenas se não houve confirmação prévia)
    if (!pendingSubmit) {
      const involucros = numerosDe(formData.involucros).map(s => s.trim()).filter(Boolean);
      const requisicoes = numerosDe(formData.requisicoes).map(s => s.trim()).filter(Boolean);
      const excludeId = initialData?.id;

      if (involucros.length > 0 || requisicoes.length > 0) {
        try {
          const alerts = await checkDuplicate(involucros, requisicoes, excludeId);
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

    await requestSave();
  };

  const handleConfirmDespiteAlert = async () => {
    setDuplicateAlerts([]);
    await requestSave();
  };

  const handleCancelDuplicate = () => {
    setDuplicateAlerts([]);
    setPendingSubmit(false);
  };

  const handleCancelEditConfirm = () => {
    setShowEditConfirm(false);
    setPendingChanges([]);
    // Volta ao ponto de partida do fluxo: se o usuário mexer nos dados de novo, a checagem
    // de duplicata roda outra vez em vez de ser pulada pela confirmação anterior.
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
            <ItemListField
              label="NÚMERO(S) DA REQUISIÇÃO"
              addLabel={isEdit ? 'Nova requisição' : 'Inserir nova requisição'}
              removeTitle="Remover esta requisição"
              emptyLabel="Nenhuma requisição cadastrada."
              placeholder="Ex: 123456001 (sem o ano)"
              hint="Não inclua o ano (ex: 2024) no início do número."
              items={formData.requisicoes || []}
              isEdit={isEdit}
              motivos={MOTIVOS_REQUISICAO}
              onChange={items => setFormData(prev => ({ ...prev, requisicoes: items }))}
            />
            <ItemListField
              label="NÚMERO(S) DO INVÓLUCRO"
              addLabel={isEdit ? 'Novo invólucro' : 'Inserir novo invólucro'}
              removeTitle="Remover este invólucro"
              emptyLabel="Nenhum invólucro cadastrado."
              placeholder="Ex: 123456 (Apenas números)"
              items={formData.involucros || []}
              isEdit={isEdit}
              motivos={MOTIVOS_INVOLUCRO}
              onChange={items => setFormData(prev => ({ ...prev, involucros: items }))}
            />

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
                 onChange={e => handleCategoryChange(e.target.value)}
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
              <label className="block text-xs font-semibold text-slate-400 mb-1">SITUAÇÃO</label>
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

            {/* Observação opcional — só faz sentido quando o vestígio saiu da URC.
                Não é obrigatória: o registro oficial de quem retirou está na FAV do PCNET. */}
            {formData.destinacao !== 'NAO_INICIADO' && (
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  OBSERVAÇÃO <span className="font-normal text-slate-500">(opcional — o detalhe oficial está na FAV)</span>
                </label>
                <textarea
                  value={formData.destinacaoObs || ''}
                  onChange={e => handleChange('destinacaoObs' as keyof Vestige, e.target.value)}
                  className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none h-20 resize-none"
                  placeholder="Ex: retirado para incineração"
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

      {/* Trava de intenção: nenhuma edição chega ao servidor sem passar por aqui. */}
      {showEditConfirm && initialData && (
        <ConfirmEditModal
          vestige={initialData}
          changes={pendingChanges}
          user={user}
          isSaving={isSaving}
          onConfirm={() => void performSave()}
          onCancel={handleCancelEditConfirm}
        />
      )}
    </div>
  );
};

export default VestigeFormModal;

import React, { useEffect, useRef } from 'react';
import {
  Vestige,
  User,
  getRoleLabel,
  getEstadoConservacaoLabel,
  getDestinacaoLabel,
} from '../types';

export interface FieldChange {
  label: string;
  before: string;
  after: string;
  /** Campo que muda a identificação oficial ou a localização física do vestígio. */
  critical?: boolean;
}

const EMPTY = '(vazio)';

const asText = (value?: string | null): string => (value ?? '').toString().trim();

const asInvolucros = (value?: string[] | null): string =>
  (value || []).map((item) => item.trim()).filter(Boolean).join(', ');

/**
 * Compara o vestígio como está gravado com o que o formulário vai enviar.
 * Só entram na lista os campos que realmente mudaram — é exatamente essa lista que o
 * usuário confirma antes de a alteração ser gravada e registrada na auditoria.
 * Se algo não aparece aqui, não vai ser alterado.
 */
export const computeVestigeChanges = (original: Vestige, edited: Partial<Vestige>): FieldChange[] => {
  const changes: FieldChange[] = [];

  const push = (label: string, before: string, after: string, critical = false) => {
    if (before === after) return;
    changes.push({ label, before: before || EMPTY, after: after || EMPTY, critical });
  };

  push('Material / Descrição', asText(original.material), asText(edited.material));
  push('Número da requisição', asText(original.requisicao), asText(edited.requisicao));
  push('Invólucro(s)', asInvolucros(original.involucros), asInvolucros(edited.involucros), true);
  push('FAV', asText(original.fav), asText(edited.fav), true);
  push('Data do evento / entrada', asText(original.data), asText(edited.data));
  push('Município', asText(original.municipio), asText(edited.municipio));
  push('Categoria', asText(original.planilhaOrigem), asText(edited.planilhaOrigem));
  push(
    'Estado de conservação',
    getEstadoConservacaoLabel(asText(original.estadoConservacao)),
    getEstadoConservacaoLabel(asText(edited.estadoConservacao)),
  );
  push(
    'Situação',
    getDestinacaoLabel(asText(original.destinacao)),
    getDestinacaoLabel(asText(edited.destinacao)),
    true,
  );
  push('Observação', asText(original.destinacaoObs), asText(edited.destinacaoObs));

  return changes;
};

interface ConfirmEditModalProps {
  vestige: Vestige;
  changes: FieldChange[];
  user?: User;
  isSaving: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmEditModal: React.FC<ConfirmEditModalProps> = ({
  vestige,
  changes,
  user,
  isSaving,
  onConfirm,
  onCancel,
}) => {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // O foco começa no botão de voltar, nunca no de confirmar: um Enter acidental vindo do
  // formulário não pode ser o que grava a alteração.
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSaving) onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSaving, onCancel]);

  const hasChanges = changes.length > 0;
  const criticalChanges = changes.filter((change) => change.critical);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-edit-title"
      className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-[60] p-4 animate-in fade-in duration-150"
    >
      <div className="bg-slate-900 rounded-xl shadow-2xl w-full max-w-xl border border-amber-500/40 max-h-[90vh] flex flex-col">

        <div className="flex items-start gap-3 p-5 border-b border-slate-700 bg-amber-500/10 rounded-t-xl">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <div>
            <h2 id="confirm-edit-title" className="text-lg font-bold text-white leading-tight">
              {hasChanges ? 'Confirmar alteração do vestígio' : 'Nenhuma alteração a confirmar'}
            </h2>
            <p className="text-xs text-amber-200/70 mt-1">
              FAV <span className="font-mono text-amber-200">{vestige.fav || 'não informada'}</span>
              {vestige.requisicao && (
                <> · Requisição <span className="font-mono text-amber-200">{vestige.requisicao}</span></>
              )}
            </p>
          </div>
        </div>

        <div className="p-5 overflow-y-auto custom-scrollbar flex-grow">
          {hasChanges ? (
            <>
              <p className="text-sm text-slate-300 leading-relaxed mb-4">
                Você está prestes a alterar um vestígio já cadastrado. Confira abaixo{' '}
                <span className="text-white font-semibold">exatamente o que será gravado</span> —
                nada fora desta lista será modificado.
              </p>

              <ul className="space-y-3">
                {changes.map((change, index) => (
                  <li
                    key={index}
                    className={`rounded-lg border p-3 ${
                      change.critical
                        ? 'border-amber-500/40 bg-amber-500/5'
                        : 'border-slate-700 bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {change.label}
                      </span>
                      {change.critical && (
                        <span className="text-[9px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded">
                          campo crítico
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-start gap-1.5 sm:gap-3 text-sm">
                      <span className="flex-1 text-slate-400 line-through decoration-slate-600 break-words">
                        {change.before}
                      </span>
                      <span className="text-slate-500 shrink-0 select-none" aria-hidden="true">-&gt;</span>
                      <span className="flex-1 text-emerald-300 font-medium break-words">
                        {change.after}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>

              {criticalChanges.length > 0 && (
                <p className="mt-4 text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/25 rounded-lg p-3 leading-relaxed">
                  Esta edição altera {criticalChanges.length === 1 ? 'um campo que identifica' : 'campos que identificam'} o
                  vestígio ou sua situação física na URC. Confirme que os números conferem com o
                  material antes de prosseguir.
                </p>
              )}

              <p className="mt-4 text-xs text-slate-400 leading-relaxed">
                A alteração será registrada na cadeia de custódia
                {user && (
                  <>
                    {' '}em nome de{' '}
                    <span className="text-slate-200 font-semibold">{user.name}</span>{' '}
                    <span className="text-slate-500">({getRoleLabel(user.role)})</span>
                  </>
                )}
                , com data e hora.
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-300 leading-relaxed">
              Nenhum campo do vestígio foi modificado, então não há nada para gravar. Volte ao
              formulário para revisar os dados ou cancele a edição.
            </p>
          )}
        </div>

        <div className="p-5 border-t border-slate-700 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="px-4 py-2 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded font-semibold text-sm transition-colors disabled:opacity-50"
          >
            Voltar e revisar
          </button>
          {hasChanges && (
            <button
              type="button"
              onClick={onConfirm}
              disabled={isSaving}
              className="px-6 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-sm rounded shadow-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {isSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Gravando...
                </>
              ) : (
                'Confirmar e gravar alteração'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConfirmEditModal;

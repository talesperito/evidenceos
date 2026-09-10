import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  User,
  WITHDRAWAL_STATUS_OPTIONS,
  WithdrawalRequest,
  WithdrawalRequestItem,
  canManageWithdrawals,
  estaForaDaUrc,
  getWithdrawalReasonLabel,
  getWithdrawalStatusLabel,
} from '../types';
import {
  WithdrawalListResult,
  completeWithdrawal,
  listWithdrawalRequests,
  updateWithdrawalStatus,
} from '../services/withdrawalService';
import { XIcon } from './icons/XIcon';
import { CalendarIcon } from './icons/CalendarIcon';

// Painel "Retiradas Agendadas" (docs/plans/2026-08-25-solicitacao-retirada.md, Parte 5.9).
// O perito abre, vê as demandas, recebe a pessoa e registra ali mesmo o que saiu.
// Todos os perfis veem; só ADMIN e PERITO agem — e quem barra de fato é o servidor.

interface WithdrawalRequestsModalProps {
  user: User;
  onClose: () => void;
  /** Recarrega os vestígios da tela de trás (faixa vermelha depois de registrar a retirada). */
  onDataChanged?: () => void;
}

// O backend devolve ISO em UTC; quem converte para o fuso de quem olha é o navegador.
const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

const STATUS_BADGE: Record<string, string> = {
  SOLICITADA: 'bg-amber-500/15 text-amber-400 ring-amber-500/30',
  CONCLUIDA: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30',
  CANCELADA: 'bg-zinc-700/60 text-zinc-300 ring-zinc-500/30',
  NAO_COMPARECEU: 'bg-orange-500/15 text-orange-400 ring-orange-500/30',
};

const badgeBase = 'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ring-1';

// Já consta fora da URC: o backend ignora o item ao registrar a retirada.
const jaForaDaUrc = (item: WithdrawalRequestItem) => estaForaDaUrc(item.destinacao ?? '');

const itemIdentificacao = (item: WithdrawalRequestItem) => [
  `FAV ${item.fav || 'N/I'}`,
  item.requisicoes.length > 0 ? `Req. ${item.requisicoes.join(', ')}` : null,
  item.involucros.length > 0 ? `Inv. ${item.involucros.join(', ')}` : null,
].filter(Boolean).join(' · ');

// =====================================================================================
// Diálogo "Registrar retirada" — retirada parcial é o caso normal (Parte 2.10).
// =====================================================================================
interface CompleteDialogProps {
  request: WithdrawalRequest;
  onCancel: () => void;
  onDone: () => void;
  onFailed: (message: string) => void;
}

const CompleteWithdrawalDialog: React.FC<CompleteDialogProps> = ({ request, onCancel, onDone, onFailed }) => {
  // Todos marcados por padrão: "levou tudo" continua sendo um clique.
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(request.items.filter((item) => !item.vestigeDeleted && !jaForaDaUrc(item)).map((item) => item.vestigeId)),
  );
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const toggle = (vestigeId: string) => {
    setChecked((previous) => {
      const next = new Set(previous);
      if (next.has(vestigeId)) next.delete(vestigeId);
      else next.add(vestigeId);
      return next;
    });
  };

  // O que vai para o backend: os marcados + os que já constam fora da URC (ele os ignora, sem log novo).
  const withdrawnIds = request.items
    .filter((item) => jaForaDaUrc(item) || (!item.vestigeDeleted && checked.has(item.vestigeId)))
    .map((item) => item.vestigeId);
  // O que de fato muda de situação — é esse número que o aviso precisa mostrar.
  const aMovimentar = request.items.filter(
    (item) => !jaForaDaUrc(item) && !item.vestigeDeleted && checked.has(item.vestigeId),
  ).length;

  const handleConfirm = async () => {
    if (submitting || withdrawnIds.length === 0) return;
    setSubmitting(true);
    try {
      await completeWithdrawal(request.id, withdrawnIds, note.trim() || undefined);
      onDone();
    } catch (err) {
      onFailed(err instanceof Error ? err.message : 'Falha ao registrar a retirada.');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="complete-withdrawal-title"
      className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
    >
      <div className="bg-zinc-900 border border-amber-500/40 rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="p-5 border-b border-white/5 bg-amber-500/10">
          <h3 id="complete-withdrawal-title" className="text-lg font-bold text-white">Registrar retirada</h3>
          <p className="text-xs text-amber-200/70 mt-1">
            Agendada para {formatDateTime(request.scheduledFor)} · solicitada por {request.requesterName ?? '—'}
          </p>
        </div>

        <div className="p-5 overflow-y-auto custom-scrollbar flex-grow space-y-4">
          <p className="text-sm text-zinc-300">Marque só os materiais que <strong className="text-white">saíram de fato</strong>. Os desmarcados continuam constando na URC.</p>

          <ul className="space-y-2">
            {request.items.map((item) => {
              const foraDaUrc = jaForaDaUrc(item);
              const disabled = foraDaUrc || item.vestigeDeleted;
              const isChecked = foraDaUrc || (!item.vestigeDeleted && checked.has(item.vestigeId));
              return (
                <li key={item.id}>
                  <label className={`flex items-start gap-3 rounded-lg border px-3 py-2 ${disabled ? 'border-white/5 bg-white/[0.02] opacity-70' : 'border-white/10 bg-white/5 cursor-pointer hover:border-amber-500/40'}`}>
                    <input
                      type="checkbox"
                      className="mt-1 accent-amber-500"
                      checked={isChecked}
                      disabled={disabled}
                      onChange={() => toggle(item.vestigeId)}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm text-white font-semibold truncate">{item.material ?? 'N/I'}</span>
                      <span className="block text-xs text-zinc-400 font-mono">{itemIdentificacao(item)}</span>
                      {foraDaUrc && <span className="block text-[11px] text-red-400 mt-0.5">já consta fora da URC</span>}
                      {item.vestigeDeleted && <span className="block text-[11px] text-zinc-500 mt-0.5">(vestígio excluído do cadastro)</span>}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>

          <p className="text-sm text-zinc-300">
            <strong className="text-white">{aMovimentar} de {request.items.length}</strong> materiais serão marcados como retirados.
          </p>

          <div>
            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Observação (opcional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:border-amber-500 outline-none h-16 resize-none"
              placeholder="Ex.: faltou documento para liberar o item desmarcado"
            />
          </div>

          {withdrawnIds.length === 0 ? (
            <p className="text-xs text-zinc-400 bg-zinc-800/60 border border-zinc-700 rounded-lg p-3">
              Nenhum material marcado. Se ninguém compareceu, use a ação "Não compareceu".
            </p>
          ) : aMovimentar > 0 ? (
            <p className="text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/25 rounded-lg p-3 leading-relaxed">
              ⚠️ <strong>{aMovimentar} {aMovimentar === 1 ? 'material passará' : 'materiais passarão'}</strong> a constar como{' '}
              <strong>retirados da URC</strong> e receberão a faixa vermelha no card. A ação fica registrada no histórico de
              destinação de cada vestígio, com seu nome e a data. <strong>Não é possível desfazer por aqui.</strong>
            </p>
          ) : (
            <p className="text-xs text-zinc-400 bg-zinc-800/60 border border-zinc-700 rounded-lg p-3">
              Nenhum material mudará de situação: os marcados já constam fora da URC. A solicitação será concluída.
            </p>
          )}
        </div>

        <div className="p-5 border-t border-white/5 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2 text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg font-semibold text-sm transition-colors disabled:opacity-50"
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={submitting || withdrawnIds.length === 0}
            className="px-6 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-sm rounded-lg shadow-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Registrando...' : 'Confirmar retirada'}
          </button>
        </div>
      </div>
    </div>
  );
};

// =====================================================================================
// Painel
// =====================================================================================
const WithdrawalRequestsModal: React.FC<WithdrawalRequestsModalProps> = ({ user, onClose, onDataChanged }) => {
  const [statusFilter, setStatusFilter] = useState('SOLICITADA');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [result, setResult] = useState<WithdrawalListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [completing, setCompleting] = useState<WithdrawalRequest | null>(null);

  const canManage = canManageWithdrawals(user);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // Datas do filtro no fuso local: o dia inteiro, do primeiro ao último instante.
      setResult(await listWithdrawalRequests({
        status: statusFilter || undefined,
        from: fromDate ? new Date(`${fromDate}T00:00:00`).toISOString() : undefined,
        to: toDate ? new Date(`${toDate}T23:59:59.999`).toISOString() : undefined,
      }));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Falha ao carregar as retiradas.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, fromDate, toDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleExpanded = (id: string) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Cancelar / Não compareceu: nenhum vestígio muda — ninguém saiu da URC.
  const handleStatusChange = async (request: WithdrawalRequest, status: 'CANCELADA' | 'NAO_COMPARECEU') => {
    const quando = formatDateTime(request.scheduledFor);
    const pergunta = status === 'CANCELADA'
      ? `Cancelar a solicitação de ${quando} (${request.items.length} item(ns))?`
      : `Registrar que ninguém compareceu à retirada de ${quando}?`;
    if (!window.confirm(`${pergunta}\n\nNenhum vestígio será alterado: todos continuam constando na URC.`)) return;

    setBusyId(request.id);
    setActionError(null);
    try {
      await updateWithdrawalStatus(request.id, status);
    } catch (err) {
      // Inclui o 409 de quem agiu na mesma solicitação em outra aba: mostra e recarrega, sem repetir.
      setActionError(err instanceof Error ? err.message : 'Falha ao atualizar a solicitação.');
    } finally {
      setBusyId(null);
      await load();
    }
  };

  const handleCompleted = async () => {
    setCompleting(null);
    setActionError(null);
    await load();
    onDataChanged?.(); // faixa vermelha nos cards atrás do modal, sem recarregar a página
  };

  const handleCompleteFailed = async (message: string) => {
    setCompleting(null);
    setActionError(message);
    await load();
  };

  const items = result?.items ?? [];
  const total = result?.meta.total ?? 0;
  const agora = Date.now();

  return createPortal(
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Cabeçalho */}
        <div className="flex justify-between items-center p-5 border-b border-white/5 bg-zinc-800/50">
          <div className="flex items-center gap-3">
            <div className="bg-amber-500/20 p-2 rounded-lg text-amber-500">
              <CalendarIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Retiradas Agendadas</h2>
              <p className="text-xs text-zinc-400">
                {loading ? 'Carregando...' : `${total} solicitação(ões) no filtro atual`}
                {!loading && items.length < total ? ` · exibindo as ${items.length} primeiras` : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-zinc-400 hover:text-white transition-colors" title="Fechar">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Filtros */}
        <div className="px-5 py-3 border-b border-white/5 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-white text-sm focus:border-amber-500 outline-none"
            >
              {WITHDRAWAL_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              <option value="">Todos</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">De</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-white text-sm focus:border-amber-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Até</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-white text-sm focus:border-amber-500 outline-none"
            />
          </div>
          {(fromDate || toDate) && (
            <button
              type="button"
              onClick={() => { setFromDate(''); setToDate(''); }}
              className="text-xs text-zinc-400 hover:text-amber-400 pb-2"
            >
              Limpar datas
            </button>
          )}
        </div>

        {actionError && (
          <div className="mx-5 mt-3 bg-red-500/10 border border-red-500/40 rounded-lg p-3 flex justify-between gap-3">
            <p className="text-sm text-red-400">{actionError}</p>
            <button onClick={() => setActionError(null)} className="text-red-300 hover:text-white shrink-0" title="Dispensar">
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Lista */}
        <div className="flex-grow overflow-y-auto custom-scrollbar p-5">
          {loading ? (
            <div className="text-center text-zinc-500 py-10">Carregando retiradas...</div>
          ) : loadError ? (
            <div className="text-center py-10 space-y-3">
              <p className="text-red-400">{loadError}</p>
              <button
                onClick={() => void load()}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold uppercase rounded-lg border border-zinc-700"
              >
                Tentar de novo
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center text-zinc-500 py-10">Nenhuma retirada agendada para o filtro atual.</div>
          ) : (
            <ul className="space-y-3">
              {items.map((request) => {
                const isOpen = expanded.has(request.id);
                const atrasada = request.status === 'SOLICITADA' && new Date(request.scheduledFor).getTime() < agora;
                const podeAgir = canManage && request.status === 'SOLICITADA';
                const busy = busyId === request.id;

                return (
                  <li key={request.id} className={`rounded-xl border bg-white/[0.03] ${request.deadlineOverrideReason ? 'border-amber-500/30' : 'border-white/10'}`}>
                    <button
                      type="button"
                      onClick={() => toggleExpanded(request.id)}
                      aria-expanded={isOpen}
                      className="w-full flex flex-wrap items-center gap-x-3 gap-y-2 p-4 text-left hover:bg-white/[0.03] rounded-xl transition-colors"
                    >
                      <span className="font-mono text-sm text-white">{formatDateTime(request.scheduledFor)}</span>
                      <span className="text-xs text-zinc-400">{request.items.length} {request.items.length === 1 ? 'item' : 'itens'}</span>
                      <span className="text-xs text-zinc-300 truncate max-w-[12rem]">{request.requesterName ?? '—'}</span>
                      <span className={`${badgeBase} ${STATUS_BADGE[request.status] ?? STATUS_BADGE.CANCELADA}`}>
                        {getWithdrawalStatusLabel(request.status)}
                      </span>
                      {atrasada && (
                        <span className={`${badgeBase} bg-amber-500/20 text-amber-300 ring-amber-500/40`}>Atrasada</span>
                      )}
                      {request.deadlineOverrideReason && (
                        <span className={`${badgeBase} bg-orange-500/15 text-orange-300 ring-orange-500/40`}>🔶 Urgência — fora do prazo de 24h</span>
                      )}
                      <span className="ml-auto text-zinc-500 text-xs">{isOpen ? '▲' : '▼'}</span>
                    </button>

                    {isOpen && (
                      <div className="border-t border-white/5 p-4 space-y-3">
                        {request.deadlineOverrideReason && (
                          <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3 text-sm">
                            <p className="text-orange-300 font-bold">Agendada fora do prazo de 24h — autorizada por {request.requesterName ?? '—'}</p>
                            <p className="text-orange-100/80 mt-1 whitespace-pre-wrap">{request.deadlineOverrideReason}</p>
                          </div>
                        )}

                        <ul className="space-y-2">
                          {request.items.map((item) => (
                            <li key={item.id} className="bg-white/5 border border-white/5 rounded-lg px-3 py-2">
                              <p className="text-sm text-white font-semibold">
                                {item.material ?? 'N/I'}
                                {item.vestigeDeleted && <span className="text-zinc-500 font-normal text-xs"> (vestígio excluído do cadastro)</span>}
                              </p>
                              <p className="text-xs text-zinc-400 font-mono mt-0.5">{itemIdentificacao(item)}</p>
                              <p className="text-xs text-amber-200/80 mt-0.5">
                                Motivo: {getWithdrawalReasonLabel(item.reason)}
                                {item.reason === 'OUTROS' && item.reasonDetail ? ` — ${item.reasonDetail}` : ''}
                              </p>
                            </li>
                          ))}
                        </ul>

                        {request.notes && (
                          <p className="text-xs text-zinc-300">
                            <span className="text-zinc-500 font-bold uppercase tracking-wider text-[10px]">Observações: </span>
                            <span className="whitespace-pre-wrap">{request.notes}</span>
                          </p>
                        )}

                        <p className="text-[11px] text-zinc-500">Solicitada em {formatDateTime(request.requestedAt)}</p>

                        {request.status !== 'SOLICITADA' && (
                          <p className="text-xs text-zinc-300 bg-zinc-800/60 border border-zinc-700 rounded-lg p-3">
                            {getWithdrawalStatusLabel(request.status)}
                            {request.statusChangedByName ? ` por ${request.statusChangedByName}` : ''}
                            {request.statusChangedAt ? ` em ${formatDateTime(request.statusChangedAt)}` : ''}
                            {request.statusNote && <span className="block mt-1 text-zinc-400 whitespace-pre-wrap">{request.statusNote}</span>}
                          </p>
                        )}

                        {podeAgir && (
                          <div className="space-y-2 pt-1">
                            {/* A lista acima é só leitura: a escolha do que saiu é feita no diálogo do
                                "Registrar retirada". Sem esta frase, o usuário tenta clicar nos itens. */}
                            <p className="text-xs text-zinc-400">
                              Só parte dos materiais saiu? Clique em <strong className="text-amber-400">"Registrar retirada"</strong> e desmarque o que ficou.
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => setCompleting(request)}
                                disabled={busy}
                                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-lg transition-colors disabled:opacity-50"
                              >
                                Registrar retirada
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleStatusChange(request, 'NAO_COMPARECEU')}
                                disabled={busy}
                                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-xs rounded-lg border border-zinc-700 transition-colors disabled:opacity-50"
                              >
                                Não compareceu
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleStatusChange(request, 'CANCELADA')}
                                disabled={busy}
                                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-xs rounded-lg border border-zinc-700 transition-colors disabled:opacity-50"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {completing && (
        <CompleteWithdrawalDialog
          request={completing}
          onCancel={() => setCompleting(null)}
          onDone={() => void handleCompleted()}
          onFailed={(message) => void handleCompleteFailed(message)}
        />
      )}
    </div>,
    document.body,
  );
};

export default WithdrawalRequestsModal;

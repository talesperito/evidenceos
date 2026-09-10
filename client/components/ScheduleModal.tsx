
import React, { useMemo, useState } from 'react';
import {
  OpenWithdrawalItem,
  User,
  Vestige,
  WITHDRAWAL_REASONS,
  WithdrawalRequest,
  estaForaDaUrc,
  getWithdrawalReasonLabel,
} from '../types';
import { XIcon } from './icons/XIcon';
import { CalendarIcon } from './icons/CalendarIcon';
import {
  createWithdrawalRequest,
  formatScheduledFull,
  formatScheduledShort,
} from '../services/withdrawalService';

// Agendamento de retirada (docs/plans/2026-08-25-solicitacao-retirada.md, Parte 5.4):
// 1) formulário → grava a solicitação no EvidenceOS; 2) confirmação do que foi registrado.
// O acompanhamento é pelo painel "Retiradas Agendadas" — o Google Agenda saiu em 2026-09-10.

interface ScheduleModalProps {
  vestiges: Vestige[];
  onClose: () => void;
  /** Chamado assim que a solicitação é gravada, para quem renderiza atualizar o selo dos cards. */
  onCreated?: (request: WithdrawalRequest) => void;
  /** Solicitações abertas por vestígio — alimenta o aviso (não bloqueante) de duplicidade. */
  openWithdrawals?: Map<string, OpenWithdrawalItem>;
  /** Só decide se o caminho da exceção das 24h aparece. Quem decide de fato é o servidor. */
  user?: User;
}

const ANTECEDENCIA_MINIMA_MS = 24 * 60 * 60 * 1000;
const MAX_ITEMS_PER_REQUEST = 200; // espelho de withdrawalRoutes.ts

// Data LOCAL no formato do <input type="date">. Com toISOString() a data sairia em UTC: depois das
// 21h em Brasília o seletor já trataria o dia seguinte como "hoje".
const toDateInputValue = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const ErrorIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-red-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
);

const WarningIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-amber-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
);

const ScheduleModal: React.FC<ScheduleModalProps> = ({ vestiges, onClose, onCreated, openWithdrawals, user }) => {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createdRequest, setCreatedRequest] = useState<WithdrawalRequest | null>(null);
  const [overrideReason, setOverrideReason] = useState(''); // justificativa de urgência (só ADMIN)

  // Estado para armazenar o motivo de cada vestígio (Chave: ID do vestígio). Guarda o CÓDIGO.
  const [selectedReasons, setSelectedReasons] = useState<Record<string, string>>({});
  // Estado para armazenar o texto customizado de "Outros" (Chave: ID do vestígio)
  const [customReasonTexts, setCustomReasonTexts] = useState<Record<string, string>>({});

  const isBulk = vestiges.length > 1;
  // Na dúvida, não é admin: o card repassa um `user` opcional, que pode chegar indefinido.
  const isAdmin = user?.role === 'ADMIN';

  const selectedDateTime = date && time ? new Date(`${date}T${time}`) : null;
  // Recalculado a cada render: o aviso âmbar do ADMIN aparece e some conforme a data muda,
  // antes de qualquer clique em confirmar.
  const foraDoPrazo = selectedDateTime !== null && selectedDateTime.getTime() < Date.now() + ANTECEDENCIA_MINIMA_MS;

  // O seletor oferece hoje só para o ADMIN (é o caso da urgência); para os demais, a partir de amanhã.
  // Fixar amanhã para todos mataria a exceção sem erro nenhum aparecer.
  const minDate = useMemo(() => {
    const base = new Date();
    if (!isAdmin) base.setDate(base.getDate() + 1);
    return toDateInputValue(base);
  }, [isAdmin]);

  // Avisa, sem impedir: remarcação e dado defasado são casos legítimos (Parte 2.5).
  const duplicateWarnings = useMemo(() => vestiges.flatMap((v) => {
    const warnings: string[] = [];
    const fav = v.fav || 'sem número';
    const open = openWithdrawals?.get(v.id);
    if (open) warnings.push(`FAV ${fav} já tem retirada agendada para ${formatScheduledShort(open.scheduledFor)}.`);
    if (estaForaDaUrc(v.destinacao)) warnings.push(`FAV ${fav} consta como já retirado da URC.`);
    return warnings;
  }), [vestiges, openWithdrawals]);

  // Helper para aplicar motivo a todos (Usabilidade)
  const handleApplyToAll = (reason: string) => {
    const newReasons: Record<string, string> = {};
    vestiges.forEach(v => {
        newReasons[v.id] = reason;
    });
    setSelectedReasons(newReasons);

    // Limpa os textos customizados se mudar para algo que não seja Outros
    if (reason !== 'OUTROS') {
        setCustomReasonTexts({});
    }
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return; // duplo clique não pode criar duas solicitações
    setError(null);

    if (!selectedDateTime) {
        setError("Por favor, selecione data e hora para o agendamento.");
        return;
    }

    // --- VALIDAÇÃO DE 24 HORAS (repetida no servidor, que é quem decide) ---
    if (foraDoPrazo && !isAdmin) {
        setError("ERRO: Agendamento bloqueado. É necessária antecedência mínima de 24h. Para urgências, contate a administração da URC.");
        return;
    }
    if (foraDoPrazo && isAdmin && !overrideReason.trim()) {
        setError("Para agendar com menos de 24h de antecedência, descreva o motivo da urgência.");
        return;
    }

    if (vestiges.length > MAX_ITEMS_PER_REQUEST) {
        setError(`O sistema registra no máximo ${MAX_ITEMS_PER_REQUEST} itens por solicitação. Divida em mais de um agendamento.`);
        return;
    }

    // Validação: Verifica se todos os itens têm motivo
    const missingReason = vestiges.some(v => !selectedReasons[v.id]);
    if (missingReason) {
        setError("Atenção: É obrigatório informar o motivo da retirada para TODOS os itens da lista.");
        return;
    }

    // Validação: Verifica se "Outros" tem texto preenchido
    const missingCustomText = vestiges.some(v => selectedReasons[v.id] === 'OUTROS' && !customReasonTexts[v.id]?.trim());
    if (missingCustomText) {
        setError("Para motivos classificados como 'Outros', é obrigatório digitar a justificativa.");
        return;
    }

    setSubmitting(true);
    try {
      const created = await createWithdrawalRequest({
        scheduledFor: selectedDateTime.toISOString(),
        notes: notes.trim() || undefined,
        deadlineOverrideReason: foraDoPrazo && isAdmin ? overrideReason.trim() : undefined,
        items: vestiges.map((v) => ({
          vestigeId: v.id,
          reason: selectedReasons[v.id],
          reasonDetail: selectedReasons[v.id] === 'OUTROS' ? customReasonTexts[v.id]?.trim() : undefined,
        })),
      });
      setCreatedRequest(created);
      onCreated?.(created);
    } catch (err) {
      // Sem registro, nada aconteceu: o erro fica visível e o formulário preservado para nova tentativa.
      setError(err instanceof Error ? err.message : 'Falha ao registrar a solicitação.');
    } finally {
      setSubmitting(false);
    }
  };

  // ===================== FASE 2 — SUCESSO =====================
  if (createdRequest) {
    const total = createdRequest.items.length;
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
        <div className="bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden">
          <div className="flex justify-between items-center p-5 border-b border-white/5 bg-zinc-800/50 shrink-0">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <div className="bg-emerald-500/20 p-1.5 rounded-lg text-emerald-400">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </div>
              Solicitação registrada
            </h2>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-zinc-400 hover:text-white transition-colors" title="Fechar">
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          <div aria-live="polite" className="p-6 flex-grow overflow-y-auto custom-scrollbar space-y-4">
            <p className="text-sm text-emerald-200 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
              O registro está salvo no EvidenceOS e já aparece no painel <strong>Retiradas Agendadas</strong>.
            </p>

            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Data e hora</dt>
                <dd className="text-white font-medium">{formatScheduledFull(createdRequest.scheduledFor)}</dd>
              </div>
              <div>
                <dt className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Itens</dt>
                <dd className="text-white font-medium">{total}</dd>
              </div>
              <div>
                <dt className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Solicitante</dt>
                <dd className="text-white font-medium">{createdRequest.requesterName ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Identificador</dt>
                <dd className="text-zinc-400 font-mono text-[11px] break-all">{createdRequest.id}</dd>
              </div>
            </dl>

            {createdRequest.deadlineOverrideReason && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-sm">
                <p className="text-amber-300 font-bold">Registrada como urgência — fora do prazo de 24h</p>
                <p className="text-amber-100/80 mt-1 whitespace-pre-wrap">{createdRequest.deadlineOverrideReason}</p>
              </div>
            )}

            <ul className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar">
              {createdRequest.items.map((item) => (
                <li key={item.id} className="bg-white/5 border border-white/5 rounded-lg px-3 py-2 text-xs">
                  <p className="text-white font-semibold truncate">{item.material ?? 'N/I'}</p>
                  <p className="text-zinc-400 font-mono mt-0.5">
                    FAV: {item.fav || 'N/I'} · {getWithdrawalReasonLabel(item.reason)}
                    {item.reason === 'OUTROS' && item.reasonDetail ? `: ${item.reasonDetail}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          <div className="p-5 border-t border-white/5 bg-zinc-900 flex justify-end shrink-0">
            <button
              type="button"
              onClick={onClose}
              autoFocus
              className="px-6 py-2.5 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white font-bold rounded-lg shadow-lg shadow-amber-900/30 transition-all text-sm"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ===================== FASE 1 — FORMULÁRIO =====================
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden">

        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-white/5 bg-zinc-800/50 shrink-0">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <div className="bg-amber-500/20 p-1.5 rounded-lg text-amber-500">
                <CalendarIcon className="w-5 h-5" />
            </div>
            {isBulk ? `Agendar Retirada (${vestiges.length} itens)` : 'Agendar Retirada'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-zinc-400 hover:text-white transition-colors">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={(e) => void handleConfirm(e)} className="flex flex-col flex-grow overflow-hidden bg-zinc-900/50">

            {/* Aviso Informativo (Azul/Neutro) */}
            <div className="px-6 pt-6 shrink-0 space-y-3">
                <div className="bg-blue-500/10 border border-blue-500/20 p-3 rounded-lg flex gap-3 items-start">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                    <p className="text-sm text-blue-200">
                        O motivo da retirada é obrigatório. O agendamento deve respeitar <strong>antecedência mínima de 24h</strong>.
                    </p>
                </div>

                {vestiges.length > MAX_ITEMS_PER_REQUEST && (
                    <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-lg flex gap-3 items-start">
                        <WarningIcon />
                        <p className="text-sm text-amber-200">
                            O sistema registra no máximo {MAX_ITEMS_PER_REQUEST} itens por solicitação. Divida em mais de um agendamento.
                        </p>
                    </div>
                )}

                {duplicateWarnings.length > 0 && (
                    <div className="bg-yellow-500/10 border border-yellow-500/30 p-3 rounded-lg flex gap-3 items-start">
                        <WarningIcon />
                        <div className="text-xs text-yellow-200/90 space-y-1">
                            {duplicateWarnings.map((warning, index) => <p key={index}>{warning}</p>)}
                            <p className="text-yellow-200/60">O agendamento pode seguir mesmo assim.</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Lista de Itens com Seleção de Motivo */}
            <div className="px-6 py-4 flex-grow overflow-y-auto custom-scrollbar">
                <div className="flex justify-between items-center mb-2 sticky top-0 bg-zinc-900 z-10 py-2 border-b border-white/5">
                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">
                        Itens e Motivos <span className="text-red-400" title="Obrigatório">*</span>
                    </label>
                    {isBulk && (
                        <select
                            className="text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-amber-500 focus:border-amber-500 outline-none cursor-pointer hover:bg-zinc-700 transition-colors font-medium"
                            onChange={(e) => handleApplyToAll(e.target.value)}
                            defaultValue=""
                        >
                            <option value="" disabled>Aplicar motivo a todos...</option>
                            {WITHDRAWAL_REASONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    )}
                </div>

                <div className="space-y-3">
                  {vestiges.map(v => (
                    <div key={v.id} className="bg-white/5 p-3 rounded-lg border border-white/5 flex flex-col sm:flex-row gap-3 items-start sm:items-center hover:border-white/10 transition-colors">
                        <div className="flex-grow min-w-0">
                            <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold text-white truncate">{v.material}</p>
                                {!selectedReasons[v.id] && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" title="Motivo pendente"></span>
                                )}
                            </div>
                            <p className="text-xs text-zinc-500 font-mono mt-0.5">FAV: {v.fav} | Inv: {v.involucros.map(i => i.numero).join(', ') || 'N/I'}</p>
                        </div>

                        <div className="flex flex-col gap-2 w-full sm:w-auto shrink-0">
                            <select
                                required
                                value={selectedReasons[v.id] || ''}
                                onChange={(e) => setSelectedReasons(prev => ({...prev, [v.id]: e.target.value}))}
                                className={`bg-black/40 border rounded-lg px-2 py-1.5 text-white text-xs focus:ring-1 outline-none w-full sm:w-40 transition-colors ${
                                    !selectedReasons[v.id]
                                    ? 'border-red-900/50 focus:border-red-500 focus:ring-red-500/50'
                                    : 'border-zinc-700 focus:border-amber-500 focus:ring-amber-500/50'
                                }`}
                            >
                                <option value="" disabled>Selecione o motivo...</option>
                                {WITHDRAWAL_REASONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>

                            {selectedReasons[v.id] === 'OUTROS' && (
                                <input
                                    type="text"
                                    maxLength={200}
                                    required
                                    placeholder="Justificativa (máx. 200)"
                                    value={customReasonTexts[v.id] || ''}
                                    onChange={(e) => setCustomReasonTexts(prev => ({...prev, [v.id]: e.target.value}))}
                                    className="bg-black/40 border border-zinc-700 rounded-lg px-2 py-1.5 text-white text-xs focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none w-full sm:w-40 animate-in fade-in slide-in-from-top-1"
                                    autoFocus
                                />
                            )}
                        </div>
                    </div>
                  ))}
                </div>
            </div>

            {/* Configuração de Data/Hora e Footer */}
            <div className="p-6 pt-4 bg-zinc-900 border-t border-white/5 shrink-0 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1.5">
                            Data <span className="text-red-400">*</span>
                        </label>
                        <input
                            type="date"
                            required
                            min={minDate}
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 outline-none transition-all"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1.5">
                            Horário <span className="text-red-400">*</span>
                        </label>
                        <input
                            type="time"
                            required
                            value={time}
                            onChange={(e) => setTime(e.target.value)}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 outline-none transition-all"
                        />
                    </div>
                </div>

                {/* Exceção das 24h: só para ADMIN, e em âmbar — ele não está barrado, está pagando pedágio. */}
                {foraDoPrazo && isAdmin && (
                    <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-lg space-y-2">
                        <div className="flex gap-3 items-start">
                            <WarningIcon />
                            <p className="text-sm text-amber-200">
                                <strong>Este agendamento está abaixo do prazo mínimo de 24h.</strong> Como administrador, você pode prosseguir, mas a urgência ficará <strong>registrada e identificada</strong> nesta solicitação.
                            </p>
                        </div>
                        <label className="block text-xs font-bold text-amber-300/80 uppercase tracking-wider">
                            Justificativa da urgência <span className="text-red-400">*</span>
                        </label>
                        <textarea
                            value={overrideReason}
                            onChange={(e) => setOverrideReason(e.target.value)}
                            required
                            maxLength={500}
                            placeholder="Ex.: ordem judicial com prazo para amanhã, ofício nº ..."
                            className="w-full bg-zinc-800 border border-amber-500/40 rounded-lg px-3 py-2 text-white text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 outline-none h-16 resize-none"
                        ></textarea>
                    </div>
                )}

                <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Observações Gerais (Opcional)</label>
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        maxLength={1000}
                        placeholder="Observações que se aplicam a todo o agendamento..."
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 outline-none h-16 resize-none"
                    ></textarea>
                </div>

                {/* MENSAGEM DE ERRO VISUAL */}
                {error && (
                    <div className="bg-red-500/10 border border-red-500/50 p-3 rounded-lg flex gap-3 items-start animate-in fade-in slide-in-from-bottom-2">
                        <ErrorIcon />
                        <p className="text-sm font-semibold text-red-400 leading-snug">
                            {error}
                        </p>
                    </div>
                )}

                <button
                    type="submit"
                    disabled={submitting}
                    className={`w-full py-3 bg-gradient-to-r from-amber-600 to-amber-500 text-white font-bold rounded-lg shadow-lg shadow-amber-900/30 transition-all flex justify-center items-center gap-2 ${
                        submitting ? 'opacity-60 cursor-not-allowed' : 'hover:from-amber-500 hover:to-amber-400 transform active:scale-[0.98]'
                    }`}
                >
                    {submitting ? 'Registrando...' : 'Confirmar Solicitação'}
                </button>
            </div>
        </form>

      </div>
    </div>
  );
};

export default ScheduleModal;

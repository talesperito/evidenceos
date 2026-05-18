import React, { useState } from 'react';
import { DocumentReportIcon } from './icons/DocumentReportIcon';
import { UsersIcon } from './icons/UsersIcon';
import { ClipboardListIcon } from './icons/ClipboardListIcon';
import { QuestionMarkCircleIcon } from './icons/QuestionMarkCircleIcon';
import { BookOpenIcon } from './icons/BookOpenIcon';
import ReportModal from './ReportModal';
import UserManagementModal from './UserManagementModal';
import AuditLogModal from './AuditLogModal';
import FAQManagementModal from './FAQManagementModal';
import HelpModal from './HelpModal';
import {
  ReportData,
  User,
  canManageStandards,
  canManageUsers,
  canViewAuditLogs,
} from '../types';
import { logAction } from '../services/auditService';

interface AdminPanelProps {
  user: User;
  onRefresh: () => void;
  onGenerateReport: () => void;
  reportData: ReportData | null;
  onCloseReport: () => void;
  isLoading: boolean;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ user, onGenerateReport, reportData, onCloseReport, isLoading }) => {
  const [showUserModal, setShowUserModal] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [showFAQModal, setShowFAQModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

  const hasPermission = (action: string) => {
    switch (action) {
      case 'RELATORIO':
      case 'NORMAS':
        return true;
      case 'GESTAO_USUARIOS':
        return user.role === 'ADMIN' || user.role === 'PERITO';
      case 'GESTAO_FAQ':
        return canManageStandards(user);
      case 'AUDITORIA':
        return canViewAuditLogs(user);
      default:
        return false;
    }
  };

  const handleAction = async (actionName: string, callback: () => void) => {
    if (!hasPermission(actionName)) {
      alert(`ACESSO NEGADO: O recurso "${actionName}" é restrito a Administradores.\n\nContate a chefia da URC para solicitar acesso.`);
      return;
    }
    try {
      await logAction(user, actionName, 'Acesso autorizado ao recurso.');
    } catch {
      // A auditoria não deve impedir a abertura do recurso.
    }
    callback();
  };

  // Botão utilitário ativo: zinc escuro, hover sutil
  const activeBtn =
    'group flex items-center justify-center gap-2 px-4 py-3 ' +
    'bg-zinc-800/70 hover:bg-zinc-700/80 ' +
    'border border-white/5 hover:border-white/15 ' +
    'text-zinc-300 hover:text-white ' +
    'font-semibold rounded-xl ' +
    'shadow-md hover:shadow-lg ' +
    'transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 ' +
    'w-full';

  // Botão bloqueado: mudo, sem interação
  const lockedBtn =
    'flex items-center justify-center gap-2 px-4 py-3 ' +
    'bg-zinc-900/30 border border-zinc-800/40 ' +
    'text-zinc-700 font-semibold rounded-xl ' +
    'cursor-not-allowed opacity-40 w-full';

  const btn = (allowed: boolean) => allowed ? activeBtn : lockedBtn;

  return (
    <div className="mb-6 p-5 bg-zinc-900/60 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl relative overflow-hidden">
      {/* Linha de brilho sutil no topo do card */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      {!canManageUsers(user) && (
        <div className="absolute top-0 right-0 p-3">
          <span
            className="text-[10px] uppercase font-bold tracking-widest text-zinc-600 bg-zinc-900/80 px-2 py-1 rounded border border-zinc-800"
            title="Acesso administrativo não disponível para este perfil"
          >
            Acesso Limitado
          </span>
        </div>
      )}

      <h3 className="text-[10px] font-bold text-zinc-500 mb-4 flex items-center gap-2 uppercase tracking-[0.2em]">
        <span className={`w-1.5 h-1.5 rounded-full ${canManageUsers(user) ? 'bg-amber-500' : 'bg-zinc-600'}`} />
        Painel Operacional
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">

        <button
          onClick={() => void handleAction('RELATORIO', onGenerateReport)}
          disabled={isLoading}
          className={btn(hasPermission('RELATORIO'))}
        >
          <DocumentReportIcon className="w-5 h-5 transition-transform group-hover:scale-110" />
          {isLoading ? 'Gerando...' : 'Gerar Relatório'}
        </button>

        <button
          onClick={() => void handleAction('NORMAS', () => setShowHelpModal(true))}
          className={btn(hasPermission('NORMAS'))}
        >
          <BookOpenIcon className="w-5 h-5 transition-transform group-hover:scale-110" />
          Normas
        </button>

        <button
          onClick={() => void handleAction('GESTAO_USUARIOS', () => setShowUserModal(true))}
          className={btn(hasPermission('GESTAO_USUARIOS'))}
        >
          <UsersIcon className="w-5 h-5 transition-transform group-hover:scale-110" />
          Gerenciar Usuários
        </button>

        <button
          onClick={() => void handleAction('GESTAO_FAQ', () => setShowFAQModal(true))}
          className={btn(hasPermission('GESTAO_FAQ'))}
        >
          <QuestionMarkCircleIcon className="w-5 h-5 transition-transform group-hover:scale-110" />
          Gerir Normas
        </button>

        <button
          onClick={() => void handleAction('AUDITORIA', () => setShowAuditModal(true))}
          className={btn(hasPermission('AUDITORIA'))}
        >
          <ClipboardListIcon className="w-5 h-5 transition-transform group-hover:scale-110" />
          Logs de Auditoria
        </button>
      </div>

      {reportData && <ReportModal reportData={reportData} onClose={onCloseReport} />}
      {showUserModal && <UserManagementModal user={user} onClose={() => setShowUserModal(false)} />}
      {showAuditModal && <AuditLogModal onClose={() => setShowAuditModal(false)} />}
      {showFAQModal && <FAQManagementModal onClose={() => setShowFAQModal(false)} />}
      {showHelpModal && <HelpModal onClose={() => setShowHelpModal(false)} />}
    </div>
  );
};

export default AdminPanel;

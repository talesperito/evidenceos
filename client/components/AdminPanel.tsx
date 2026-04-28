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

  const getButtonStyle = (baseClass: string, actionName: string) =>
    hasPermission(actionName)
      ? baseClass
      : `${baseClass} opacity-60 cursor-not-allowed grayscale`;

  return (
    <div className="mb-6 p-4 bg-slate-800 rounded-lg border border-slate-700 relative overflow-hidden">
      {!canManageUsers(user) && (
        <div className="absolute top-0 right-0 p-2">
          <span
            className="text-[10px] uppercase font-bold tracking-widest text-slate-500 bg-slate-900/50 px-2 py-1 rounded border border-slate-700"
            title="Acesso administrativo não disponível para este perfil"
          >
            Acesso Limitado
          </span>
        </div>
      )}

      <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${canManageUsers(user) ? 'bg-cyan-400' : 'bg-slate-500'}`} />
        Painel Operacional
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <button
          onClick={() => void handleAction('RELATORIO', onGenerateReport)}
          disabled={isLoading}
          className={getButtonStyle('flex items-center justify-center gap-2 px-4 py-3 bg-cyan-600 text-white font-semibold rounded-md hover:bg-cyan-700 transition-colors shadow-lg shadow-cyan-900/20 w-full', 'RELATORIO')}
        >
          <DocumentReportIcon className="w-5 h-5" />
          {isLoading ? 'Gerando...' : 'Gerar Relatório'}
        </button>

        <button
          onClick={() => void handleAction('NORMAS', () => setShowHelpModal(true))}
          className={getButtonStyle('flex items-center justify-center gap-2 px-4 py-3 bg-cyan-600 text-white font-semibold rounded-md hover:bg-cyan-700 transition-colors shadow-lg shadow-cyan-900/20 w-full', 'NORMAS')}
        >
          <BookOpenIcon className="w-5 h-5" />
          Normas
        </button>

        <button
          onClick={() => void handleAction('GESTAO_USUARIOS', () => setShowUserModal(true))}
          className={getButtonStyle('flex items-center justify-center gap-2 px-4 py-3 bg-slate-700 text-white font-semibold rounded-md hover:bg-slate-600 border border-slate-600 transition-colors w-full', 'GESTAO_USUARIOS')}
        >
          <UsersIcon className={`w-5 h-5 ${canManageUsers(user) ? 'text-cyan-400' : 'text-slate-400'}`} />
          Gerenciar Usuários
        </button>

        <button
          onClick={() => void handleAction('GESTAO_FAQ', () => setShowFAQModal(true))}
          className={getButtonStyle('flex items-center justify-center gap-2 px-4 py-3 bg-slate-700 text-white font-semibold rounded-md hover:bg-slate-600 border border-slate-600 transition-colors w-full', 'GESTAO_FAQ')}
        >
          <QuestionMarkCircleIcon className={`w-5 h-5 ${canManageStandards(user) ? 'text-cyan-400' : 'text-slate-400'}`} />
          Gerir Normas
        </button>

        <button
          onClick={() => void handleAction('AUDITORIA', () => setShowAuditModal(true))}
          className={getButtonStyle('flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-900/20 w-full', 'AUDITORIA')}
        >
          <ClipboardListIcon className="w-5 h-5" />
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

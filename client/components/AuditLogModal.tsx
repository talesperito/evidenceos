import React, { useEffect, useState } from 'react';
import { getAuditExportUrl, getLogs } from '../services/auditService';
import { AuditLog } from '../types';
import { XIcon } from './icons/XIcon';
import { ClipboardListIcon } from './icons/ClipboardListIcon';

interface AuditLogModalProps {
  onClose: () => void;
}

const AuditLogModal: React.FC<AuditLogModalProps> = ({ onClose }) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLogs(await getLogs());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha ao carregar auditoria.');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const formatDate = (isoString: string) => new Date(isoString).toLocaleString('pt-BR');

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col border border-slate-700">
        <div className="flex justify-between items-center p-6 border-b border-slate-700 bg-slate-800/50 rounded-t-xl">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 rounded-lg">
              <ClipboardListIcon className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Logs de Auditoria</h2>
              <p className="text-sm text-slate-400">Histórico persistido na API</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white transition-colors">
            <XIcon className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-grow overflow-auto custom-scrollbar p-6">
          {loading ? (
            <div className="text-center text-slate-500 py-10">Carregando registros...</div>
          ) : error ? (
            <div className="text-center text-red-400 py-10">{error}</div>
          ) : logs.length === 0 ? (
            <div className="text-center text-slate-500 py-10">Nenhum registro encontrado.</div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase tracking-wider">
                  <th className="p-3 font-semibold">Data/Hora</th>
                  <th className="p-3 font-semibold">Usuário</th>
                  <th className="p-3 font-semibold">Ação</th>
                  <th className="p-3 font-semibold">Detalhes</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-slate-800">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="p-3 text-slate-300 whitespace-nowrap font-mono text-xs">{formatDate(log.timestamp)}</td>
                    <td className="p-3 text-white">
                      <div className="font-medium">{log.userName}</div>
                      <div className="text-xs text-slate-500">{log.userEmail}</div>
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-1 rounded text-xs font-bold bg-slate-700 text-slate-300">
                        {log.action}
                      </span>
                    </td>
                    <td className="p-3 text-slate-400 font-mono text-xs truncate max-w-md" title={log.details}>
                      {log.details || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="p-4 border-t border-slate-700 bg-slate-800/50 rounded-b-xl flex justify-between items-center">
          <p className="text-xs text-slate-500">Exibindo até 200 registros recentes.</p>
          <a
            href={getAuditExportUrl('csv')}
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2 text-sm text-indigo-300 hover:text-white hover:bg-indigo-900/30 rounded transition-colors"
          >
            Exportar CSV
          </a>
        </div>
      </div>
    </div>
  );
};

export default AuditLogModal;

import React, { useState } from 'react';
import { changePassword } from '../services/userService';
import { XIcon } from './icons/XIcon';

interface ChangePasswordModalProps {
  onClose: () => void;
}

const EyeIcon: React.FC<{ open: boolean }> = ({ open }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    {open ? (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ) : (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.94 17.94A10.94 10.94 0 0112 20C7 20 2.73 16.89 1 12c.92-2.6 2.63-4.84 4.88-6.32M9.9 4.24A10.99 10.99 0 0112 4c5 0 9.27 3.11 11 8a11.05 11.05 0 01-4.17 5.94M1 1l22 22" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 9.53A3 3 0 0012 15a3 3 0 002.47-.53" />
      </>
    )}
  </svg>
);

const PasswordField: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  show: boolean;
  onToggle: () => void;
}> = ({ label, value, onChange, show, onToggle }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-400 mb-1">{label}</label>
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        required
        minLength={6}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 pr-10 text-white text-sm focus:border-cyan-500 outline-none"
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-cyan-400 transition-colors"
        title={show ? 'Ocultar senha' : 'Mostrar senha'}
      >
        <EyeIcon open={show} />
      </button>
    </div>
  </div>
);

const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ onClose }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassword.length < 6) {
      setError('A nova senha deve ter pelo menos 6 caracteres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('A confirmacao da nova senha nao confere.');
      return;
    }

    if (currentPassword === newPassword) {
      setError('A nova senha deve ser diferente da senha atual.');
      return;
    }

    setIsSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      setSuccess('Senha alterada com sucesso.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao alterar a senha.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 rounded-xl shadow-2xl w-full max-w-md border border-slate-700 flex flex-col">
        <div className="flex justify-between items-center p-5 border-b border-slate-700 bg-slate-800/50 rounded-t-xl">
          <h2 className="text-xl font-bold text-white">Trocar Senha</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white transition-colors">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <PasswordField
            label="SENHA ATUAL"
            value={currentPassword}
            onChange={setCurrentPassword}
            show={showCurrentPassword}
            onToggle={() => setShowCurrentPassword((current) => !current)}
          />
          <PasswordField
            label="NOVA SENHA"
            value={newPassword}
            onChange={setNewPassword}
            show={showNewPassword}
            onToggle={() => setShowNewPassword((current) => !current)}
          />
          <PasswordField
            label="CONFIRMAR NOVA SENHA"
            value={confirmPassword}
            onChange={setConfirmPassword}
            show={showConfirmPassword}
            onToggle={() => setShowConfirmPassword((current) => !current)}
          />

          {error && <p className="text-red-400 text-sm">{error}</p>}
          {success && <p className="text-emerald-400 text-sm">{success}</p>}

          <div className="pt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
            >
              Fechar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded transition-colors"
            >
              {isSaving ? 'Salvando...' : 'Atualizar Senha'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChangePasswordModal;

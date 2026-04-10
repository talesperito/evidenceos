import React, { useState } from 'react';
import { User, getRoleLabel } from '../types';
import { BookOpenIcon } from './icons/BookOpenIcon';
import HelpModal from './HelpModal';
import ChangePasswordModal from './ChangePasswordModal';

const BalanceScaleIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-5 13.59L4.41 13 3 14.41l4 4L12 23l5-4.59 1.41-1.41L15 15.59V10h-2v5.59L10 13l-1.41 1.41L13 18.83l-1 1.17-1-1.17zM12 4c1.85 0 3.5.78 4.67 2.05L15.26 7.4C14.43 6.55 13.28 6 12 6s-2.43.55-3.26 1.4L7.33 6.05C8.5 4.78 10.15 4 12 4z" opacity=".5" />
    <path d="M21 12c0-4.97-4.03-9-9-9s-9 4.03-9 9c0 1.2.24 2.34.68 3.39L3 14.41l4 4L12 23l5-4.59 1.41-1.41L19.32 15.4c.44-1.05.68-2.19.68-3.4zM12 21.17L7.41 17 6 18.41l5 4.59h2l5-4.59L16.59 17 12 21.17zM12 6c-1.28 0-2.43.55-3.26 1.4l1.41 1.41C10.73 8.23 11.35 8 12 8s1.27.23 1.85.81l1.41-1.41C14.43 6.55 13.28 6 12 6z" />
  </svg>
);

interface HeaderProps {
  user: User;
  onLogout: () => void;
}

const Header: React.FC<HeaderProps> = ({ user, onLogout }) => {
  const [showHelp, setShowHelp] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const roleLabel = getRoleLabel(user.role);
  const roleDotClass = user.role === 'ADMIN' ? 'bg-amber-500' : user.role === 'PERITO' ? 'bg-cyan-400' : 'bg-zinc-500';

  return (
    <header className="sticky top-4 z-30 px-4">
      <div className="container mx-auto max-w-6xl">
        <div className="bg-zinc-900/60 backdrop-blur-md border border-white/10 rounded-2xl shadow-xl px-6 py-3 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="bg-gradient-to-br from-amber-500 to-amber-600 p-2 rounded-lg shadow-lg shadow-amber-900/20">
              <BalanceScaleIcon className="w-5 h-5 text-white" />
            </div>
            <div className="leading-tight">
              <h1 className="text-lg font-bold text-white tracking-tight">EvidenceOS</h1>
              <p className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider">URC Lavras/MG</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <button
              onClick={() => setShowHelp(true)}
              className="flex items-center gap-2 text-zinc-400 hover:text-amber-400 transition-colors group px-2 py-1 rounded-md hover:bg-white/5"
              title="Normas e Procedimentos"
            >
              <BookOpenIcon className="w-5 h-5" />
              <span className="text-sm font-medium hidden sm:block">Normas</span>
            </button>

            <div className="h-6 w-px bg-white/10 hidden sm:block"></div>

            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowChangePassword(true)}
                className="hidden sm:flex items-center gap-2 text-zinc-400 hover:text-cyan-400 transition-colors group px-2 py-1 rounded-md hover:bg-white/5"
                title="Trocar senha"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2h-1V9a5 5 0 00-10 0v2H6a2 2 0 00-2 2v6a2 2 0 002 2zm3-10V9a3 3 0 016 0v2H9z" />
                </svg>
                <span className="text-sm font-medium">Senha</span>
              </button>

              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold text-white">{user.name}</p>
                <div className="flex items-center justify-end gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${roleDotClass}`}></span>
                  <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">{roleLabel}</p>
                </div>
              </div>
              <button
                onClick={onLogout}
                className="group relative p-2 text-zinc-400 hover:text-white transition-colors"
                title="Sair"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
    </header>
  );
};

export default Header;

import React, { useEffect, useState } from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import ResetPasswordPage from './components/ResetPasswordPage';
import { User } from './types';
import { logout, restoreSession } from './services/userService';

// Detecta se o usuário está acessando via link de reset de senha
const isResetPasswordRoute = (): boolean => {
  const params = new URLSearchParams(window.location.search);
  return params.has('token') || window.location.pathname.includes('/reset-password');
};

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const [showReset, setShowReset] = useState(isResetPasswordRoute());

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const restoredUser = await restoreSession();
        setUser(restoredUser);
      } finally {
        setBooting(false);
      }
    };

    void bootstrap();
  }, []);

  const handleLogout = async () => {
    await logout();
    setUser(null);
  };

  const handleBackToLogin = () => {
    // Limpa o token da URL sem recarregar a página
    window.history.replaceState({}, '', window.location.pathname.replace('/reset-password', '/'));
    setShowReset(false);
  };

  if (booting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-300">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-amber-500" />
          <p className="text-sm uppercase tracking-[0.2em]">Carregando sessão</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen font-sans bg-transparent">
      {showReset ? (
        <ResetPasswordPage onBackToLogin={handleBackToLogin} />
      ) : user ? (
        <Dashboard user={user} onLogout={handleLogout} />
      ) : (
        <Login onLogin={setUser} onForgotPassword={() => setShowReset(true)} />
      )}
    </div>
  );
};

export default App;

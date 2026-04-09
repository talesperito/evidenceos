import React, { useEffect, useState } from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import { User } from './types';
import { logout, restoreSession } from './services/userService';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);

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
      {user ? (
        <Dashboard user={user} onLogout={handleLogout} />
      ) : (
        <Login onLogin={setUser} />
      )}
    </div>
  );
};

export default App;

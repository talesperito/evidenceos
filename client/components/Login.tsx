import React, { useState } from 'react';
import { User } from '../types';
import { login } from '../services/userService';

interface LoginProps {
  onLogin: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const user = await login(email, password);
      onLogin(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Acesso negado. Credenciais incorretas.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-zinc-950 text-white overflow-hidden relative selection:bg-amber-500/30">
      <div className="hidden lg:flex flex-col justify-between w-1/2 relative z-10 p-12 lg:p-16 border-r border-white/5 bg-zinc-900/20 backdrop-blur-sm">
        <div className="absolute inset-0 z-0 opacity-20 pointer-events-none overflow-hidden">
          <svg className="absolute w-[150%] h-[150%] -top-20 -left-20 text-amber-900/20 animate-[spin_60s_linear_infinite]" viewBox="0 0 100 100">
            <path d="M50 50 L50 0 L100 50 Z" fill="currentColor" />
            <path d="M50 50 L50 100 L0 50 Z" fill="currentColor" />
            <circle cx="50" cy="50" r="40" stroke="currentColor" strokeWidth="0.5" fill="none" />
            <circle cx="50" cy="50" r="30" stroke="currentColor" strokeWidth="0.5" fill="none" strokeDasharray="4 4" />
          </svg>
          <div className="absolute bottom-0 left-0 right-0 h-64 bg-gradient-to-t from-zinc-950 to-transparent" />
        </div>

        <div className="relative z-10 animate-in fade-in slide-in-from-top-8 duration-700">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 border border-amber-500/50 flex items-center justify-center rounded bg-amber-500/10">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-amber-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z" />
              </svg>
            </div>
            <div className="h-px w-20 bg-amber-500/30" />
            <span className="text-xs font-mono text-amber-500 tracking-widest uppercase">Sistema Seguro</span>
          </div>

          <h1 className="text-6xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-white to-zinc-500 mb-4">
            Evidence<span className="text-amber-500">OS</span>
          </h1>
          <p className="text-lg text-zinc-400 font-light max-w-md leading-relaxed">
            Gestão integrada de cadeia de custódia e controle forense.
            <br /><span className="text-zinc-500 text-sm">Versão 2.0</span>
          </p>
        </div>

        <div className="relative z-10 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-150">
          <div className="flex gap-8 text-xs font-mono text-zinc-600">
            <div>
              <span className="block text-zinc-400 mb-1">UNIDADE</span>
              URC Lavras/MG
            </div>
            <div>
              <span className="block text-zinc-400 mb-1">STATUS</span>
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Online
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex flex-col justify-center px-8 sm:px-16 lg:px-24 bg-zinc-950 relative">
        <div className="absolute top-0 right-0 w-full h-1/2 bg-gradient-to-b from-amber-500/5 to-transparent pointer-events-none" />

        <div className="w-full max-w-sm mx-auto relative z-20">
          <div className="lg:hidden mb-12">
            <h1 className="text-3xl font-black tracking-tight text-white mb-2">Evidence<span className="text-amber-500">OS</span></h1>
            <p className="text-sm text-zinc-500">Acesso Restrito - Polícia Civil MG</p>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-2">Identificação</h2>
            <p className="text-zinc-500 text-sm">Insira suas credenciais funcionais para prosseguir.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="group">
              <label className="block text-[10px] uppercase tracking-wider font-bold text-zinc-500 mb-2 group-focus-within:text-amber-500 transition-colors">E-mail Institucional</label>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  className="w-full bg-zinc-900/50 border-b-2 border-zinc-800 text-white px-0 py-3 placeholder-zinc-700 focus:outline-none focus:border-amber-500 transition-all font-mono text-sm"
                  placeholder="Seu email"
                />
                <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-amber-500 transition-all group-focus-within:w-full" />
              </div>
            </div>

            <div className="group">
              <label className="block text-[10px] uppercase tracking-wider font-bold text-zinc-500 mb-2 group-focus-within:text-amber-500 transition-colors">Chave de Acesso</label>
              <div className="relative">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className="w-full bg-zinc-900/50 border-b-2 border-zinc-800 text-white px-0 py-3 placeholder-zinc-700 focus:outline-none focus:border-amber-500 transition-all font-mono text-sm"
                  placeholder="••••••••••••"
                />
                <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-amber-500 transition-all group-focus-within:w-full" />
              </div>
            </div>

            {error && (
              <div className="p-4 bg-red-500/5 border-l-2 border-red-500 text-red-400 text-xs animate-in slide-in-from-left-2">
                <p className="font-bold mb-1">Erro de Autenticação</p>
                {error}
              </div>
            )}

            <div className="pt-4">
              <button
                type="submit"
                disabled={loading}
                className={`w-full group relative overflow-hidden bg-white text-black font-bold py-4 px-6 transition-all hover:bg-amber-400 ${loading ? 'opacity-80 cursor-wait' : ''}`}
              >
                <span className="relative z-10 flex items-center justify-between">
                  {loading ? 'VERIFICANDO CREDENCIAIS...' : 'ACESSAR SISTEMA'}
                  <svg xmlns="http://www.w3.org/2000/svg" className={`w-5 h-5 transition-transform ${loading ? 'animate-spin' : 'group-hover:translate-x-1'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    {loading ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    )}
                  </svg>
                </span>
                <div className="absolute inset-0 bg-amber-500 transform translate-y-full transition-transform duration-200 group-hover:translate-y-0 z-0 opacity-20" />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;

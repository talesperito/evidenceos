
import React, { useState, useEffect } from 'react';

interface ResetPasswordPageProps {
  onBackToLogin: () => void;
}

// Extrai o token da query string da URL atual
const getTokenFromUrl = (): string | null => {
  const params = new URLSearchParams(window.location.search);
  return params.get('token');
};

type Step = 'request' | 'success-request' | 'reset' | 'success-reset' | 'invalid-token';

const ResetPasswordPage: React.FC<ResetPasswordPageProps> = ({ onBackToLogin }) => {
  const [step, setStep] = useState<Step>('request');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const token = getTokenFromUrl();

  useEffect(() => {
    if (token) {
      setStep('reset');
    }
  }, [token]);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || 'Erro ao processar solicitação.');
      }

      setStep('success-request');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    if (newPassword.length < 8) {
      setError('A senha deve ter no mínimo 8 caracteres.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 400) {
          setStep('invalid-token');
          return;
        }
        throw new Error(data.message || 'Erro ao redefinir senha.');
      }

      setStep('success-reset');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-zinc-950 text-white overflow-hidden relative selection:bg-amber-500/30">
      {/* Painel esquerdo decorativo */}
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
            <span className="text-xs font-mono text-amber-500 tracking-widest uppercase">Acesso Seguro</span>
          </div>

          <h1 className="text-6xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-white to-zinc-500 mb-4">
            Evidence<span className="text-amber-500">OS</span>
          </h1>
          <p className="text-lg text-zinc-400 font-light max-w-md leading-relaxed">
            Recuperação de acesso ao sistema de gestão forense.
          </p>
        </div>

        <div className="relative z-10">
          <p className="text-xs text-zinc-600 font-mono">URC Lavras/MG · Sistema Seguro</p>
        </div>
      </div>

      {/* Painel direito — conteúdo dinâmico por step */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center px-8 sm:px-16 lg:px-24 bg-zinc-950 relative">
        <div className="absolute top-0 right-0 w-full h-1/2 bg-gradient-to-b from-amber-500/5 to-transparent pointer-events-none" />

        <div className="w-full max-w-sm mx-auto relative z-20">
          {/* Mobile header */}
          <div className="lg:hidden mb-12">
            <h1 className="text-3xl font-black tracking-tight text-white mb-2">Evidence<span className="text-amber-500">OS</span></h1>
            <p className="text-sm text-zinc-500">Recuperação de Acesso</p>
          </div>

          {/* STEP: Solicitar reset */}
          {step === 'request' && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-white mb-2">Esqueci minha senha</h2>
                <p className="text-zinc-500 text-sm">Informe seu e-mail institucional para receber as instruções de recuperação.</p>
              </div>

              <form onSubmit={(e) => void handleForgotPassword(e)} className="space-y-6">
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
                      placeholder="seu.email@pc.mg.gov.br"
                    />
                    <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-amber-500 transition-all group-focus-within:w-full" />
                  </div>
                </div>

                {error && (
                  <div className="p-4 bg-red-500/5 border-l-2 border-red-500 text-red-400 text-xs animate-in slide-in-from-left-2">
                    <p className="font-bold mb-1">Erro</p>
                    {error}
                  </div>
                )}

                <div className="pt-4 space-y-3">
                  <button
                    type="submit"
                    disabled={loading}
                    className={`w-full group relative overflow-hidden bg-white text-black font-bold py-4 px-6 transition-all hover:bg-amber-400 ${loading ? 'opacity-80 cursor-wait' : ''}`}
                  >
                    <span className="relative z-10 flex items-center justify-between">
                      {loading ? 'ENVIANDO...' : 'SOLICITAR RECUPERAÇÃO'}
                      <svg xmlns="http://www.w3.org/2000/svg" className={`w-5 h-5 transition-transform ${loading ? 'animate-spin' : 'group-hover:translate-x-1'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        {loading ? <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /> : <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />}
                      </svg>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={onBackToLogin}
                    className="w-full text-center text-xs text-zinc-500 hover:text-zinc-300 transition-colors py-2"
                  >
                    ← Voltar ao login
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* STEP: Sucesso no envio da solicitação */}
          {step === 'success-request' && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto mb-6">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white mb-3">Solicitação enviada</h2>
              <p className="text-zinc-400 text-sm leading-relaxed mb-2">
                Se o e-mail informado estiver cadastrado, você receberá as instruções para redefinir sua senha.
              </p>
              <p className="text-zinc-600 text-xs mb-8">
                O link expira em 1 hora. Verifique também a pasta de spam.
              </p>
              <p className="text-amber-400/70 text-xs mb-6 p-3 bg-amber-500/5 border border-amber-500/20 rounded text-left">
                <span className="font-bold block mb-1">⚠️ Fase de desenvolvimento</span>
                O token de reset está sendo registrado no log do servidor. O administrador pode recuperá-lo para fornecer o link manualmente enquanto o envio de e-mail não está configurado.
              </p>
              <button onClick={onBackToLogin} className="text-sm text-amber-500 hover:text-amber-400 transition-colors font-semibold">
                ← Voltar ao login
              </button>
            </div>
          )}

          {/* STEP: Redefinir senha (via token na URL) */}
          {step === 'reset' && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-white mb-2">Redefinir senha</h2>
                <p className="text-zinc-500 text-sm">Escolha uma nova senha segura com no mínimo 8 caracteres.</p>
              </div>

              <form onSubmit={(e) => void handleResetPassword(e)} className="space-y-6">
                <div className="group">
                  <label className="block text-[10px] uppercase tracking-wider font-bold text-zinc-500 mb-2 group-focus-within:text-amber-500 transition-colors">Nova Senha</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      disabled={loading}
                      className="w-full bg-zinc-900/50 border-b-2 border-zinc-800 text-white px-0 py-3 pr-10 placeholder-zinc-700 focus:outline-none focus:border-amber-500 transition-all font-mono text-sm"
                      placeholder="••••••••••••"
                    />
                    <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-0 top-1/2 -translate-y-1/2 p-2 text-zinc-500 hover:text-amber-400 transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        {showPassword ? <><path strokeLinecap="round" strokeLinejoin="round" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" /><circle cx="12" cy="12" r="3" /></> : <path strokeLinecap="round" strokeLinejoin="round" d="M17.94 17.94A10.94 10.94 0 0112 20C7 20 2.73 16.89 1 12c.92-2.6 2.63-4.84 4.88-6.32M9.9 4.24A10.99 10.99 0 0112 4c5 0 9.27 3.11 11 8a11.05 11.05 0 01-4.17 5.94M1 1l22 22" />}
                      </svg>
                    </button>
                    <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-amber-500 transition-all group-focus-within:w-full" />
                  </div>
                </div>

                <div className="group">
                  <label className="block text-[10px] uppercase tracking-wider font-bold text-zinc-500 mb-2 group-focus-within:text-amber-500 transition-colors">Confirmar Nova Senha</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      disabled={loading}
                      className="w-full bg-zinc-900/50 border-b-2 border-zinc-800 text-white px-0 py-3 placeholder-zinc-700 focus:outline-none focus:border-amber-500 transition-all font-mono text-sm"
                      placeholder="••••••••••••"
                    />
                    <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-amber-500 transition-all group-focus-within:w-full" />
                  </div>
                </div>

                {error && (
                  <div className="p-4 bg-red-500/5 border-l-2 border-red-500 text-red-400 text-xs animate-in slide-in-from-left-2">
                    <p className="font-bold mb-1">Erro</p>
                    {error}
                  </div>
                )}

                <div className="pt-4 space-y-3">
                  <button
                    type="submit"
                    disabled={loading}
                    className={`w-full group relative overflow-hidden bg-white text-black font-bold py-4 px-6 transition-all hover:bg-amber-400 ${loading ? 'opacity-80 cursor-wait' : ''}`}
                  >
                    <span className="relative z-10 flex items-center justify-between">
                      {loading ? 'SALVANDO...' : 'REDEFINIR SENHA'}
                      <svg xmlns="http://www.w3.org/2000/svg" className={`w-5 h-5 transition-transform ${loading ? 'animate-spin' : 'group-hover:translate-x-1'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        {loading ? <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /> : <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />}
                      </svg>
                    </span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* STEP: Sucesso no reset */}
          {step === 'success-reset' && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto mb-6">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white mb-3">Senha redefinida!</h2>
              <p className="text-zinc-400 text-sm leading-relaxed mb-8">
                Sua senha foi alterada com sucesso. Por segurança, todas as sessões anteriores foram encerradas.
              </p>
              <button
                onClick={onBackToLogin}
                className="w-full group relative overflow-hidden bg-white text-black font-bold py-4 px-6 transition-all hover:bg-amber-400"
              >
                <span className="relative z-10 flex items-center justify-between">
                  FAZER LOGIN
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </span>
              </button>
            </div>
          )}

          {/* STEP: Token inválido/expirado */}
          {step === 'invalid-token' && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300 text-center">
              <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto mb-6">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white mb-3">Link inválido ou expirado</h2>
              <p className="text-zinc-400 text-sm leading-relaxed mb-8">
                Este link de recuperação é inválido, já foi utilizado ou expirou (validade de 1 hora). Solicite um novo link.
              </p>
              <div className="space-y-3">
                <button
                  onClick={() => setStep('request')}
                  className="w-full group relative overflow-hidden bg-white text-black font-bold py-4 px-6 transition-all hover:bg-amber-400"
                >
                  SOLICITAR NOVO LINK
                </button>
                <button onClick={onBackToLogin} className="w-full text-center text-xs text-zinc-500 hover:text-zinc-300 transition-colors py-2">
                  ← Voltar ao login
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;

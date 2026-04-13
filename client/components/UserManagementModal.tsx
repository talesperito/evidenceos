import React, { useEffect, useState } from 'react';
import { deleteUser, getUsers, saveUser } from '../services/userService';
import { AuthorizedUser, User, UserRole, getRoleLabel } from '../types';
import { XIcon } from './icons/XIcon';
import { TrashIcon } from './icons/TrashIcon';

interface UserManagementModalProps {
  user: User;
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

const UserManagementModal: React.FC<UserManagementModalProps> = ({ user, onClose }) => {
  const [users, setUsers] = useState<AuthorizedUser[]>([]);
  const [newUser, setNewUser] = useState<{ name: string; email: string; password: string; role: UserRole }>({
    name: '',
    email: '',
    password: '',
    role: 'PERITO',
  });
  const [error, setError] = useState<string | null>(null);
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadUsers = async () => {
    setLoading(true);
    try {
      setUsers(await getUsers());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar usuarios.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCreatedCredentials(null);
    try {
      if (newUser.password.length < 6) {
        throw new Error('A senha deve ter pelo menos 6 caracteres.');
      }

      const createdEmail = newUser.email;
      const createdPassword = newUser.password;
      await saveUser(newUser);
      setNewUser({ name: '', email: '', password: '', role: 'PERITO' });
      setCreatedCredentials({ email: createdEmail, password: createdPassword });
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao cadastrar usuario.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja remover este usuario?')) return;
    try {
      await deleteUser(id);
      await loadUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Falha ao remover usuario.');
    }
  };

  const roleBadgeClass = (role: UserRole) => {
    switch (role) {
      case 'ADMIN':
        return 'bg-purple-500/20 text-purple-300';
      case 'PERITO':
        return 'bg-cyan-500/20 text-cyan-300';
      case 'VISUALIZADOR':
        return 'bg-zinc-700 text-zinc-300';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 rounded-xl shadow-2xl w-full max-w-2xl border border-slate-700 flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-5 border-b border-slate-700 bg-slate-800/50 rounded-t-xl">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            Gerenciar Usuarios
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white transition-colors">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar flex-grow">
          <div className="mb-8">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Usuarios Cadastrados</h3>
            {loading ? (
              <div className="text-sm text-slate-500">Carregando usuarios...</div>
            ) : (
              <div className="space-y-2">
                {users.map((mappedUser) => (
                  <div key={mappedUser.id} className="flex items-center justify-between p-3 bg-slate-800 rounded border border-slate-700">
                    <div>
                      <p className="font-medium text-white">
                        {mappedUser.name}
                        <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${roleBadgeClass(mappedUser.role)}`}>
                          {getRoleLabel(mappedUser.role).toUpperCase()}
                        </span>
                        {!mappedUser.active && <span className="ml-2 text-xs bg-zinc-700 text-zinc-300 px-1.5 py-0.5 rounded">INATIVO</span>}
                      </p>
                      <p className="text-sm text-slate-400">{mappedUser.email}</p>
                    </div>
                    {user.role === 'ADMIN' && (
                      <button
                        onClick={() => void handleDelete(mappedUser.id)}
                        className="p-2 text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
                        title="Remover usuario"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-slate-800/50 p-5 rounded-lg border border-slate-700">
            <h3 className="text-sm font-semibold text-cyan-400 uppercase tracking-wider mb-4">Novo Cadastro</h3>
            <form onSubmit={handleAddUser} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Nome Completo</label>
                  <input
                    type="text"
                    required
                    value={newUser.name}
                    onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">E-mail</label>
                  <input
                    type="email"
                    required
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Senha Provisoria</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={newUser.password}
                      onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 pr-10 text-white text-sm focus:border-cyan-500 outline-none"
                      placeholder="Minimo 6 caracteres"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-cyan-400 transition-colors"
                      title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    >
                      <EyeIcon open={showPassword} />
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Perfil de Acesso</label>
                  <select
                    value={newUser.role}
                    onChange={(e) => setNewUser({ ...newUser, role: e.target.value as UserRole })}
                    className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none"
                  >
                    <option value="PERITO">Perito</option>
                    <option value="VISUALIZADOR">Visualizador</option>
                    {user.role === 'ADMIN' && <option value="ADMIN">Administrador</option>}
                  </select>
                </div>
              </div>

              {error && <p className="text-red-400 text-xs">{error}</p>}
              {createdCredentials && (
                <div className="rounded border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
                  <p className="font-semibold mb-1">Usuario cadastrado com sucesso.</p>
                  <p>E-mail: {createdCredentials.email}</p>
                  <p>Senha provisoria: {createdCredentials.password}</p>
                  <p className="mt-2 text-emerald-300/80">
                    Guarde essa senha agora. Depois do cadastro ela nao pode ser consultada no sistema, apenas redefinida.
                  </p>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-2 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded text-sm transition-colors"
              >
                Cadastrar Usuario
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserManagementModal;

import React, { useEffect, useState } from 'react';
import { deleteUser, getUsers, saveUser } from '../services/userService';
import { AuthorizedUser } from '../types';
import { XIcon } from './icons/XIcon';
import { TrashIcon } from './icons/TrashIcon';

interface UserManagementModalProps {
  onClose: () => void;
}

const UserManagementModal: React.FC<UserManagementModalProps> = ({ onClose }) => {
  const [users, setUsers] = useState<AuthorizedUser[]>([]);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', isAdmin: false });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUsers = async () => {
    setLoading(true);
    try {
      setUsers(await getUsers());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar usuários.');
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
    try {
      if (newUser.password.length < 6) {
        throw new Error('A senha deve ter pelo menos 6 caracteres.');
      }
      await saveUser(newUser);
      setNewUser({ name: '', email: '', password: '', isAdmin: false });
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao cadastrar usuário.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja remover este usuário?')) return;
    try {
      await deleteUser(id);
      await loadUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Falha ao remover usuário.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 rounded-xl shadow-2xl w-full max-w-2xl border border-slate-700 flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-5 border-b border-slate-700 bg-slate-800/50 rounded-t-xl">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            Gerenciar Usuários
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white transition-colors">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar flex-grow">
          <div className="mb-8">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Usuários Cadastrados</h3>
            {loading ? (
              <div className="text-sm text-slate-500">Carregando usuários...</div>
            ) : (
              <div className="space-y-2">
                {users.map((user) => (
                  <div key={user.id} className="flex items-center justify-between p-3 bg-slate-800 rounded border border-slate-700">
                    <div>
                      <p className="font-medium text-white">
                        {user.name}
                        {user.isAdmin && <span className="ml-2 text-xs bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded">ADMIN</span>}
                        {!user.active && <span className="ml-2 text-xs bg-zinc-700 text-zinc-300 px-1.5 py-0.5 rounded">INATIVO</span>}
                      </p>
                      <p className="text-sm text-slate-400">{user.email}</p>
                    </div>
                    <button
                      onClick={() => void handleDelete(user.id)}
                      className="p-2 text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
                      title="Remover usuário"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
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
                  <label className="block text-xs text-slate-400 mb-1">Senha Provisória</label>
                  <input
                    type="text"
                    required
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:border-cyan-500 outline-none"
                    placeholder="Mínimo 6 caracteres"
                  />
                </div>
                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newUser.isAdmin}
                      onChange={(e) => setNewUser({ ...newUser, isAdmin: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-cyan-600 focus:ring-offset-slate-900"
                    />
                    <span className="text-sm text-slate-300">Acesso de Administrador</span>
                  </label>
                </div>
              </div>

              {error && <p className="text-red-400 text-xs">{error}</p>}

              <button
                type="submit"
                className="w-full py-2 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded text-sm transition-colors"
              >
                Cadastrar Usuário
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserManagementModal;

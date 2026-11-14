import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Users,
  UserPlus,
  KeyRound,
  Trash2,
  ShieldCheck,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Eye,
  EyeOff,
} from 'lucide-react';
import { api } from '../services/api';
import { User } from '../types';
import { useAuth } from '../context/AuthContext';

function formatUserDate(dateStr?: string | null): string {
  if (!dateStr || dateStr === '—' || dateStr === '-' || dateStr === 'null' || dateStr === 'undefined') {
    return 'Недавно';
  }
  try {
    const clean = dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T');
    const d = new Date(clean);
    if (isNaN(d.getTime())) return 'Недавно';
    return d.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return 'Недавно';
  }
}

export const AdminUsers: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Create user modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [newRole, setNewRole] = useState<'admin' | 'user'>('user');
  const [creating, setCreating] = useState(false);

  // Change password modal
  const [targetUser, setTargetUser] = useState<User | null>(null);
  const [updatedPassword, setUpdatedPassword] = useState('');
  const [showUpdatedPassword, setShowUpdatedPassword] = useState(false);
  const [changingPass, setChangingPass] = useState(false);

  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);

  // Feedback message
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const res = await api.get('/users');
      setUsers(res.data.users || []);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.response?.data?.message || 'Ошибка загрузки пользователей' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setFeedback(null);
    try {
      await api.post('/users', {
        username: newUsername.trim(),
        password: newPassword,
        role: newRole,
      });

      setFeedback({ type: 'success', text: `Пользователь ${newUsername} успешно создан!` });
      setShowCreateModal(false);
      setNewUsername('');
      setNewPassword('');
      setNewRole('user');
      loadUsers();
    } catch (err: any) {
      alert(`Ошибка: ${err.response?.data?.message || err.message}`);
    } finally {
      setCreating(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUser) return;
    setChangingPass(true);
    setFeedback(null);
    try {
      await api.put(`/users/${targetUser.id}/password`, {
        newPassword: updatedPassword,
      });

      setFeedback({ type: 'success', text: `Пароль пользователя ${targetUser.username} успешно изменен!` });
      setTargetUser(null);
      setUpdatedPassword('');
    } catch (err: any) {
      alert(`Ошибка смены пароля: ${err.response?.data?.message || err.message}`);
    } finally {
      setChangingPass(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/users/${deleteTarget.id}`);
      setFeedback({ type: 'success', text: `Пользователь ${deleteTarget.username} удален!` });
      setDeleteTarget(null);
      loadUsers();
    } catch (err: any) {
      alert(`Ошибка удаления: ${err.response?.data?.message || err.message}`);
    }
  };

  const handleToggleRole = async (target: User) => {
    const newRole = target.role === 'admin' ? 'user' : 'admin';
    const confirmMsg =
      target.role === 'admin'
        ? `Понизить пользователя «${target.username}» до обычного пользователя?`
        : `Назначить пользователя «${target.username}» администратором?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      await api.put(`/users/${target.id}/role`, { role: newRole });
      setFeedback({
        type: 'success',
        text: `Роль пользователя «${target.username}» изменена на ${
          newRole === 'admin' ? 'Администратор' : 'Пользователь'
        }`,
      });
      loadUsers();
    } catch (err: any) {
      alert(`Ошибка изменения роли: ${err.response?.data?.message || err.message}`);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
            <Users className="w-7 h-7 text-steam-cyan" />
            Управление пользователями
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Создание аккаунтов, распределение ролей доступа и смена паролей в GameCube-Manager.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-steam-blue hover:bg-steam-blueHover text-white text-sm font-semibold shadow-lg shadow-blue-500/20 transition-all self-start sm:self-auto"
        >
          <UserPlus className="w-4 h-4" />
          <span>Создать пользователя</span>
        </button>
      </div>

      {feedback && (
        <div
          className={`p-4 mb-6 rounded-2xl border text-sm flex items-center justify-between gap-3 ${
            feedback.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/15 border-red-500/30 text-red-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Users List - Mobile Card View (< sm) */}
      {!loading && (
        <div className="block sm:hidden space-y-3 mb-6">
          {users.map((u) => {
            const avatar = u.avatar || {
              initial: u.username.charAt(0).toUpperCase(),
              color: '#1a9fff',
              gradient: 'linear-gradient(135deg, #1a9fff, #00d8d8)',
            };
            const isCurrent = currentUser?.id === u.id;
            const regDate = u.createdAt || (u as any).created_at;
            const formattedDate = formatUserDate(regDate);

            return (
              <div
                key={`mobile-${u.id}`}
                className="p-4 rounded-2xl bg-steam-card border border-steam-border/80 shadow-md space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm shadow-md flex-shrink-0"
                      style={{ background: avatar.gradient || avatar.color }}
                    >
                      {avatar.initial}
                    </div>
                    <div>
                      <div className="font-bold text-slate-100 flex items-center gap-2">
                        <span>{u.username}</span>
                        {isCurrent && (
                          <span className="text-[10px] text-steam-accent bg-steam-blue/20 px-1.5 py-0.2 rounded font-normal">
                            Это вы
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {formattedDate}
                      </div>
                    </div>
                  </div>

                  <div>
                    <button
                      onClick={() => handleToggleRole(u)}
                      disabled={isCurrent && u.role === 'admin'}
                      title={isCurrent ? 'Нельзя изменить свою роль' : 'Нажмите для изменения роли'}
                      className="cursor-pointer transition-transform active:scale-95"
                    >
                      {u.role === 'admin' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded bg-steam-cyan/15 text-steam-cyan border border-steam-cyan/30 uppercase tracking-wider">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          Admin
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                          <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                          User
                        </span>
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-steam-border/50">
                  <button
                    onClick={() => {
                      setTargetUser(u);
                      setUpdatedPassword('');
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-steam-nav hover:bg-steam-cardHover text-slate-200 text-xs font-semibold border border-steam-border transition-colors cursor-pointer"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                    <span>Сменить пароль</span>
                  </button>

                  <button
                    onClick={() => setDeleteTarget(u)}
                    disabled={isCurrent}
                    className="p-2 rounded-xl bg-steam-nav hover:bg-red-500/20 text-slate-300 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed border border-steam-border transition-colors cursor-pointer"
                    title={isCurrent ? 'Нельзя удалить свой аккаунт' : 'Удалить пользователя'}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Users Table - Desktop View (>= sm) */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400">
          <Loader2 className="w-8 h-8 text-steam-cyan animate-spin mb-3" />
          <p className="text-sm">Загрузка списка пользователей...</p>
        </div>
      ) : (
        <div className="hidden sm:block bg-steam-card border border-steam-border/80 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-steam-nav text-xs uppercase text-slate-400 font-semibold border-b border-steam-border">
                <tr>
                  <th className="px-5 py-3.5">Пользователь</th>
                  <th className="px-5 py-3.5">Роль</th>
                  <th className="px-5 py-3.5">Дата регистрации</th>
                  <th className="px-5 py-3.5 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steam-border/50">
                {users.map((u) => {
                  const avatar = u.avatar || {
                    initial: u.username.charAt(0).toUpperCase(),
                    color: '#1a9fff',
                    gradient: 'linear-gradient(135deg, #1a9fff, #00d8d8)',
                  };
                  const isCurrent = currentUser?.id === u.id;
                  const regDate = u.createdAt || (u as any).created_at;
                  const formattedDate = formatUserDate(regDate);

                  return (
                    <tr key={u.id} className="hover:bg-steam-cardHover/50 transition-colors">
                      <td className="px-5 py-4 flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-xs shadow-md flex-shrink-0"
                          style={{ background: avatar.gradient || avatar.color }}
                        >
                          {avatar.initial}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-100 flex items-center gap-2">
                            {u.username}
                            {isCurrent && (
                              <span className="text-[10px] text-steam-accent bg-steam-blue/20 px-1.5 py-0.2 rounded font-normal">
                                Это вы
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <button
                          onClick={() => handleToggleRole(u)}
                          disabled={isCurrent && u.role === 'admin'}
                          title={isCurrent ? 'Нельзя изменить свою роль' : 'Нажмите для изменения роли'}
                          className="group/role cursor-pointer transition-transform active:scale-95 text-left"
                        >
                          {u.role === 'admin' ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg bg-steam-cyan/15 text-steam-cyan border border-steam-cyan/30 uppercase tracking-wider group-hover/role:border-steam-cyan transition-colors">
                              <ShieldCheck className="w-3.5 h-3.5" />
                              Admin
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 group-hover/role:border-slate-500 transition-colors">
                              <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                              User
                            </span>
                          )}
                        </button>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-xs text-slate-400">
                        {formattedDate}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              setTargetUser(u);
                              setUpdatedPassword('');
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-steam-nav hover:bg-steam-cardHover text-slate-200 text-xs font-medium border border-steam-border transition-colors cursor-pointer"
                          >
                            <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                            <span>Пароль</span>
                          </button>

                          <button
                            onClick={() => setDeleteTarget(u)}
                            disabled={isCurrent}
                            className="p-1.5 rounded-lg bg-steam-nav hover:bg-red-500/20 text-slate-300 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                            title={isCurrent ? 'Нельзя удалить свой аккаунт' : 'Удалить пользователя'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {showCreateModal && typeof document !== 'undefined' && createPortal(
        <div
          onClick={() => setShowCreateModal(false)}
          className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md my-auto bg-steam-nav border border-steam-border/90 rounded-2xl shadow-2xl p-5 sm:p-6 relative text-left"
          >
            <button
              onClick={() => setShowCreateModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2 pr-8">
              <UserPlus className="w-5 h-5 text-steam-blue" />
              Новый пользователь
            </h3>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Логин / Username
                </label>
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="Например, gamer или alex"
                  required
                  autoFocus
                  className="w-full bg-steam-card text-slate-100 text-sm rounded-xl px-4 py-2.5 border border-steam-border focus:outline-none focus:border-steam-blue"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Пароль</label>
                <div className="relative flex items-center">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Минимум 6 символов"
                    required
                    minLength={6}
                    className="w-full bg-steam-card text-slate-100 text-sm rounded-xl pl-4 pr-11 py-2.5 border border-steam-border focus:outline-none focus:border-steam-blue font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-2.5 text-slate-400 hover:text-slate-200 transition-colors p-1 cursor-pointer"
                    title={showNewPassword ? 'Скрыть пароль' : 'Показать пароль'}
                    tabIndex={-1}
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Роль</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as any)}
                  className="w-full bg-steam-card text-slate-100 text-sm rounded-xl px-4 py-2.5 border border-steam-border focus:outline-none focus:border-steam-blue"
                >
                  <option value="user">Обычный пользователь (Игры, Wishlist, Торренты)</option>
                  <option value="admin">Администратор (Полный доступ к Host Root, Терминалу и Настройкам)</option>
                </select>
              </div>

              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center sm:justify-end gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-medium text-slate-300 bg-steam-card hover:bg-steam-cardHover text-center"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-steam-blue hover:bg-steam-blueHover disabled:opacity-50 text-center"
                >
                  {creating ? 'Создание...' : 'Создать'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Change Password Modal */}
      {targetUser && typeof document !== 'undefined' && createPortal(
        <div
          onClick={() => setTargetUser(null)}
          className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md my-auto bg-steam-nav border border-steam-border/90 rounded-2xl shadow-2xl p-5 sm:p-6 relative text-left"
          >
            <button
              onClick={() => setTargetUser(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2 pr-8">
              <KeyRound className="w-5 h-5 text-amber-400" />
              Смена пароля: {targetUser.username}
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Задайте новый пароль для учетной записи пользователя.
            </p>

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Новый пароль</label>
                <div className="relative flex items-center">
                  <input
                    type={showUpdatedPassword ? 'text' : 'password'}
                    value={updatedPassword}
                    onChange={(e) => setUpdatedPassword(e.target.value)}
                    placeholder="Минимум 6 символов"
                    required
                    autoFocus
                    minLength={6}
                    className="w-full bg-steam-card text-slate-100 text-sm rounded-xl pl-4 pr-11 py-2.5 border border-steam-border focus:outline-none focus:border-steam-blue font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowUpdatedPassword(!showUpdatedPassword)}
                    className="absolute right-2.5 text-slate-400 hover:text-slate-200 transition-colors p-1 cursor-pointer"
                    title={showUpdatedPassword ? 'Скрыть пароль' : 'Показать пароль'}
                    tabIndex={-1}
                  >
                    {showUpdatedPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center sm:justify-end gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setTargetUser(null)}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-medium text-slate-300 bg-steam-card hover:bg-steam-cardHover text-center"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={changingPass}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-center"
                >
                  {changingPass ? 'Сохранение...' : 'Обновить пароль'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Delete User Modal */}
      {deleteTarget && typeof document !== 'undefined' && createPortal(
        <div
          onClick={() => setDeleteTarget(null)}
          className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md my-auto bg-steam-nav border border-steam-border/90 rounded-2xl shadow-2xl p-5 sm:p-6 relative text-left"
          >
            <h3 className="text-base font-bold text-white mb-2">Удаление пользователя</h3>
            <p className="text-sm text-slate-300 mb-5 leading-relaxed">
              Вы уверены, что хотите удалить аккаунт <strong className="text-white">{deleteTarget.username}</strong>?
              Его список желаемого и настройки будут удалены.
            </p>
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center sm:justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-medium text-slate-300 bg-steam-card hover:bg-steam-cardHover text-center"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleDeleteUser}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-red-600 hover:bg-red-700 text-center"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

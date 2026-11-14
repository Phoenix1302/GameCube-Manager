import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Gamepad2, Lock, User, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

export const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { login, needsSetup, isLoading, isAuthenticated, isAdmin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading) {
      if (needsSetup) {
        navigate('/setup', { replace: true });
      } else if (isAuthenticated) {
        navigate(isAdmin ? '/admin/monitoring' : '/', { replace: true });
      }
    }
  }, [isLoading, needsSetup, isAuthenticated, isAdmin, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await api.post('/auth/login', {
        username: username.trim(),
        password,
      });

      login(res.data.token, res.data.user);
      navigate(res.data.user.role === 'admin' ? '/admin/monitoring' : '/');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Неверный логин или пароль');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-steam-dark flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background ambient gaming glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-steam-blue/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 w-80 h-80 bg-steam-cyan/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md bg-steam-card/90 backdrop-blur-xl border border-steam-border/90 rounded-3xl p-5 sm:p-8 shadow-2xl shadow-black/80">
        {/* Brand header */}
        <div className="text-center mb-8">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-tr from-steam-blue to-steam-cyan items-center justify-center shadow-lg shadow-steam-blue/30 mb-4">
            <Gamepad2 className="w-8 h-8 text-white" />
          </div>
          <div className="flex items-center justify-center gap-2 mb-1">
            <h2 className="text-2xl font-extrabold text-white tracking-tight">GAMECUBE MANAGER</h2>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-steam-cyan/15 text-steam-cyan border border-steam-cyan/30">
              v1.0.1
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Вход в панель управления Steam Machine
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Имя пользователя
            </label>
            <div className="relative">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Введите имя пользователя"
                required
                autoFocus
                className="w-full bg-steam-nav text-slate-100 placeholder-slate-500 text-sm rounded-xl pl-10 pr-4 py-3 border border-steam-border focus:outline-none focus:border-steam-blue transition-colors"
              />
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Пароль
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-steam-nav text-slate-100 placeholder-slate-500 text-sm rounded-xl pl-10 pr-11 py-3 border border-steam-border focus:outline-none focus:border-steam-blue transition-colors font-mono"
              />
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-200 transition-colors p-0.5 rounded cursor-pointer"
                title={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-steam-blue to-blue-600 hover:from-blue-500 hover:to-blue-700 text-white font-bold text-sm shadow-lg shadow-blue-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Вход...</span>
                </>
              ) : (
                <span>Войти в систему</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

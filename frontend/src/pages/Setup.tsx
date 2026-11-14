import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Gamepad2,
  Lock,
  User,
  Shield,
  CheckCircle2,
  AlertCircle,
  Loader2,
  KeyRound,
  Eye,
  EyeOff,
  Sparkles,
  Server,
  FolderTree,
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

export const Setup: React.FC = () => {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { login, needsSetup, isLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        navigate('/admin/monitoring', { replace: true });
      } else if (!needsSetup) {
        navigate('/login', { replace: true });
      }
    }
  }, [isLoading, needsSetup, isAuthenticated, navigate]);

  // Password strength check
  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, text: 'Введите пароль', color: 'bg-slate-700' };
    if (pass.length < 6) return { score: 1, text: 'Слишком короткий (мин. 6)', color: 'bg-red-500' };
    let score = 1;
    if (pass.length >= 8) score++;
    if (/[A-Z]/.test(pass) || /[0-9]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;

    if (score === 2) return { score: 2, text: 'Нормальный', color: 'bg-amber-400' };
    if (score === 3) return { score: 3, text: 'Надёжный', color: 'bg-emerald-400' };
    return { score: 4, text: 'Очень надёжный', color: 'bg-steam-cyan' };
  };

  const strength = getPasswordStrength(password);
  const passwordsMatch = password.length > 0 && password === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('Пароль должен содержать минимум 6 символов');
      return;
    }

    if (password !== confirmPassword) {
      setError('Введенные пароли не совпадают');
      return;
    }

    setLoading(true);

    try {
      const res = await api.post('/auth/setup', {
        username: username.trim() || 'admin',
        password,
        confirmPassword,
      });

      login(res.data.token, res.data.user);
      navigate('/admin/monitoring', { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Не удалось завершить настройку');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-steam-dark flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background ambient gaming glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-steam-blue/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 w-96 h-96 bg-steam-cyan/15 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-xl bg-steam-card/95 backdrop-blur-xl border border-steam-border/90 rounded-3xl p-5 sm:p-10 shadow-2xl shadow-black/80">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex w-16 h-16 rounded-2xl bg-gradient-to-tr from-steam-blue to-steam-cyan items-center justify-center shadow-lg shadow-steam-blue/30 mb-4">
            <Gamepad2 className="w-9 h-9 text-white" />
          </div>
          <div className="flex items-center justify-center gap-2 mb-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              GAMECUBE MANAGER
            </h1>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-steam-cyan/20 text-steam-cyan border border-steam-cyan/40">
              v1.1.1
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-300 max-w-md mx-auto">
            Добро пожаловать в веб-панель управления вашей кастомной Steam Machine. Выполните первоначальную настройку администратора.
          </p>
        </div>

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6 p-4 rounded-2xl bg-steam-nav/70 border border-steam-border/60 text-xs">
          <div className="flex items-start gap-2.5">
            <div className="p-1.5 rounded-lg bg-steam-blue/20 text-steam-blue mt-0.5">
              <Shield className="w-4 h-4 flex-shrink-0" />
            </div>
            <div>
              <div className="font-bold text-white">Root-доступ</div>
              <div className="text-[11px] text-slate-400">Терминал и файлы системы</div>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <div className="p-1.5 rounded-lg bg-steam-cyan/20 text-steam-cyan mt-0.5">
              <Server className="w-4 h-4 flex-shrink-0" />
            </div>
            <div>
              <div className="font-bold text-white">Мониторинг</div>
              <div className="text-[11px] text-slate-400">CPU, RAM, диски и сеть</div>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <div className="p-1.5 rounded-lg bg-purple-500/20 text-purple-400 mt-0.5">
              <Sparkles className="w-4 h-4 flex-shrink-0" />
            </div>
            <div>
              <div className="font-bold text-white">Пользователи</div>
              <div className="text-[11px] text-slate-400">Аккаунты для игроков</div>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Username */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Имя учётной записи администратора
            </label>
            <div className="relative">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Имя администратора"
                required
                minLength={3}
                className="w-full bg-steam-nav text-slate-100 placeholder-slate-500 text-sm rounded-xl pl-10 pr-4 py-3 border border-steam-border focus:outline-none focus:border-steam-blue transition-colors font-mono"
              />
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Главный логин с правами суперадминистратора (по умолчанию: admin)
            </p>
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Пароль администратора
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Придумайте надёжный мастер-пароль"
                required
                minLength={6}
                className="w-full bg-steam-nav text-slate-100 placeholder-slate-500 text-sm rounded-xl pl-10 pr-11 py-3 border border-steam-border focus:outline-none focus:border-steam-blue transition-colors font-mono"
              />
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-200 transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Password strength visualizer */}
            {password.length > 0 && (
              <div className="mt-2 space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Надёжность:</span>
                  <span className="font-semibold text-slate-300">{strength.text}</span>
                </div>
                <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden flex gap-1">
                  {[1, 2, 3, 4].map((step) => (
                    <div
                      key={step}
                      className={`h-full flex-1 rounded-full transition-all duration-300 ${
                        step <= strength.score ? strength.color : 'bg-slate-800'
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Подтверждение пароля
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Повторите введённый пароль"
                required
                minLength={6}
                className={`w-full bg-steam-nav text-slate-100 placeholder-slate-500 text-sm rounded-xl pl-10 pr-16 py-3 border transition-colors font-mono focus:outline-none ${
                  confirmPassword.length > 0
                    ? passwordsMatch
                      ? 'border-emerald-500/80 focus:border-emerald-500'
                      : 'border-red-500/80 focus:border-red-500'
                    : 'border-steam-border focus:border-steam-blue'
                }`}
              />
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <div className="absolute right-3.5 top-3.5 flex items-center gap-2">
                {confirmPassword.length > 0 && (
                  <div>
                    {passwordsMatch ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-400" />
                    )}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-slate-400 hover:text-slate-200 transition-colors p-0.5 cursor-pointer"
                  title={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {confirmPassword.length > 0 && !passwordsMatch && (
              <p className="text-[11px] text-red-400 mt-1">Пароли не совпадают</p>
            )}
          </div>

          <div className="pt-3">
            <button
              type="submit"
              disabled={loading || !passwordsMatch || password.length < 6}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-steam-blue via-blue-600 to-steam-cyan hover:opacity-95 text-white font-bold text-sm shadow-lg shadow-blue-500/25 transition-all flex items-center justify-center gap-2.5 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Инициализация системы...</span>
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4" />
                  <span>Завершить настройку и войти в систему</span>
                </>
              )}
            </button>
          </div>
        </form>

        <div className="mt-8 pt-5 border-t border-steam-border/60 text-center">
          <p className="text-[11px] text-slate-400">
            После создания администратора вы сможете добавлять аккаунты для игроков через панель «Управление пользователями».
          </p>
        </div>
      </div>
    </div>
  );
};

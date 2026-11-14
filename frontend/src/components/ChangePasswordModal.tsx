import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
} from 'lucide-react';
import { api } from '../services/api';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  username: string;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  isOpen,
  onClose,
  username,
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 6) {
      setError('Новый пароль должен содержать не менее 6 символов');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Новые пароли не совпадают');
      return;
    }

    setLoading(true);

    try {
      await api.put('/auth/change-password', {
        currentPassword,
        newPassword,
        confirmPassword,
      });

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Не удалось сменить пароль');
    } finally {
      setLoading(false);
    }
  };

  const modalContent = (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md my-auto bg-steam-nav border border-steam-border/90 rounded-2xl sm:rounded-3xl shadow-2xl p-5 sm:p-7 relative text-left animate-in zoom-in-95 duration-150"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-3.5 right-3.5 sm:top-4 sm:right-4 text-slate-400 hover:text-white hover:bg-white/10 transition-colors p-1.5 rounded-xl cursor-pointer"
          title="Закрыть"
          aria-label="Закрыть"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-5 pr-8">
          <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30 flex-shrink-0">
            <KeyRound className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-bold text-white truncate">Смена пароля</h3>
            <p className="text-xs text-slate-400 truncate">
              Аккаунт: <span className="text-slate-200 font-semibold">{username}</span>
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span className="leading-snug">{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span className="leading-snug">Пароль успешно обновлён! Закрытие...</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Current Password */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Текущий пароль
            </label>
            <div className="relative flex items-center">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
              <input
                type={showCurrentPassword ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Введите текущий пароль"
                required
                autoFocus
                className="w-full bg-steam-card text-slate-100 placeholder-slate-500 text-sm rounded-xl pl-10 pr-11 py-2.5 border border-steam-border focus:outline-none focus:border-steam-blue font-mono transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                className="absolute right-2.5 text-slate-400 hover:text-slate-200 transition-colors p-1 rounded-lg cursor-pointer"
                title={showCurrentPassword ? 'Скрыть пароль' : 'Показать пароль'}
                tabIndex={-1}
              >
                {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* New Password */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Новый пароль
            </label>
            <div className="relative flex items-center">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
              <input
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Минимум 6 символов"
                required
                minLength={6}
                className="w-full bg-steam-card text-slate-100 placeholder-slate-500 text-sm rounded-xl pl-10 pr-11 py-2.5 border border-steam-border focus:outline-none focus:border-steam-blue font-mono transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-2.5 text-slate-400 hover:text-slate-200 transition-colors p-1 rounded-lg cursor-pointer"
                title={showNewPassword ? 'Скрыть пароль' : 'Показать пароль'}
                tabIndex={-1}
              >
                {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Подтверждение нового пароля
            </label>
            <div className="relative flex items-center">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Повторите новый пароль"
                required
                minLength={6}
                className={`w-full bg-steam-card text-slate-100 placeholder-slate-500 text-sm rounded-xl pl-10 pr-16 py-2.5 border font-mono transition-colors focus:outline-none ${
                  confirmPassword.length > 0
                    ? passwordsMatch
                      ? 'border-emerald-500/80 focus:border-emerald-500'
                      : 'border-red-500/80 focus:border-red-500'
                    : 'border-steam-border focus:border-steam-blue'
                }`}
              />
              <div className="absolute right-2.5 flex items-center gap-1.5">
                {confirmPassword.length > 0 && (
                  <div className="flex-shrink-0">
                    {passwordsMatch ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-400" />
                    )}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="text-slate-400 hover:text-slate-200 transition-colors p-1 rounded-lg cursor-pointer"
                  title={showConfirmPassword ? 'Скрыть пароль' : 'Показать пароль'}
                  tabIndex={-1}
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {confirmPassword.length > 0 && !passwordsMatch && (
              <p className="text-[11px] text-red-400 mt-1">Пароли не совпадают</p>
            )}
          </div>

          {/* Action Buttons: Responsive mobile flex-col-reverse */}
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center sm:justify-end gap-2.5 pt-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium text-slate-300 bg-steam-card hover:bg-steam-cardHover transition-colors cursor-pointer text-center"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={loading || !passwordsMatch || newPassword.length < 6 || !currentPassword}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed shadow-md shadow-amber-500/20"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Сохранение...</span>
                </>
              ) : (
                <span>Сменить пароль</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};

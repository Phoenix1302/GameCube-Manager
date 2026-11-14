import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Info, CheckCircle2, AlertCircle, Trash2, X } from 'lucide-react';

export interface ConfirmOptions {
  title?: string;
  message: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'primary' | 'success' | 'info';
  showCheckbox?: boolean;
  checkboxLabel?: string;
  checkboxDefault?: boolean;
}

export interface ConfirmResult {
  confirmed: boolean;
  checked: boolean;
}

export interface AlertOptions {
  title?: string;
  message: string;
  description?: string;
  buttonText?: string;
  variant?: 'danger' | 'warning' | 'info' | 'success';
}

interface ConfirmContextType {
  confirm: (options: ConfirmOptions | string) => Promise<ConfirmResult>;
  alert: (options: AlertOptions | string) => Promise<void>;
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dialogState, setDialogState] = useState<{
    isOpen: boolean;
    isAlert: boolean;
    title: string;
    message: string;
    description?: string;
    confirmText: string;
    cancelText: string;
    variant: 'danger' | 'warning' | 'primary' | 'success' | 'info';
    showCheckbox: boolean;
    checkboxLabel?: string;
    checkboxChecked: boolean;
    resolve: (result: any) => void;
  } | null>(null);

  const confirm = useCallback((options: ConfirmOptions | string): Promise<ConfirmResult> => {
    return new Promise((resolve) => {
      const opts: ConfirmOptions = typeof options === 'string' ? { message: options } : options;
      setDialogState({
        isOpen: true,
        isAlert: false,
        title: opts.title || 'Подтверждение действия',
        message: opts.message,
        description: opts.description,
        confirmText: opts.confirmText || 'Подтвердить',
        cancelText: opts.cancelText || 'Отмена',
        variant: opts.variant || 'danger',
        showCheckbox: Boolean(opts.showCheckbox),
        checkboxLabel: opts.checkboxLabel,
        checkboxChecked: Boolean(opts.checkboxDefault),
        resolve,
      });
    });
  }, []);

  const alert = useCallback((options: AlertOptions | string): Promise<void> => {
    return new Promise((resolve) => {
      const opts: AlertOptions = typeof options === 'string' ? { message: options } : options;
      setDialogState({
        isOpen: true,
        isAlert: true,
        title: opts.title || (opts.variant === 'danger' ? 'Ошибка' : 'Уведомление'),
        message: opts.message,
        description: opts.description,
        confirmText: opts.buttonText || 'Понятно',
        cancelText: '',
        variant: opts.variant || (opts.variant === 'danger' ? 'danger' : 'info'),
        showCheckbox: false,
        checkboxChecked: false,
        resolve: () => resolve(),
      });
    });
  }, []);

  const handleClose = useCallback(
    (confirmed: boolean) => {
      if (!dialogState) return;
      const { resolve, isAlert, checkboxChecked } = dialogState;
      setDialogState(null);
      if (isAlert) {
        resolve(undefined);
      } else {
        resolve({ confirmed, checked: checkboxChecked });
      }
    },
    [dialogState]
  );

  useEffect(() => {
    if (!dialogState?.isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose(false);
      } else if (e.key === 'Enter' && !dialogState.showCheckbox) {
        e.preventDefault();
        handleClose(true);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dialogState, handleClose]);

  const renderIcon = () => {
    if (!dialogState) return null;
    switch (dialogState.variant) {
      case 'danger':
        return (
          <div className="w-11 h-11 rounded-2xl bg-red-500/20 border border-red-500/30 flex items-center justify-center flex-shrink-0 text-red-400 shadow-lg shadow-red-500/10">
            <Trash2 className="w-5 h-5" />
          </div>
        );
      case 'warning':
        return (
          <div className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center flex-shrink-0 text-amber-400 shadow-lg shadow-amber-500/10">
            <AlertTriangle className="w-5 h-5" />
          </div>
        );
      case 'success':
        return (
          <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center flex-shrink-0 text-emerald-400 shadow-lg shadow-emerald-500/10">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        );
      default:
        return (
          <div className="w-11 h-11 rounded-2xl bg-steam-blue/20 border border-steam-blue/30 flex items-center justify-center flex-shrink-0 text-steam-accent shadow-lg shadow-steam-blue/10">
            <Info className="w-5 h-5" />
          </div>
        );
    }
  };

  const getConfirmBtnClass = () => {
    if (!dialogState) return '';
    switch (dialogState.variant) {
      case 'danger':
        return 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/25';
      case 'warning':
        return 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-600/25';
      case 'success':
        return 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/25';
      default:
        return 'bg-steam-blue hover:bg-steam-blueHover text-white shadow-lg shadow-blue-500/25';
    }
  };

  return (
    <ConfirmContext.Provider value={{ confirm, alert }}>
      {children}
      {dialogState?.isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
            onClick={() => handleClose(false)}
          >
            <div
              className="w-full max-w-md bg-steam-nav border border-steam-border/90 rounded-3xl p-6 shadow-2xl text-left relative overflow-hidden animate-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header with Icon and Title */}
              <div className="flex items-start gap-4 mb-4">
                {renderIcon()}
                <div className="flex-1 pr-6">
                  <h3 className="text-base sm:text-lg font-bold text-white tracking-tight leading-snug">
                    {dialogState.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-200 mt-1.5 leading-relaxed font-normal whitespace-pre-line">
                    {dialogState.message}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleClose(false)}
                  className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-steam-card transition-colors cursor-pointer"
                  title="Закрыть"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Optional detailed description */}
              {dialogState.description && (
                <div className="mb-4 p-3 rounded-xl bg-steam-card/80 border border-steam-border/60 text-xs text-slate-400 leading-relaxed font-mono break-all">
                  {dialogState.description}
                </div>
              )}

              {/* Optional Checkbox */}
              {dialogState.showCheckbox && dialogState.checkboxLabel && (
                <div className="mb-5">
                  <label className="flex items-start gap-3 p-3.5 rounded-xl bg-steam-card border border-steam-border/80 hover:border-slate-500 transition-colors cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={dialogState.checkboxChecked}
                      onChange={(e) =>
                        setDialogState((prev) =>
                          prev ? { ...prev, checkboxChecked: e.target.checked } : null
                        )
                      }
                      className="mt-0.5 w-4 h-4 rounded text-red-500 bg-slate-900 border-steam-border focus:ring-0 cursor-pointer"
                    />
                    <div className="text-xs text-slate-200 font-medium leading-tight">
                      {dialogState.checkboxLabel}
                    </div>
                  </label>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center sm:justify-end gap-2.5 pt-2 border-t border-steam-border/50">
                {!dialogState.isAlert && (
                  <button
                    type="button"
                    onClick={() => handleClose(false)}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-300 hover:text-white bg-steam-card hover:bg-steam-cardHover border border-steam-border transition-colors text-center cursor-pointer"
                  >
                    {dialogState.cancelText}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleClose(true)}
                  className={`w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all text-center cursor-pointer ${getConfirmBtnClass()}`}
                >
                  {dialogState.confirmText}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </ConfirmContext.Provider>
  );
};

export const useConfirm = () => {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return context;
};

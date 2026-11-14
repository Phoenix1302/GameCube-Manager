import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ShieldCheck, UserCheck, Settings, Users, LogOut, KeyRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ChangePasswordModal } from './ChangePasswordModal';

export const UserPill: React.FC = () => {
  const { user, isAdmin, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) return null;

  const avatar = user.avatar || {
    initial: user.username.charAt(0).toUpperCase(),
    color: '#1a9fff',
    gradient: 'linear-gradient(135deg, #1a9fff, #00d8d8)',
  };

  const handleLogout = () => {
    setIsOpen(false);
    logout();
    navigate('/login');
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* User Pill Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-steam-card/90 hover:bg-steam-cardHover border border-steam-border/80 hover:border-steam-blue/60 transition-all duration-200 shadow-md group focus:outline-none focus:ring-2 focus:ring-steam-blue/40"
      >
        {/* Circular Avatar */}
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-white text-xs shadow-inner flex-shrink-0"
          style={{ background: avatar.gradient || avatar.color }}
        >
          {avatar.initial}
        </div>

        {/* Username */}
        <span className="text-sm font-medium text-slate-200 group-hover:text-white transition-colors max-w-[75px] sm:max-w-[120px] truncate">
          {user.username}
        </span>

        {/* Admin Badge */}
        {isAdmin && (
          <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-steam-cyan/15 text-steam-cyan border border-steam-cyan/30 uppercase">
            <ShieldCheck className="w-3 h-3" />
            ADMIN
          </span>
        )}

        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 group-hover:text-slate-200 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-steam-blue' : ''
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-60 rounded-xl bg-steam-nav/95 backdrop-blur-xl border border-steam-border/80 shadow-2xl py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
          {/* User info banner inside dropdown */}
          <div className="px-4 py-2.5 border-b border-steam-border/60 flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm shadow-md flex-shrink-0"
              style={{ background: avatar.gradient || avatar.color }}
            >
              {avatar.initial}
            </div>
            <div className="overflow-hidden">
              <div className="font-semibold text-slate-100 truncate">{user.username}</div>
              <div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                {isAdmin ? (
                  <span className="text-steam-cyan font-medium flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    Администратор
                  </span>
                ) : (
                  <span className="text-slate-400 flex items-center gap-1">
                    <UserCheck className="w-3 h-3" />
                    Пользователь
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Quick links */}
          <div className="py-1">
            <button
              onClick={() => {
                setIsOpen(false);
                navigate('/settings');
              }}
              className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-300 hover:text-white hover:bg-steam-cardHover/70 transition-colors text-left"
            >
              <Settings className="w-4 h-4 text-steam-accent" />
              <span>Настройки системы</span>
            </button>

            {isAdmin && (
              <button
                onClick={() => {
                  setIsOpen(false);
                  navigate('/admin/users');
                }}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-300 hover:text-white hover:bg-steam-cardHover/70 transition-colors text-left"
              >
                <Users className="w-4 h-4 text-steam-cyan" />
                <span>Управление аккаунтами</span>
              </button>
            )}

            {/* Change Password for current user (available for both users and admins) */}
            <button
              onClick={() => {
                setIsOpen(false);
                setShowPasswordModal(true);
              }}
              className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-300 hover:text-white hover:bg-steam-cardHover/70 transition-colors text-left"
            >
              <KeyRound className="w-4 h-4 text-amber-400" />
              <span>Сменить пароль</span>
            </button>
          </div>

          <div className="border-t border-steam-border/60 my-1"></div>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors text-left"
          >
            <LogOut className="w-4 h-4" />
            <span>Выйти из аккаунта</span>
          </button>
        </div>
      )}

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        username={user.username}
      />
    </div>
  );
};

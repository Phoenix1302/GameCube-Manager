import React, { useState } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import {
  Gamepad,
  Gamepad2,
  Heart,
  DownloadCloud,
  FolderSync,
  Activity,
  FolderTree,
  Terminal,
  Users,
  Settings,
  Menu,
  X,
  Shield,
  LogOut,
} from 'lucide-react';
import { UserPill } from './UserPill';
import { useAuth } from '../context/AuthContext';

export const Navbar: React.FC = () => {
  const { user, isAdmin, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  const avatar = user?.avatar || {
    initial: user?.username ? user.username.charAt(0).toUpperCase() : 'U',
    color: '#1a9fff',
    gradient: 'linear-gradient(135deg, #1a9fff, #00d8d8)',
  };

  const handleMobileLogout = () => {
    setMobileMenuOpen(false);
    logout();
    navigate('/login');
  };

  // Navigation for regular users (Gaming suite + Files)
  const userNavItems = [
    { name: 'Игры', path: '/', icon: Gamepad },
    { name: 'Торренты', path: '/torrents', icon: DownloadCloud },
    { name: 'Файлы', path: '/files', icon: FolderTree },
    { name: 'Wishlist', path: '/wishlist', icon: Heart },
    { name: 'Steam Library', path: '/steam', icon: FolderSync },
    { name: 'Настройки', path: '/settings', icon: Settings },
  ];

  // Navigation for administrator (Management suite + Files)
  const adminNavItems = [
    { name: 'Мониторинг', path: '/admin/monitoring', icon: Activity },
    { name: 'Торренты', path: '/torrents', icon: DownloadCloud },
    { name: 'Файлы', path: '/files', icon: FolderTree },
    { name: 'Терминал', path: '/admin/terminal', icon: Terminal },
    { name: 'Пользователи', path: '/admin/users', icon: Users },
    { name: 'Настройки', path: '/settings', icon: Settings },
  ];

  const currentNavItems = isAdmin ? adminNavItems : userNavItems;
  const homePath = isAdmin ? '/admin/monitoring' : '/';

  return (
    <nav className="sticky top-0 z-40 bg-steam-nav/95 backdrop-blur-md border-b border-steam-border/80 shadow-lg">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-2 sm:gap-4">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3 sm:gap-6 min-w-0">
            <Link to={homePath} className="flex items-center gap-2 sm:gap-2.5 group flex-shrink-0">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-steam-blue to-steam-cyan flex items-center justify-center shadow-md shadow-steam-blue/25 group-hover:scale-105 transition-transform duration-200 flex-shrink-0">
                <Gamepad2 className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <span className="font-extrabold text-sm sm:text-base tracking-tight text-white whitespace-nowrap">
                GAMECUBE
              </span>
            </Link>

            {/* Desktop Navigation Links */}
            <div className="hidden xl:flex items-center space-x-1 2xl:space-x-1.5">
              {currentNavItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                      `flex items-center gap-1.5 2xl:gap-2 px-2.5 2xl:px-3 py-1.5 2xl:py-2 rounded-xl text-xs 2xl:text-sm font-semibold tracking-wide whitespace-nowrap transition-all duration-150 ${
                        isActive
                          ? isAdmin
                            ? 'bg-steam-card text-steam-cyan border border-steam-cyan/40 shadow-sm'
                            : 'bg-steam-card text-steam-accent border border-steam-border shadow-sm'
                          : 'text-slate-300 hover:text-white hover:bg-steam-cardHover/70'
                      }`
                    }
                  >
                    <Icon className={`w-4 h-4 ${isAdmin ? 'text-steam-cyan' : 'text-steam-accent'}`} />
                    <span>{item.name}</span>
                  </NavLink>
                );
              })}
            </div>
          </div>

          {/* Right section: UserPill & Mobile Toggle */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <UserPill />

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="xl:hidden p-2 rounded-xl text-slate-300 hover:text-white hover:bg-steam-card active:scale-95 transition-all flex-shrink-0 focus:outline-none"
              aria-label="Меню навигации"
            >
              {mobileMenuOpen ? <X className="w-5 h-5 sm:w-6 sm:h-6" /> : <Menu className="w-5 h-5 sm:w-6 sm:h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="xl:hidden bg-steam-nav/98 backdrop-blur-xl border-b border-steam-border px-3.5 sm:px-6 pt-2 pb-5 space-y-3 animate-in slide-in-from-top-2 duration-150">
          {/* User profile card inside drawer */}
          {user && (
            <div className="p-3 rounded-xl bg-steam-card/80 border border-steam-border flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 overflow-hidden">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-white text-xs shadow-md flex-shrink-0"
                  style={{ background: avatar.gradient || avatar.color }}
                >
                  {avatar.initial}
                </div>
                <div className="overflow-hidden">
                  <div className="font-semibold text-sm text-slate-100 truncate">{user.username}</div>
                  <div className="text-[11px] text-slate-400 flex items-center gap-1">
                    {isAdmin ? (
                      <span className="text-steam-cyan font-medium flex items-center gap-1">
                        <Shield className="w-3 h-3" /> Администратор
                      </span>
                    ) : (
                      <span className="text-slate-400">Пользователь</span>
                    )}
                  </div>
                </div>
              </div>

              <button
                onClick={handleMobileLogout}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20 text-xs font-semibold transition-colors flex-shrink-0"
                title="Выйти из аккаунта"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Выйти</span>
              </button>
            </div>
          )}

          {/* Section Divider & Label */}
          <div className="flex items-center gap-2.5 pt-1.5 pb-0.5 px-2 select-none pointer-events-none cursor-default">
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400/90 uppercase tracking-widest">
              {isAdmin ? (
                <Shield className="w-3 h-3 text-slate-500 flex-shrink-0" />
              ) : (
                <Gamepad className="w-3 h-3 text-slate-500 flex-shrink-0" />
              )}
              <span>{isAdmin ? 'Панель администратора' : 'Игровой портал'}</span>
            </span>
            <div className="flex-1 h-px bg-steam-border/70" />
          </div>
          <div className="space-y-1">
            {currentNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                      isActive
                        ? isAdmin
                          ? 'bg-steam-card text-steam-cyan font-bold border border-steam-cyan/30'
                          : 'bg-steam-card text-steam-accent font-bold border border-steam-blue/30'
                        : 'text-slate-300 hover:text-white hover:bg-steam-cardHover'
                    }`
                  }
                >
                  <Icon className={`w-4 h-4 ${isAdmin ? 'text-steam-cyan' : 'text-steam-accent'}`} />
                  <span>{item.name}</span>
                </NavLink>
              );
            })}
          </div>
        </div>
      )}
    </nav>
  );
};

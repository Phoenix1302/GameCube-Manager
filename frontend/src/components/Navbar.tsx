import React, { useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
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
} from 'lucide-react';
import { UserPill } from './UserPill';
import { useAuth } from '../context/AuthContext';

export const Navbar: React.FC = () => {
  const { isAdmin } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Navigation for regular users (Gaming suite)
  const userNavItems = [
    { name: 'Игры', path: '/', icon: Gamepad },
    { name: 'Торренты', path: '/torrents', icon: DownloadCloud },
    { name: 'Wishlist', path: '/wishlist', icon: Heart },
    { name: 'Steam Library', path: '/steam', icon: FolderSync },
  ];

  // Navigation for administrator (Management suite + Torrents ONLY; no gaming/user sections)
  const adminNavItems = [
    { name: 'Мониторинг', path: '/admin/monitoring', icon: Activity },
    { name: 'Торренты', path: '/torrents', icon: DownloadCloud },
    { name: 'Файлы', path: '/admin/files', icon: FolderTree },
    { name: 'Терминал', path: '/admin/terminal', icon: Terminal },
    { name: 'Пользователи', path: '/admin/users', icon: Users },
    { name: 'Настройки', path: '/settings', icon: Settings },
  ];

  const currentNavItems = isAdmin ? adminNavItems : userNavItems;
  const homePath = isAdmin ? '/admin/monitoring' : '/';

  return (
    <nav className="sticky top-0 z-40 bg-steam-nav/95 backdrop-blur-md border-b border-steam-border/80 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center gap-6">
            <Link to={homePath} className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-steam-blue to-steam-cyan flex items-center justify-center shadow-md shadow-steam-blue/25 group-hover:scale-105 transition-transform duration-200">
                <Gamepad2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="font-extrabold text-base tracking-tight text-white flex items-center gap-1.5">
                  GAMECUBE
                  <span className={`text-xs px-1.5 py-0.2 font-semibold rounded border ${
                    isAdmin
                      ? 'bg-steam-cyan/20 text-steam-cyan border-steam-cyan/30'
                      : 'bg-steam-blue/20 text-steam-accent border-steam-blue/30'
                  }`}>
                    {isAdmin ? 'ADMIN' : 'PORTAL'}
                  </span>
                </span>
              </div>
            </Link>

            {/* Desktop Navigation Links */}
            <div className="hidden lg:flex items-center space-x-1.5">
              {currentNavItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                      `flex items-center gap-2 px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold tracking-wide transition-all duration-150 ${
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
          <div className="flex items-center gap-3">
            <UserPill />

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-steam-card transition-colors"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-steam-nav border-b border-steam-border px-4 pt-2 pb-4 space-y-1">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider px-3 py-1 flex items-center gap-1.5">
            {isAdmin ? <Shield className="w-3.5 h-3.5 text-steam-cyan" /> : <Gamepad className="w-3.5 h-3.5 text-steam-accent" />}
            {isAdmin ? 'Панель администратора' : 'Игровой портал'}
          </div>
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
                        ? 'bg-steam-card text-steam-cyan font-bold'
                        : 'bg-steam-card text-steam-accent font-bold'
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
      )}
    </nav>
  );
};

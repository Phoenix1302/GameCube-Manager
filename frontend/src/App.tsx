import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';

// Pages
import { Discover } from './pages/Discover';
import { Wishlist } from './pages/Wishlist';
import { Torrents } from './pages/Torrents';
import { SteamLibrary } from './pages/SteamLibrary';
import { Settings } from './pages/Settings';
import { AdminMonitoring } from './pages/AdminMonitoring';
import { AdminFiles } from './pages/AdminFiles';
import { AdminTerminal } from './pages/AdminTerminal';
import { AdminUsers } from './pages/AdminUsers';
import { Login } from './pages/Login';
import { Setup } from './pages/Setup';

const ProtectedLayout: React.FC = () => {
  const { isAuthenticated, isLoading, needsSetup } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-steam-dark flex items-center justify-center text-slate-400">
        <div className="w-8 h-8 rounded-full border-2 border-steam-blue border-t-transparent animate-spin" />
      </div>
    );
  }

  if (needsSetup) {
    return <Navigate to="/setup" replace />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-steam-dark flex flex-col text-slate-100">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
};

const AdminRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { isAdmin, isLoading } = useAuth();

  if (isLoading) return null;

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
};

const HomeRoute: React.FC = () => {
  const { isAdmin, isLoading } = useAuth();

  if (isLoading) return null;

  if (isAdmin) {
    return <Navigate to="/admin/monitoring" replace />;
  }

  return <Discover />;
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/setup" element={<Setup />} />

          {/* Protected Main Routes */}
          <Route element={<ProtectedLayout />}>
            <Route path="/" element={<HomeRoute />} />

            {/* Gaming & Steam Routes (accessible by both regular users and admin) */}
            <Route path="/discover" element={<Discover />} />
            <Route path="/wishlist" element={<Wishlist />} />
            <Route path="/steam" element={<SteamLibrary />} />

            {/* Shared Route: Torrents & File Manager */}
            <Route path="/torrents" element={<Torrents />} />
            <Route path="/files" element={<AdminFiles />} />
            <Route path="/admin/files" element={<AdminFiles />} />

            {/* Settings Route */}
            <Route path="/settings" element={<Settings />} />

            {/* Admin-only Routes */}
            <Route
              path="/admin/monitoring"
              element={
                <AdminRoute>
                  <AdminMonitoring />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/terminal"
              element={
                <AdminRoute>
                  <AdminTerminal />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/users"
              element={
                <AdminRoute>
                  <AdminUsers />
                </AdminRoute>
              }
            />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;

import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { UIProvider } from './ui';
import Login from './pages/Login';
import AppShell from './AppShell';
import type { ReactNode } from 'react';

function Splash() {
  return (
    <div className="center-screen">
      <div className="spinner" />
    </div>
  );
}

function SsoHint() {
  return (
    <div className="center-screen" style={{ flexDirection: 'column', gap: 16, textAlign: 'center' }}>
      <div style={{ fontSize: 16, color: '#e53e3e' }}>未找到有效会话</div>
      <div style={{ fontSize: 13, color: '#888' }}>请返回主系统运营中心重新进入云微</div>
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (!user) return <SsoHint />;
  return <>{children}</>;
}

function Shell() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <UIProvider>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </UIProvider>
  );
}

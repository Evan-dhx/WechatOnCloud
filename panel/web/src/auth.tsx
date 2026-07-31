import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type PanelUser } from './api';

interface AuthCtx {
  user: PanelUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

const Ctx = createContext<AuthCtx>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PanelUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      // SSO 免登：检测 URL 中的 sso_token 参数
      const params = new URLSearchParams(window.location.search);
      const ssoToken = params.get('sso_token');
      if (ssoToken) {
        const resp = await fetch(BASE + '/api/auth/sso', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: ssoToken }),
        });
        if (resp.ok) {
          const data = await resp.json();
          setUser(data.user);
          window.history.replaceState({}, '', window.location.pathname);
          return;
        }
        // SSO 失败，fall through 到普通 me() 检测
      }
      const { user } = await api.me();
      setUser(user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const login = async (username: string, password: string) => {
    const { user } = await api.login(username, password);
    setUser(user);
  };

  const logout = async () => {
    await api.logout().catch(() => {});
    setUser(null);
  };

  return <Ctx.Provider value={{ user, loading, refresh, login, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

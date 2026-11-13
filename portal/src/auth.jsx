import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setUnauthorizedHandler } from './api.js';

const AuthContext = createContext(null);
const RANK = { own: 1, team: 2, department: 3, all: 4 };

export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, me: null });
  // Which address the portal is open on: site (www, customers), staff, cms, or all (before the subdomains)
  const [where, setWhere] = useState({ zone: 'all', urls: {} });

  useEffect(() => {
    api('/api/auth/zone').then((z) => setWhere({ zone: z.zone, urls: z.urls || {} })).catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    try {
      const me = await api('/api/v2/me');
      setState({ loading: false, me });
      return me;
    } catch {
      setState({ loading: false, me: null });
      return null;
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setState({ loading: false, me: null }));
    refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } finally {
      try {
        localStorage.removeItem('nibras_user_name');
      } catch {
        // storage may be blocked
      }
      setState({ loading: false, me: null });
    }
  }, []);

  // The interface only hides what the server would refuse anyway; the server checks every request
  const can = useCallback(
    (permission, minScope = 'own') => {
      const scope = state.me && state.me.grants ? state.me.grants[permission] : null;
      return !!scope && RANK[scope] >= RANK[minScope];
    },
    [state.me]
  );

  const value = useMemo(() => ({ ...state, zone: where.zone, urls: where.urls, refresh, signOut, can }), [state, where, refresh, signOut, can]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

import React, { useState, useEffect, useContext, createContext, useCallback } from 'react';
import { motion } from 'motion/react';
import { Mail, Loader2, CheckCircle2, LogOut } from 'lucide-react';

export type AuthUser = {
  email: string;
  role?: string | null;
  user_id?: string | null;
  emailVerificationToken?: string | null;
};

const MAGIC_SEND_URL   = 'https://cookie.vegvisr.org/login/magic/send';
const MAGIC_VERIFY_URL = 'https://cookie.vegvisr.org/login/magic/verify';
const ROLE_URL         = 'https://dashboard.vegvisr.org/get-role';
const TOKEN_URL        = 'https://api.vegvisr.org/get-auth-token';

type AuthCtx = { user: AuthUser | null; login: (email: string) => Promise<void>; logout: () => void };
const AuthContext = createContext<AuthCtx>({ user: null, login: async () => {}, logout: () => {} });
export const useAuth = () => useContext(AuthContext);

const LoginScreen: React.FC = () => {
  const [email, setEmail]     = useState('');
  const [isSent, setIsSent]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setError(''); setLoading(true);
    try { await login(email.trim()); setIsSent(true); }
    catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to send magic link.';
      setError(message);
    }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#fcf8f5]">
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white border border-black/5 rounded-2xl p-8 shadow-2xl shadow-orange-500/5 backdrop-blur-xl"
      >
        <div className="flex justify-center mb-8">
          <img
            src="https://favicons.vegvisr.org/favicons/1775486312807-1-1775486316188-512x512.png"
            alt="Sensus"
            className="w-20 h-20 rounded-full shadow-lg shadow-orange-500/10"
          />
        </div>
        <h1 className="text-3xl font-serif font-light text-gray-900 text-center mb-2">Sensus</h1>
        <p className="text-gray-400 text-center mb-8 text-sm tracking-widest uppercase">Enter your email to sign in</p>

        {isSent ? (
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-6 text-center"
          >
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-4" />
            <h2 className="text-emerald-600 font-semibold mb-2">Magic link sent!</h2>
            <p className="text-emerald-600/70 text-sm">
              Check <span className="font-medium text-emerald-600">{email}</span> and click the link to sign in.
            </p>
            <button onClick={() => { setIsSent(false); setEmail(''); }}
              className="mt-6 text-emerald-600/60 hover:text-emerald-600 text-sm transition-colors">
              Try another email
            </button>
          </motion.div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-300" />
              <input type="email" required value={email} disabled={loading}
                onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com"
                className="w-full bg-black/5 border border-black/10 rounded-xl py-3 pl-12 pr-4 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-orange-500/50 transition-all"
              />
            </div>
            {error && <p className="text-red-600 text-sm bg-red-500/5 border border-red-500/10 rounded-lg p-3">{error}</p>}
            <button type="submit" disabled={loading || !email.trim()}
              className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-40 text-white font-medium py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20">
              {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> Sending...</> : 'Send magic link'}
            </button>
          </form>
        )}
        <p className="mt-8 text-center text-gray-300 text-xs">By signing in, you agree to our Terms of Service and Privacy Policy.</p>
      </motion.div>
    </div>
  );
};

export const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser]         = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);

  const login = useCallback(async (email: string) => {
    const res = await fetch(MAGIC_SEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, redirectUrl: window.location.href }),
    });
    if (!res.ok) throw new Error('Failed to send magic link');
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('user');
    localStorage.removeItem('emailVerificationToken');
    setUser(null);
  }, []);

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const magic = params.get('magic');
      if (magic) {
        try {
          const vRes  = await fetch(`${MAGIC_VERIFY_URL}?token=${encodeURIComponent(magic)}`);
          const vData = await vRes.json();
          if (vData.success && vData.email) {
            const email = vData.email;
            let role = 'user', user_id = email, token: string | null = null;
            try {
              const [roleRes, tokenRes] = await Promise.all([
                fetch(`${ROLE_URL}?email=${encodeURIComponent(email)}`),
                fetch(TOKEN_URL, { headers: { 'X-Email': email } }),
              ]);
              if (roleRes.ok)  { const rd = await roleRes.json(); role    = rd.role || role; }
              if (tokenRes.ok) { const td = await tokenRes.json(); user_id = td.user_id || user_id; token = td.emailVerificationToken || null; }
            } catch { /* use defaults */ }
            const u: AuthUser = { email, role, user_id, emailVerificationToken: token };
            localStorage.setItem('user', JSON.stringify(u));
            if (token) localStorage.setItem('emailVerificationToken', token);
            setUser(u);
            window.history.replaceState({}, '', window.location.pathname);
          }
        } catch { /* ignore bad token */ }
      } else {
        const stored = localStorage.getItem('user');
        if (stored) { try { setUser(JSON.parse(stored)); } catch { localStorage.removeItem('user'); } }
      }
      setChecking(false);
    })();
  }, []);

  if (checking) return (
    <div className="min-h-screen flex items-center justify-center bg-[#fcf8f5]">
      <Loader2 className="w-8 h-8 animate-spin text-orange-500/40" />
    </div>
  );

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {user ? children : <LoginScreen />}
    </AuthContext.Provider>
  );
};

export const UserBadge: React.FC = () => {
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="hidden sm:block text-xs text-gray-400 font-light">{user.email}</span>
      <button onClick={logout} title="Sign out"
        className="p-2 rounded-full text-gray-400 hover:text-gray-900 hover:bg-black/5 transition-colors">
        <LogOut className="w-4 h-4" />
      </button>
    </div>
  );
};

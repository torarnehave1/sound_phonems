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
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#1a0800]">
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white/5 border border-white/10 rounded-2xl p-8 shadow-2xl backdrop-blur-xl"
      >
        <div className="flex justify-center mb-8">
          <img
            src="https://favicons.vegvisr.org/favicons/1772468624359-1-1772468669531-512x512.png"
            alt="Sonic Wisdom"
            className="w-20 h-20 rounded-full shadow-lg shadow-orange-900/40"
          />
        </div>
        <h1 className="text-3xl font-serif font-light text-white text-center mb-2">Sonic Wisdom</h1>
        <p className="text-white/40 text-center mb-8 text-sm tracking-widest uppercase">Enter your email to sign in</p>

        {isSent ? (
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-6 text-center"
          >
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
            <h2 className="text-emerald-400 font-semibold mb-2">Magic link sent!</h2>
            <p className="text-emerald-400/70 text-sm">
              Check <span className="font-medium text-emerald-400">{email}</span> and click the link to sign in.
            </p>
            <button onClick={() => { setIsSent(false); setEmail(''); }}
              className="mt-6 text-emerald-400/60 hover:text-emerald-400 text-sm transition-colors">
              Try another email
            </button>
          </motion.div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
              <input type="email" required value={email} disabled={loading}
                onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com"
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500/50 transition-all"
              />
            </div>
            {error && <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg p-3">{error}</p>}
            <button type="submit" disabled={loading || !email.trim()}
              className="w-full bg-orange-800/80 hover:bg-orange-700 disabled:opacity-40 text-white font-medium py-3 rounded-xl transition-all flex items-center justify-center gap-2">
              {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> Sending...</> : 'Send magic link'}
            </button>
          </form>
        )}
        <p className="mt-8 text-center text-white/20 text-xs">By signing in, you agree to our Terms of Service and Privacy Policy.</p>
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
    <div className="min-h-screen flex items-center justify-center bg-[#1a0800]">
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
      <span className="hidden sm:block text-xs text-white/30 font-light">{user.email}</span>
      <button onClick={logout} title="Sign out"
        className="p-2 rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-colors">
        <LogOut className="w-4 h-4" />
      </button>
    </div>
  );
};

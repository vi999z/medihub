import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Pill, LoaderCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate('/dashboard');
  }, [user, navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Please enter your email and password');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await login(email.trim(), password);
      await new Promise((resolve) => setTimeout(resolve, 350));
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">
      <AnimatePresence mode="wait">
        <motion.div
          key={loading ? 'auth' : 'form'}
          className="auth-card"
          initial={{ opacity: 0, y: 10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={{ duration: 0.24, ease: 'easeOut' }}
        >
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '8px 0' }}>
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
                <LoaderCircle size={28} color="var(--amber)" />
              </motion.div>
              <div style={{ textAlign: 'center' }}>
                <h2 style={{ margin: 0, fontSize: 18 }}>Signing you in…</h2>
                <p style={{ margin: '6px 0 0', color: 'var(--steel)', fontSize: 13 }}>Preparing your workspace.</p>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <div className="icon-badge" style={{ width: 44, height: 44, borderRadius: 13, boxShadow: '0 4px 12px rgba(165,100,23,0.2)' }}>
                  <Pill size={22} />
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 19, letterSpacing: '-0.02em' }}>
                    MEDI<span style={{ color: 'var(--amber)' }}>HUB</span>
                  </div>
                  <div style={{ color: 'var(--steel)', fontSize: 12, marginTop: 2 }}>Pharmacy operations platform</div>
                </div>
              </div>
              <p style={{ color: 'var(--steel)', fontSize: 13.5, margin: '0 0 26px', lineHeight: 1.6 }}>
                Secure access for inventory, procurement, and dispensing workflows.
              </p>
              <form onSubmit={handleSubmit}>
                <div className="field"><label>Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@pharmacy.com" required /></div>
                <div className="field"><label>Password</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required /></div>
                {error && <p className="error-text" style={{ margin: '4px 0 0' }}>{error}</p>}
                <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 8, padding: '11px 16px' }} disabled={loading}>
                  {loading ? 'Signing in…' : 'Log in'}
                </button>
              </form>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Pill, LoaderCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      await new Promise((resolve) => setTimeout(resolve, 450));
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--teal)' }}>
      <AnimatePresence mode="wait">
        <motion.div
          key={loading ? 'auth' : 'form'}
          className="card"
          style={{ width: 380, padding: '36px 32px' }}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Pill size={20} color="var(--amber)" />
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18 }}>
                  MEDI<span style={{ color: 'var(--amber)' }}>HUB</span>
                </span>
              </div>
              <p style={{ color: 'var(--steel)', fontSize: 13, margin: '0 0 24px' }}>Megawide Drug Pharmacy — inventory system</p>
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="field"><label>Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
                <div className="field"><label>Password</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
                {error && <p className="error-text">{error}</p>}
                <button type="submit" className="btn btn-primary" style={{ justifyContent: 'center', marginTop: 6 }} disabled={loading}>Log in</button>
              </form>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
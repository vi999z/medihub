import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { IconTrash, IconHistory, IconClock, IconRefresh, IconAlertTriangle } from '@tabler/icons-react';
import api from '../api/axios';
import { useToast } from '../context/ToastContext';

const ACTIONS = [
  { key: 'transactions', label: 'Clear transaction history', icon: IconHistory, endpoint: '/maintenance/transactions', confirm: 'This will permanently remove all transaction records.' },
  { key: 'logs', label: 'Clear logs and notifications', icon: IconClock, endpoint: '/maintenance/logs', confirm: 'This will permanently remove all audit logs and notifications.' },
  { key: 'expired-batches', label: 'Remove expired medicine', icon: IconTrash, endpoint: '/maintenance/expired-batches', confirm: 'This will permanently delete all expired batches.' },
  { key: 'reset', label: 'Reset pharmacy system', icon: IconRefresh, endpoint: '/maintenance/reset', confirm: 'This will clear expired batches, transactions, logs, and notifications.' },
  { key: 'wipe', label: 'Wipe all data', icon: IconAlertTriangle, endpoint: '/maintenance/wipe', confirm: 'This will permanently delete all medicines, suppliers, batches, transactions, and AI training history.' },
];

export default function Maintenance() {
  const [loading, setLoading] = useState(null);
  const { addToast } = useToast();
  const prefersReducedMotion = useReducedMotion();

  async function runAction(action) {
    if (!window.confirm(`${action.label}\n\n${action.confirm}`)) return;
    setLoading(action.key);
    try {
      const res = await api.delete(action.endpoint);
      // Bust all cached data so every page reflects the post-wipe state immediately
      api.clearAllCache();
      addToast(res.data.message || 'Action completed', 'success');
    } catch (err) {
      addToast(err.response?.data?.error || 'Maintenance action failed', 'error');
    } finally {
      setLoading(null);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.4 }}
    >
      <div className="page-header">
        <div>
          <h1>Maintenance</h1>
          <p>Admin-only cleanup tools for transaction history, logs, expired stock, and system reset.</p>
        </div>
      </div>

      <motion.div 
        className="card" 
        style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', padding: 18 }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.5, delay: prefersReducedMotion ? 0 : 0.1 }}
      >
        {ACTIONS.map((action, index) => (
          <motion.button
            key={action.key}
            className="card maintenance-action"
            type="button"
            onClick={() => runAction(action)}
            disabled={loading !== null}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: 22, gap: 12, textAlign: 'left', minHeight: 180 }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.4, delay: prefersReducedMotion ? 0 : index * 0.08 }}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <action.icon size={20} stroke={1.8} />
              <strong>{action.label}</strong>
            </div>
            <p style={{ margin: 0, color: 'var(--steel)', fontSize: 14 }}>{action.confirm}</p>
            <span className="btn btn-secondary" style={{ alignSelf: 'stretch', justifyContent: 'center' }}>
              {loading === action.key ? 'Working…' : 'Run action'}
            </span>
          </motion.button>
        ))}
      </motion.div>
    </motion.div>
  );
}

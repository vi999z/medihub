import { useState } from 'react';
import { IconTrash, IconHistory, IconClock, IconRefresh } from '@tabler/icons-react';
import api from '../api/axios';
import { useToast } from '../context/ToastContext';

const ACTIONS = [
  { key: 'transactions', label: 'Clear transaction history', icon: IconHistory, endpoint: '/maintenance/transactions', confirm: 'This will permanently remove all transaction records.' },
  { key: 'logs', label: 'Clear logs and notifications', icon: IconClock, endpoint: '/maintenance/logs', confirm: 'This will permanently remove all audit logs and notifications.' },
  { key: 'expired-batches', label: 'Remove expired medicine', icon: IconTrash, endpoint: '/maintenance/expired-batches', confirm: 'This will permanently delete all expired batches.' },
  { key: 'reset', label: 'Reset pharmacy system', icon: IconRefresh, endpoint: '/maintenance/reset', confirm: 'This will clear expired batches, transactions, logs, and notifications.' },
];

export default function Maintenance() {
  const [loading, setLoading] = useState(null);
  const { addToast } = useToast();

  async function runAction(action) {
    if (!window.confirm(`${action.label}\n\n${action.confirm}`)) return;
    setLoading(action.key);
    try {
      const res = await api.delete(action.endpoint);
      addToast(res.data.message || 'Action completed', 'success');
    } catch (err) {
      addToast(err.response?.data?.error || 'Maintenance action failed', 'error');
    } finally {
      setLoading(null);
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Maintenance</h1>
          <p>Admin-only cleanup tools for transaction history, logs, expired stock, and system reset.</p>
        </div>
      </div>

      <div className="card" style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', padding: 18 }}>
        {ACTIONS.map((action) => (
          <button
            key={action.key}
            className="card maintenance-action"
            type="button"
            onClick={() => runAction(action)}
            disabled={loading !== null}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: 22, gap: 12, textAlign: 'left', minHeight: 180 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <action.icon size={20} stroke={1.8} />
              <strong>{action.label}</strong>
            </div>
            <p style={{ margin: 0, color: 'var(--steel)', fontSize: 14 }}>{action.confirm}</p>
            <span className="btn btn-secondary" style={{ alignSelf: 'stretch', justifyContent: 'center' }}>
              {loading === action.key ? 'Working…' : 'Run action'}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

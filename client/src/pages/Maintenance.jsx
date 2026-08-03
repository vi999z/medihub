import { useState } from 'react';
import { IconTrash, IconHistory, IconClock, IconRefresh, IconAlertTriangle } from '@tabler/icons-react';
import api from '../api/axios';
import { useToast } from '../context/ToastContext';

const ACTIONS = [
  { key: 'transactions', label: 'Clear transaction history', icon: IconHistory, endpoint: '/maintenance/transactions', confirm: 'This will permanently remove all transaction records.' },
  { key: 'logs', label: 'Clear logs and notifications', icon: IconClock, endpoint: '/maintenance/logs', confirm: 'This will permanently remove all audit logs and notifications.' },
  { key: 'expired-batches', label: 'Remove expired medicine', icon: IconTrash, endpoint: '/maintenance/expired-batches', confirm: 'This will permanently delete all expired batches.' },
  { key: 'reset', label: 'Reset pharmacy system', icon: IconRefresh, endpoint: '/maintenance/reset', confirm: 'This will clear expired batches, transactions, logs, and notifications.' },
];

const WIPE_ACTION = {
  key: 'wipe',
  label: 'Wipe all records',
  icon: IconAlertTriangle,
  endpoint: '/maintenance/wipe',
  confirm: 'This will permanently delete every medicine, supplier, batch, transaction, notification, and AI training history. User accounts and audit logs are kept.',
  typedConfirmation: 'WIPE',
};

export default function Maintenance() {
  const [loading, setLoading] = useState(null);
  const { addToast } = useToast();

  async function runAction(action) {
    if (!window.confirm(`${action.label}\n\n${action.confirm}`)) return;
    if (action.typedConfirmation) {
      const typed = window.prompt(`This cannot be undone. Type ${action.typedConfirmation} to continue.`);
      if (typed !== action.typedConfirmation) {
        if (typed !== null) addToast(`Wipe cancelled — you must type ${action.typedConfirmation} exactly.`, 'error');
        return;
      }
    }
    setLoading(action.key);
    try {
      const res = await api.delete(action.endpoint, action.typedConfirmation ? { data: { confirm: action.typedConfirmation } } : undefined);
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
          <p>Admin-only cleanup tools for transaction history, logs, expired stock, system reset, and a full data wipe.</p>
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

      <div className="card" style={{ marginTop: 18, padding: 22, border: '1px solid var(--red)', background: 'var(--red-tint)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--red)' }}>
          <WIPE_ACTION.icon size={20} stroke={1.8} />
          <strong>Danger zone</strong>
        </div>
        <p style={{ margin: '10px 0 16px', color: 'var(--steel)', fontSize: 14 }}>{WIPE_ACTION.confirm}</p>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => runAction(WIPE_ACTION)}
          disabled={loading !== null}
        >
          {loading === WIPE_ACTION.key ? 'Wiping…' : WIPE_ACTION.label}
        </button>
      </div>
    </>
  );
}

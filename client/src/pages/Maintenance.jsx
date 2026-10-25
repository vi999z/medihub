import { useState } from 'react';
import { IconTrash, IconHistory, IconClock, IconRefresh, IconAlertTriangle } from '@tabler/icons-react';
import api from '../api/axios';
import { useToast } from '../context/ToastContext';
import { useDialog } from '../context/DialogContext';

// `tone` grades how much each action destroys: amber clears history/expired
// stock, red resets or wipes live data.
const ACTIONS = [
  { key: 'transactions', label: 'Clear transaction history', icon: IconHistory, tone: 'amber', endpoint: '/maintenance/transactions', confirm: 'This will permanently remove all transaction records.' },
  { key: 'logs', label: 'Clear logs and notifications', icon: IconClock, tone: 'amber', endpoint: '/maintenance/logs', confirm: 'This will permanently remove all audit logs and notifications.' },
  { key: 'expired-batches', label: 'Remove expired medicine', icon: IconTrash, tone: 'amber', endpoint: '/maintenance/expired-batches', confirm: 'This will permanently delete all expired batches.' },
  { key: 'reset', label: 'Reset pharmacy system', icon: IconRefresh, tone: 'red', endpoint: '/maintenance/reset', confirm: 'This will clear expired batches, transactions, logs, and notifications.' },
  { key: 'wipe', label: 'Wipe all data', icon: IconAlertTriangle, tone: 'red', endpoint: '/maintenance/wipe', confirm: 'This will permanently delete all medicines, suppliers, batches, transactions, and AI training history.' },
];

export default function Maintenance() {
  const [loading, setLoading] = useState(null);
  const { addToast } = useToast();
  const { confirm } = useDialog();

  async function runAction(action) {
    if (!(await confirm({ title: action.label, message: action.confirm, confirmLabel: action.label, danger: true }))) return;
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
    <div className="flat-dashboard">
      <div className="flat-card">
        <div className="flat-table-header">
          <span className="flat-table-title">Maintenance actions</span>
          <span className="flat-med-meta">These cannot be undone</span>
        </div>
        <div style={{ padding: 16 }}>
          <div className="flat-card-grid">
            {ACTIONS.map((action) => (
              <div key={action.key} className={`flat-card flat-item-card flat-item-card--${action.tone}`} style={{ cursor: 'default' }}>
                <div className="flat-item-card__top">
                  <div className="flat-item-icon"><action.icon size={22} stroke={1.8} /></div>
                  <span className={`flat-status-label ${action.tone}`}>{action.tone === 'red' ? 'Destructive' : 'Cleanup'}</span>
                </div>
                <div className="flat-med-name">{action.label}</div>
                <div className="flat-med-meta" style={{ flex: 1 }}>{action.confirm}</div>
                <div className="flat-item-card__actions">
                  <button
                    type="button"
                    className={action.tone === 'red' ? 'flat-btn-danger' : 'flat-action-btn'}
                    style={{ flex: 1, justifyContent: 'center' }}
                    onClick={() => runAction(action)}
                    disabled={loading !== null}
                  >
                    {loading === action.key ? 'Working…' : 'Run action'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

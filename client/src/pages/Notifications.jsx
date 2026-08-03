import { useEffect, useMemo, useState } from 'react';
import { CheckCheck, RefreshCw, BellRing, Search, X } from 'lucide-react';
import api from '../api/axios';
import { useToast } from '../context/ToastContext';

const UNREAD_URL = '/notifications?unread=true';

function severityPill(sev) {
  if (sev === 'critical') return 'critical';
  if (sev === 'warning') return 'warning';
  return 'safe';
}

export default function Notifications() {
  const { addToast } = useToast();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);

  async function fetchAll() {
    try {
      const res = await api.cachedGet('/notifications');
      setNotifications(res.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchAll(); }, []);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const visibleNotifications = useMemo(() => {
    const term = search.trim().toLowerCase();
    return notifications.filter((n) => {
      if (unreadOnly && n.is_read) return false;
      if (!term) return true;
      return [n.message, n.type, n.severity].some((value) => String(value || '').toLowerCase().includes(term));
    });
  }, [notifications, search, unreadOnly]);

  function refreshCaches() {
    api.invalidateCache('/notifications');
    api.invalidateCache(UNREAD_URL);
  }

  async function markRead(id) {
    try {
      await api.patch(`/notifications/${id}/read`);
      refreshCaches();
      await fetchAll();
    } catch (err) {
      addToast(err.response?.data?.error || 'Could not mark alert as read', 'error');
    }
  }

  async function markAllRead() {
    try {
      await api.patch('/notifications/read-all');
      refreshCaches();
      await fetchAll();
      addToast('All alerts marked as read', 'success');
    } catch (err) {
      addToast(err.response?.data?.error || 'Could not mark alerts as read', 'error');
    }
  }

  async function handleRefresh() {
    refreshCaches();
    await fetchAll();
    addToast('Alerts refreshed', 'success');
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Alerts</h1>
          <p>{loading ? 'Loading alerts…' : `${unreadCount} unread of ${notifications.length}`}</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={handleRefresh}>
            <RefreshCw size={15} /> Refresh
          </button>
          <button className="btn btn-secondary" onClick={markAllRead} disabled={unreadCount === 0}>
            <CheckCheck size={15} /> Mark all read
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div className="filter-bar">
          <div className="filter-search">
            <Search size={15} className="filter-search-icon" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search alert message or type…"
              aria-label="Search alerts"
            />
            {search && (
              <button type="button" className="btn-icon filter-search-clear" onClick={() => setSearch('')} title="Clear search">
                <X size={14} />
              </button>
            )}
          </div>
          <label className="filter-toggle">
            <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
            Unread only
          </label>
        </div>

        {!loading && visibleNotifications.length === 0 && (
          <div className="empty-state" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <BellRing size={16} /> {notifications.length === 0 ? 'No alerts yet.' : 'No alerts match the current filters.'}
          </div>
        )}

        {visibleNotifications.map((n) => (
          <div
            key={n.id}
            onClick={() => !n.is_read && markRead(n.id)}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '14px 4px', borderBottom: '1px solid var(--border)',
              opacity: n.is_read ? 0.55 : 1, cursor: n.is_read ? 'default' : 'pointer'
            }}
          >
            <div>
              <span className={`status-pill ${severityPill(n.severity)}`} style={{ marginRight: 10 }}>
                {n.type.replace(/_/g, ' ')}
              </span>
              <span style={{ fontSize: 13.5 }}>{n.message}</span>
            </div>
            <span className="stamp">{new Date(n.created_at).toLocaleDateString()}</span>
          </div>
        ))}
      </div>
    </>
  );
}

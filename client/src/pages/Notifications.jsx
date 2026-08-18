import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { CheckCheck, RefreshCw, BellRing, Search, X } from 'lucide-react';
import api from '../api/axios';
import { useToast } from '../context/ToastContext';
import StaggeredList from '../components/StaggeredList';
import Skeleton from '../components/Skeleton';

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
  const [error, setError] = useState('');
  const prefersReducedMotion = useReducedMotion();

  async function fetchAll() {
    try {
      const res = await api.cachedGet('/notifications');
      setNotifications(res.data);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load alerts');
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
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.4 }}
    >
      <div className="page-header">
        <div>
          <h1>Alerts</h1>
          <p>{loading ? 'Loading alerts…' : `${unreadCount} unread of ${notifications.length}`}</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={handleRefresh}>
            <RefreshCw size={15} /> Refresh
          </button>
          <button className="btn btn-secondary" onClick={markAllRead} disabled={unreadCount === 0}>
            <CheckCheck size={15} /> Mark all read
          </button>
        </div>
      </div>

      <motion.div 
        className="card table-card" 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.5, delay: prefersReducedMotion ? 0 : 0.1 }}
      >
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

        {error && (
          <div className="empty-state">
            <strong>Unable to load alerts</strong>
            <p style={{ margin: '6px 0 0' }}>{error}</p>
            <button className="btn btn-secondary" style={{ marginTop: 10 }} onClick={fetchAll}>Retry</button>
          </div>
        )}

        {!loading && !error && visibleNotifications.length === 0 && (
          <div className="table-wrapper">
            <table className="data-table notification-table">
              <thead><tr><th>Severity</th><th>Message</th><th>Type</th><th>Created</th><th>Action</th></tr></thead>
              <tbody>
                <tr className="empty-row">
                  <td colSpan={5}>
                    <div className="empty-state compact-empty-state">
                      <BellRing size={16} /> {notifications.length === 0 ? 'No alerts yet.' : 'No alerts match the current filters.'}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {loading && (
          <div className="table-wrapper">
            <table className="data-table notification-table">
              <thead><tr><th>Severity</th><th>Message</th><th>Type</th><th>Created</th><th>Action</th></tr></thead>
              <tbody>
                {[1, 2, 3, 4].map((i) => (
                  <tr key={i}>
                    <td><Skeleton height={16} /></td>
                    <td><Skeleton height={16} /></td>
                    <td><Skeleton height={16} /></td>
                    <td><Skeleton height={16} /></td>
                    <td><Skeleton height={16} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && (
          <div className="table-wrapper">
            <table className="data-table notification-table">
              <thead><tr><th>Severity</th><th>Message</th><th>Type</th><th>Created</th><th>Action</th></tr></thead>
              <StaggeredList staggerDelay={0.03}>
                <tbody>
                  {visibleNotifications.map((n) => (
                    <tr key={n.id} style={{ opacity: n.is_read ? 0.6 : 1 }}>
                      <td><span className={`status-pill ${severityPill(n.severity)}`}>{n.severity}</span></td>
                      <td className="message-cell">{n.message}</td>
                      <td style={{ textTransform: 'capitalize' }}>{n.type}</td>
                      <td>{new Date(n.created_at).toLocaleString()}</td>
                      <td className="actions-cell">
                        {!n.is_read && (
                          <button className="btn-icon" onClick={() => markRead(n.id)} title="Mark as read">
                            <CheckCheck size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </StaggeredList>
            </table>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

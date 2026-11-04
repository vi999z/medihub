import { useEffect, useMemo, useState } from 'react';
import { CheckCheck, RefreshCw, Search, X, AlertTriangle, Info, Download } from 'lucide-react';
import api from '../api/axios';
import { useToast } from '../context/ToastContext';
import ReportExportModal from '../components/ReportExportModal';
import { NOTIFICATIONS_CHANGED_EVENT } from '../utils/events';
import PageHeader from '../components/PageHeader';
import { errorMessage } from '../utils/errors';

const UNREAD_URL = '/notifications?unread=true';

// Maps alert severity onto the flat design system's palette.
function severityConfig(sev) {
  if (sev === 'critical') return { cls: 'red', Icon: AlertTriangle, label: 'Critical' };
  if (sev === 'warning') return { cls: 'amber', Icon: AlertTriangle, label: 'Warning' };
  return { cls: 'green', Icon: Info, label: 'Info' };
}

function typeLabel(type) {
  return (type || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function Notifications() {
  const { addToast } = useToast();
  const [showExport, setShowExport] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [severity, setSeverity] = useState('all');
  const [type, setType] = useState('all');
  const [error, setError] = useState('');

  async function fetchAll() {
    try {
      const res = await api.cachedGet('/notifications');
      setNotifications(res.data || []);
      setError('');
    } catch (err) {
      setError(errorMessage(err, 'Failed to load alerts'));
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
      if (severity !== 'all' && n.severity !== severity) return false;
      if (type !== 'all' && n.type !== type) return false;
      if (!term) return true;
      return [n.message, n.type, n.severity].some((value) => String(value || '').toLowerCase().includes(term));
    });
  }, [notifications, search, unreadOnly, severity, type]);
  const types = useMemo(() => [...new Set(notifications.map((n) => n.type).filter(Boolean))].sort(), [notifications]);

  const filtersActive = Boolean(search) || unreadOnly || severity !== 'all' || type !== 'all';

  function clearFilters() {
    setSearch('');
    setUnreadOnly(false);
    setSeverity('all');
    setType('all');
  }

  function refreshCaches() {
    api.invalidateCache('/notifications');
    api.invalidateCache(UNREAD_URL);
    // Keeps the topbar bell's unread dot in sync without a page change.
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
  }

  async function markRead(id) {
    try {
      await api.patch(`/notifications/${id}/read`);
      refreshCaches();
      await fetchAll();
    } catch (err) {
      addToast(errorMessage(err, 'Could not mark alert as read'), 'error');
    }
  }

  async function markAllRead() {
    try {
      await api.patch('/notifications/read-all');
      refreshCaches();
      await fetchAll();
      addToast('All alerts marked as read', 'success');
    } catch (err) {
      addToast(errorMessage(err, 'Could not mark alerts as read'), 'error');
    }
  }

  async function handleRefresh() {
    refreshCaches();
    await fetchAll();
    addToast('Alerts refreshed', 'success');
  }

  return (
    <div className="flat-dashboard">
      <PageHeader title="Alerts" description="Warnings about low stock, medicines close to expiry and expired batches. Red needs action first." legend />
      <div className="page-actions-only">
        <div className="page-header-actions">
          <button type="button" className="flat-action-btn" onClick={() => setShowExport(true)}>
            <Download size={15} /> Export
          </button>
          <button type="button" className="flat-action-btn" onClick={handleRefresh}>
            <RefreshCw size={15} /> Refresh
          </button>
          <button type="button" className="flat-btn-primary" onClick={markAllRead} disabled={unreadCount === 0}>
            <CheckCheck size={15} /> Mark all read
          </button>
        </div>
      </div>

      <div className="flat-card" style={{ padding: 16 }}>
        <div className="filter-bar" style={{ margin: 0, background: 'none', border: 'none', padding: 0 }}>
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
          <div className="field filter-select">
            <select value={severity} onChange={(e) => setSeverity(e.target.value)} aria-label="Filter by severity">
              <option value="all">All severities</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
          </div>
          <div className="field filter-select">
            <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by type">
              <option value="all">All types</option>
              {types.map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}
            </select>
          </div>
          <label className="filter-toggle">
            <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
            Unread only
          </label>
          {filtersActive && (
            <button type="button" className="flat-action-btn" onClick={clearFilters}>
              <X size={15} /> Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="flat-card">
        <div className="flat-table-header">
          <span className="flat-table-title">Alerts</span>
          {!loading && !error && <span className="flat-med-meta">{unreadCount} unread</span>}
        </div>
        <div style={{ padding: 16 }}>
          {error && (
            <div className="flat-empty">
              Unable to load alerts — {error}
              <div style={{ marginTop: 10 }}>
                <button type="button" className="flat-action-btn" onClick={fetchAll}>Retry</button>
              </div>
            </div>
          )}

          {!error && loading && (
            <div className="flat-card-grid">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="flat-card flat-item-card">
                  <div className="flat-item-icon skeleton" style={{ border: 'none' }} />
                  <div className="skeleton" style={{ height: 16, width: '70%', margin: '4px 0' }} />
                  <div className="skeleton" style={{ height: 12, width: '50%' }} />
                </div>
              ))}
            </div>
          )}

          {!error && !loading && visibleNotifications.length === 0 && (
            <div className="flat-empty">{notifications.length === 0 ? 'No alerts yet.' : 'No alerts match the current filters.'}</div>
          )}

          {!error && !loading && visibleNotifications.length > 0 && (
            <div className="flat-card-grid">
              {visibleNotifications.map((n) => {
                const cfg = severityConfig(n.severity);
                const SevIcon = cfg.Icon;
                return (
                  <div key={n.id} className={`flat-card flat-item-card flat-item-card--${cfg.cls}`} style={{ cursor: 'default' }}>
                    <div className="flat-item-card__top">
                      <div className="flat-item-icon"><SevIcon size={20} /></div>
                      <span className={`flat-status-label ${cfg.cls}`}>{cfg.label}</span>
                    </div>
                    <div className="flat-med-name">{n.message}</div>
                    <span className="flat-tag">{typeLabel(n.type)}</span>
                    <div className="flat-item-row">
                      <span>Date</span>
                      <strong>{new Date(n.created_at).toLocaleDateString()}</strong>
                    </div>
                    <div className="flat-item-row">
                      <span>Status</span>
                      <strong>{n.is_read ? 'Read' : 'Unread'}</strong>
                    </div>
                    {!n.is_read && (
                      <div className="flat-item-card__actions">
                        <button type="button" className="flat-action-btn" onClick={() => markRead(n.id)}>
                          <CheckCheck size={13} /> Mark as read
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <ReportExportModal
        isOpen={showExport}
        onClose={() => setShowExport(false)}
        defaultReport="notifications"

      />
    </div>
  );
}

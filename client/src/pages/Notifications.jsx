import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { CheckCheck, RefreshCw, BellRing, Search, X, AlertTriangle, Info, Bell, Download, ChevronDown } from 'lucide-react';
import api from '../api/axios';
import { useToast } from '../context/ToastContext';
import StaggeredList from '../components/StaggeredList';
import Skeleton from '../components/Skeleton';

// ── Alerts export dropdown ────────────────────────────────────────────────────
function AlertsExportDropdown({ onExport }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    function onClickOutside(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const OPTIONS = [
    { label: 'All alerts (Excel)', severity: null, format: 'excel' },
    { label: 'Critical only (Excel)', severity: 'critical', format: 'excel' },
    { label: 'Warnings only (Excel)', severity: 'warning', format: 'excel' },
    null,
    { label: 'All alerts (PDF)', severity: null, format: 'pdf' },
    { label: 'Critical alerts (PDF)', severity: 'critical', format: 'pdf' },
    { label: 'All alerts (Word)', severity: null, format: 'docx' },
  ];

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="btn btn-secondary" onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Download size={15} /> Export <ChevronDown size={13} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: 220,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 12, boxShadow: 'var(--shadow-xl)', zIndex: 50, padding: '6px 0'
        }}>
          {OPTIONS.map((opt, idx) => opt === null ? (
            <hr key={idx} style={{ margin: '4px 0', border: 'none', borderTop: '1px solid var(--border)' }} />
          ) : (
            <button
              key={idx}
              onClick={() => { onExport(opt.severity, opt.format); setOpen(false); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink)', transition: 'background 0.12s ease' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-subtle)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >{opt.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

const UNREAD_URL = '/notifications?unread=true';

function severityConfig(sev) {
  if (sev === 'critical') return { cls: 'critical', icon: AlertTriangle, borderColor: 'var(--red)' };
  if (sev === 'warning')  return { cls: 'warning',  icon: AlertTriangle, borderColor: 'var(--gold)' };
  return                         { cls: 'safe',     icon: Info,          borderColor: 'var(--green)' };
}

function typeLabel(type) {
  return (type || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
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

  const filtersActive = Boolean(search) || unreadOnly;

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
    setLoading(true);
    refreshCaches();
    await fetchAll();
    addToast('Alerts refreshed', 'success');
  }

  async function handleExport(severity, format) {
    try {
      const params = new URLSearchParams({ format });
      if (severity) params.set('severity', severity);
      const res = await api.get(`/reports/export/notifications?${params}`, { responseType: 'blob' });
      const ext = format === 'pdf' ? 'pdf' : format === 'docx' ? 'docx' : 'xlsx';
      const blob = new Blob([res.data], { type: res.headers['content-type'] || 'application/octet-stream' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `alerts${severity ? `_${severity}` : ''}_${new Date().toISOString().slice(0, 10)}.${ext}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      addToast('Alerts exported', 'success');
    } catch (err) {
      addToast('Export failed', 'error');
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
          <h1>Alerts</h1>
          <p>{loading ? 'Loading alerts…' : `${unreadCount} unread of ${notifications.length}`}</p>
        </div>
        <div className="page-header-actions">
          <AlertsExportDropdown onExport={handleExport} />
          <button className="btn btn-secondary" onClick={handleRefresh}>
            <RefreshCw size={15} /> Refresh
          </button>
          <button className="btn btn-secondary" onClick={markAllRead} disabled={unreadCount === 0}>
            <CheckCheck size={15} /> Mark all read
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ padding: '16px', background: 'var(--surface-strong)', borderRadius: 'var(--radius)', marginBottom: 4 }}>
        <div className="filter-bar" style={{ margin: 0 }}>
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
          {filtersActive && (
            <button type="button" className="btn btn-secondary" onClick={() => { setSearch(''); setUnreadOnly(false); }}>
              <X size={15} /> Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="empty-state">
          <strong>Unable to load alerts</strong>
          <p style={{ margin: '6px 0 0' }}>{error}</p>
          <button className="btn btn-secondary" style={{ marginTop: 10 }} onClick={fetchAll}>Retry</button>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && visibleNotifications.length === 0 && (
        <div className="empty-state">
          <BellRing size={24} style={{ marginBottom: 6 }} />
          <strong>No alerts found</strong>
          <p style={{ margin: '6px 0 0' }}>
            {notifications.length === 0 ? 'No alerts yet.' : 'No alerts match the current filters.'}
          </p>
          {filtersActive && (
            <button type="button" className="btn btn-secondary" style={{ marginTop: 10 }} onClick={() => { setSearch(''); setUnreadOnly(false); }}>
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="card" style={{ height: '200px', padding: '16px' }}>
              <Skeleton height={14} style={{ marginBottom: '12px', width: '40%' }} />
              <Skeleton height={14} style={{ marginBottom: '8px' }} />
              <Skeleton height={14} style={{ marginBottom: '8px', width: '80%' }} />
              <Skeleton height={14} style={{ marginBottom: '16px', width: '60%' }} />
              <Skeleton height={28} style={{ borderRadius: '999px', width: '50%' }} />
            </div>
          ))}
        </div>
      )}

      {/* Cards grid */}
      {!loading && !error && visibleNotifications.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.3 }}
        >
          <StaggeredList
            staggerDelay={0.03}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}
          >
            {visibleNotifications.map((n) => {
              const cfg = severityConfig(n.severity);
              const SevIcon = cfg.icon;
              return (
                <motion.div
                  key={n.id}
                  className="card"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '16px',
                    borderTop: `4px solid ${cfg.borderColor}`,
                    opacity: n.is_read ? 0.65 : 1,
                    transition: 'all 0.2s ease',
                  }}
                  whileHover={{ y: -4, boxShadow: 'var(--shadow-md)' }}
                >
                  {/* Top row: severity pill + type */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span className={`status-pill ${cfg.cls}`} style={{ fontSize: '10px', padding: '3px 8px' }}>
                      {n.severity}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--steel)', fontWeight: 600 }}>{typeLabel(n.type)}</span>
                  </div>

                  {/* Message */}
                  <div style={{ flex: 1, marginBottom: '12px' }}>
                    <p style={{ margin: 0, fontSize: '13px', color: 'var(--ink)', lineHeight: 1.5, wordBreak: 'break-word' }}>
                      {n.message}
                    </p>
                  </div>

                  {/* Bottom row: date + icon + action */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        width: '32px', height: '32px', borderRadius: '50%',
                        background: cfg.borderColor, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', flexShrink: 0,
                      }}>
                        <SevIcon size={14} color="#fff" />
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--steel)' }}>
                        {new Date(n.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                    {!n.is_read && (
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '4px 12px', fontSize: '12px', gap: 4 }}
                        onClick={() => markRead(n.id)}
                        title="Mark as read"
                      >
                        <CheckCheck size={12} /> Read
                      </button>
                    )}
                    {n.is_read && (
                      <span style={{ fontSize: '11px', color: 'var(--steel)', fontStyle: 'italic' }}>Read</span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </StaggeredList>
        </motion.div>
      )}
    </motion.div>
  );
}

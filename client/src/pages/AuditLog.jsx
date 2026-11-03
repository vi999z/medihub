import { useEffect, useMemo, useState } from 'react';
import { Search, X, RefreshCw, FileText } from 'lucide-react';
import api from '../api/axios';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/PageHeader';
import { errorMessage } from '../utils/errors';

// Maps the action verb (first word of e.g. "create_medicine") onto the flat
// design system's palette; anything unlisted gets the neutral card.
const PAGE_SIZE = 100;
const ACTION_FLAT_CLS = { create: 'green', login: 'green', update: 'amber', export: 'amber', delete: 'red', ai: 'accent' };

function actionLabel(action = '') {
  return action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AuditLog() {
  const { addToast } = useToast();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);

  async function fetchAll() {
    try {
      const res = await api.get(`/audit-logs?limit=${limit}`);
      setLogs(res.data || []);
      setError('');
    } catch (err) {
      setError(errorMessage(err, 'Failed to load audit logs'));
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchAll(); }, [limit]);

  async function handleRefresh() {
    await fetchAll();
    addToast('Audit log refreshed', 'success');
  }

  const visibleLogs = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return logs;
    return logs.filter((l) => [l.user_name, l.action, l.details].some((value) => String(value || '').toLowerCase().includes(term)));
  }, [logs, search]);

  return (
    <div className="flat-dashboard">
      <PageHeader title="Audit Log" description="A permanent record of who did what, and when. Entries cannot be deleted." />
      <div className="page-actions-only">
        <div className="page-header-actions">
          <button type="button" className="flat-action-btn" onClick={handleRefresh}>
            <RefreshCw size={15} /> Refresh
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
              placeholder="Search user, action, details…"
              aria-label="Search audit log"
            />
            {search && (
              <button type="button" className="btn-icon filter-search-clear" onClick={() => setSearch('')} title="Clear search">
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flat-card">
        <div className="flat-table-header">
          <span className="flat-table-title">Activity</span>
        </div>
        <div style={{ padding: 16 }}>
          {error && (
            <div className="flat-empty">
              Unable to load audit logs — {error}
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

          {!error && !loading && visibleLogs.length === 0 && (
            <div className="flat-empty">{logs.length === 0 ? 'No activity recorded yet.' : `No entries match "${search}".`}</div>
          )}

          {!error && !loading && visibleLogs.length > 0 && (
            <div className="flat-card-grid">
              {visibleLogs.map((l) => {
                const tone = ACTION_FLAT_CLS[String(l.action || '').split('_')[0].toLowerCase()];
                const created = new Date(l.created_at);
                return (
                  <div key={l.id} className={`flat-card flat-item-card${tone ? ` flat-item-card--${tone}` : ''}`} style={{ cursor: 'default' }}>
                    <div className="flat-item-card__top">
                      <div className="flat-item-icon"><FileText size={20} /></div>
                      <span className="flat-tag" style={{ margin: 0 }}>
                        {created.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="flat-med-name">{actionLabel(l.action)}</div>
                    {l.details && <div className="flat-med-meta">{l.details}</div>}
                    <div className="flat-item-row">
                      <span>User</span>
                      <strong>{l.user_name || 'System'}</strong>
                    </div>
                    <div className="flat-item-row">
                      <span>Date</span>
                      <strong>{created.toLocaleDateString()}</strong>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {!error && !loading && logs.length >= limit && limit < 2000 && (
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button type="button" className="flat-action-btn" onClick={() => setLimit((n) => n + PAGE_SIZE)}>Load more</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

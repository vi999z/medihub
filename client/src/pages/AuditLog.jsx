import { useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import api from '../api/axios';
import Skeleton from '../components/Skeleton';

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    api.get('/audit-logs').then((res) => {
      if (mounted) {
        setLogs(res.data || []);
        setError('');
      }
    }).catch((err) => {
      if (mounted) setError(err.response?.data?.error || 'Failed to load audit logs');
    }).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; };
  }, []);

  const visibleLogs = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return logs;
    return logs.filter((l) => [l.user_name, l.action, l.details].some((value) => String(value || '').toLowerCase().includes(term)));
  }, [logs, search]);

  return (
    <div>
      <div style={{ padding: '16px', background: 'var(--surface-strong)', borderRadius: 'var(--radius)' }}>
        <div className="filter-bar" style={{ margin: 0 }}>
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

      {error && (
        <div className="empty-state">
          <strong>Unable to load audit logs</strong>
          <p style={{ margin: '6px 0 0' }}>{error}</p>
          <button className="btn btn-secondary" style={{ marginTop: 10 }} onClick={() => window.location.reload()}>Retry</button>
        </div>
      )}

      {!loading && !error && visibleLogs.length === 0 && (
        <div className="empty-state">
          <strong>No activity found</strong>
          <p style={{ margin: '6px 0 0' }}>{logs.length === 0 ? 'No activity recorded yet.' : `No entries match "${search}".`}</p>
        </div>
      )}

      {loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="card" style={{ height: '220px' }}>
              <Skeleton height={16} style={{ marginBottom: '12px' }} />
              <Skeleton height={16} style={{ marginBottom: '8px' }} />
              <Skeleton height={16} style={{ marginBottom: '16px' }} />
              <Skeleton height={16} style={{ marginBottom: '12px' }} />
            </div>
          ))}
        </div>
      )}

      {!loading && !error && visibleLogs.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
            {visibleLogs.map((l) => {
              const actionColorMap = { 'create': 'var(--green)', 'update': 'var(--amber)', 'delete': 'var(--red)', 'login': 'var(--green)', 'logout': 'var(--steel)', 'export': 'var(--gold)', 'ai': 'var(--info)' };
              const actionKey = l.action.split('_')[0].toLowerCase();
              const actionToneMap = { create: 'safe', update: 'warning', delete: 'critical', login: 'safe', logout: 'neutral', export: 'warning', ai: 'info' };
              const actionTone = actionToneMap[actionKey] || 'neutral';
              return (
                <div
                  key={l.id}
                  className={`card audit-card audit-card--${actionTone}`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '16px',
                    cursor: 'pointer'
                  }}
                >
                  {/* Top Row: Time & Action */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span className="stamp" style={{ fontSize: '11px' }}>{new Date(l.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: actionColorMap[actionKey] || 'var(--steel)', textTransform: 'capitalize' }}>
                      {l.action.replace(/_/g, ' ')}
                    </span>
                  </div>

                  {/* Middle Content */}
                  <div style={{ flex: 1, marginBottom: '12px' }}>
                    <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--ink)', marginBottom: '4px', lineHeight: 1.3 }}>
                      {l.action.replace(/_/g, ' ').toUpperCase()}
                    </div>
                    {l.details && (
                      <div style={{ fontSize: '12px', color: 'var(--steel)', marginBottom: '4px', lineHeight: 1.4, maxHeight: '60px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {l.details}
                      </div>
                    )}
                    <div style={{ fontSize: '11px', color: 'var(--steel)', marginTop: '8px' }}>
                      <span className="stamp" style={{ fontSize: '10px' }}>{new Date(l.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* Bottom Row: Avatar + User */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '12px', fontWeight: 700, flexShrink: 0 }}>
                      {(l.user_name || 'S').charAt(0).toUpperCase()}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--ink-soft)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {l.user_name || 'System'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Search, X } from 'lucide-react';
import api from '../api/axios';
import StaggeredList from '../components/StaggeredList';
import Skeleton from '../components/Skeleton';

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const prefersReducedMotion = useReducedMotion();

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
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.4 }}
    >
      <div className="page-header">
        <div>
          <h1>Audit Log</h1>
          <p>{loading ? 'Loading activity…' : `${visibleLogs.length} of the ${logs.length} most recent system actions`}</p>
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

        {error && (
          <div className="empty-state">
            <strong>Unable to load audit logs</strong>
            <p style={{ margin: '6px 0 0' }}>{error}</p>
            <button className="btn btn-secondary" style={{ marginTop: 10 }} onClick={() => window.location.reload()}>Retry</button>
          </div>
        )}

        {!loading && !error && visibleLogs.length === 0 && (
          <div className="empty-state">{logs.length === 0 ? 'No activity recorded yet.' : `No entries match "${search}".`}</div>
        )}

        {loading && (
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Details</th></tr></thead>
              <tbody>
                {[1, 2, 3, 4].map((i) => (
                  <tr key={i}>
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
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Details</th></tr></thead>
              <StaggeredList staggerDelay={0.03}>
                <tbody>
                  {visibleLogs.map((l) => (
                    <tr key={l.id}>
                      <td><span className="stamp">{new Date(l.created_at).toLocaleString()}</span></td>
                      <td>{l.user_name || 'System'}</td>
                      <td style={{ textTransform: 'capitalize' }}>{l.action.replace(/_/g, ' ')}</td>
                      <td style={{ color: 'var(--steel)' }}>{l.details}</td>
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

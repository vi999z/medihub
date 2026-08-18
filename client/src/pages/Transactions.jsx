import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Plus, Search, X } from 'lucide-react';
import api from '../api/axios';
import { useToast } from '../context/ToastContext';
import StaggeredList from '../components/StaggeredList';
import Skeleton from '../components/Skeleton';

const TYPES = ['sale', 'adjustment', 'disposal', 'return'];
const TYPE_FILTERS = [{ value: 'all', label: 'All types' }, ...TYPES.map((type) => ({ value: type, label: type[0].toUpperCase() + type.slice(1) }))];

export default function Transactions() {
  const { addToast } = useToast();
  const [transactions, setTransactions] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ batch_id: '', transaction_type: 'sale', quantity: '', reason: '' });
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const prefersReducedMotion = useReducedMotion();

  async function fetchAll() {
    try {
      const [t, b] = await Promise.all([api.cachedGet('/transactions/recent'), api.cachedGet('/batches')]);
      setTransactions(t.data || []);
      setBatches((b.data || []).filter((batch) => batch.status === 'active'));
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load transactions');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchAll(); }, []);

  const visibleTransactions = useMemo(() => {
    const term = search.trim().toLowerCase();
    return transactions.filter((t) => {
      if (typeFilter !== 'all' && t.transaction_type !== typeFilter) return false;
      if (!term) return true;
      return [t.medicine_name, t.batch_number, t.user_name, t.reason]
        .some((value) => String(value || '').toLowerCase().includes(term));
    });
  }, [transactions, search, typeFilter]);

  const filtersActive = Boolean(search) || typeFilter !== 'all';

  function clearFilters() {
    setSearch('');
    setTypeFilter('all');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/transactions', form);
      api.invalidateCache('/transactions/recent');
      api.invalidateCache('/batches');
      setForm({ batch_id: '', transaction_type: 'sale', quantity: '', reason: '' });
      setShowForm(false);
      await fetchAll();
      addToast('Transaction recorded', 'success');
    } catch (err) {
      setError(err.response?.data?.error || 'Transaction failed');
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
          <h1>Transactions</h1>
          <p>{loading ? 'Loading movements…' : `${visibleTransactions.length} of ${transactions.length} movements shown`}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          <Plus size={15} /> {showForm ? 'Close form' : 'Record transaction'}
        </button>
      </div>

      {showForm && (
        <motion.form 
          onSubmit={handleSubmit} 
          className="card" 
          style={{ padding: 20, marginBottom: 20, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.3 }}
        >
          <div className="field">
            <label>Batch</label>
            <select value={form.batch_id} onChange={(e) => setForm({ ...form, batch_id: e.target.value })} required>
              <option value="">Select a batch</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>{b.medicine_name} — {b.batch_number} ({b.quantity_remaining} left)</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Type</label>
            <select value={form.transaction_type} onChange={(e) => setForm({ ...form, transaction_type: e.target.value })}>
              {TYPES.map((t) => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
            </select>
          </div>
          <div className="field"><label>Quantity</label><input type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required /></div>
          <div className="field"><label>Reason (optional)</label><input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10 }}>
            <button type="submit" className="btn btn-primary">Save transaction</button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
          {error && <p className="error-text" style={{ gridColumn: '1 / -1' }}>{error}</p>}
        </motion.form>
      )}

      <div style={{ padding: '16px', background: 'var(--surface-strong)', borderRadius: 'var(--radius)' }}>
        <div className="filter-bar" style={{ margin: 0 }}>
          <div className="filter-search">
            <Search size={15} className="filter-search-icon" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search medicine, batch, user, reason…"
              aria-label="Search transactions"
            />
            {search && (
              <button type="button" className="btn-icon filter-search-clear" onClick={() => setSearch('')} title="Clear search">
                <X size={14} />
              </button>
            )}
          </div>
          <div className="field filter-select">
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Filter by type">
              {TYPE_FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          {filtersActive && (
            <button type="button" className="btn btn-secondary" onClick={clearFilters}>
              <X size={15} /> Clear filters
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="empty-state">
          <strong>Unable to load transactions</strong>
          <p style={{ margin: '6px 0 0' }}>{error}</p>
          <button className="btn btn-secondary" style={{ marginTop: 10 }} onClick={fetchAll}>Retry</button>
        </div>
      )}

      {!loading && !error && visibleTransactions.length === 0 && (
        <div className="empty-state">
          <strong>No transactions found</strong>
          <p style={{ margin: '6px 0 0' }}>{transactions.length === 0 ? 'No stock movements recorded yet.' : 'No movements match the current filters.'}</p>
          {filtersActive && (
            <button type="button" className="btn btn-secondary" style={{ marginTop: 10 }} onClick={clearFilters}>Clear filters</button>
          )}
        </div>
      )}

      {loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="card" style={{ height: '260px' }}>
              <Skeleton height={16} style={{ marginBottom: '12px' }} />
              <Skeleton height={16} style={{ marginBottom: '8px' }} />
              <Skeleton height={16} style={{ marginBottom: '16px' }} />
              <Skeleton height={16} style={{ marginBottom: '12px' }} />
              <Skeleton height={40} style={{ borderRadius: '999px' }} />
            </div>
          ))}
        </div>
      )}

      {!loading && !error && visibleTransactions.length > 0 && (
        <motion.div 
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <StaggeredList staggerDelay={0.03}>
            {visibleTransactions.map((t) => {
              const isIncrease = t.quantity > 0;
              const borderColorMap = { 'sale': 'var(--red)', 'adjustment': 'var(--gold)', 'disposal': 'var(--red)', 'return': 'var(--green)' };
              return (
                <motion.div
                  key={t.id}
                  className="card"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '16px',
                    borderTop: `4px solid ${borderColorMap[t.transaction_type] || 'var(--gold)'}`,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  whileHover={{ y: -4, boxShadow: 'var(--shadow-md)' }}
                >
                  {/* Top Row: ID & Type Badge */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span className="stamp" style={{ fontSize: '11px' }}>ID: {t.id}</span>
                    <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '999px', background: `${borderColorMap[t.transaction_type] || 'var(--gold)'}15`, color: borderColorMap[t.transaction_type] || 'var(--gold)', textTransform: 'capitalize' }}>
                      {t.transaction_type}
                    </span>
                  </div>

                  {/* Middle Content */}
                  <div style={{ flex: 1, marginBottom: '12px' }}>
                    <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--ink)', marginBottom: '4px', lineHeight: 1.3 }}>
                      {t.medicine_name}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--steel)', marginBottom: '8px', lineHeight: 1.4 }}>
                      Batch: <span className="stamp" style={{ fontSize: '11px' }}>{t.batch_number}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
                      <div>
                        <div style={{ color: 'var(--steel)', fontSize: '11px' }}>Quantity</div>
                        <div style={{ fontWeight: 700, fontSize: '14px', color: isIncrease ? 'var(--green)' : 'var(--red)' }}>
                          {isIncrease ? '+' : ''}{t.quantity}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--steel)', fontSize: '11px' }}>Date</div>
                        <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{new Date(t.created_at).toLocaleDateString()}</div>
                      </div>
                    </div>
                    {t.reason && (
                      <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border)', fontSize: '11px', color: 'var(--steel)' }}>
                        Reason: <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{t.reason}</span>
                      </div>
                    )}
                  </div>

                  {/* Bottom Row: Avatar + User + Time */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--gradient-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '12px', fontWeight: 700, flexShrink: 0 }}>
                        {t.user_name.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--ink-soft)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.user_name.substring(0, 12)}</div>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--steel)', whiteSpace: 'nowrap', marginLeft: '8px' }}>
                      {new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
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
import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Plus, Search, X } from 'lucide-react';
import api from '../api/axios';
import { useToast } from '../context/ToastContext';
import StaggeredList from '../components/StaggeredList';

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
          style={{ padding: 20, marginBottom: 20, display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}
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
          <div style={{ gridColumn: 'span 2', display: 'flex', gap: 10 }}>
            <button type="submit" className="btn btn-primary">Save transaction</button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
          {error && <p className="error-text" style={{ gridColumn: 'span 2' }}>{error}</p>}
        </motion.form>
      )}

      <motion.div 
        className="card" 
        style={{ padding: 16 }}
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

        {!loading && visibleTransactions.length === 0 && (
          <div className="empty-state">
            <div>{transactions.length === 0 ? 'No stock movements recorded yet.' : 'No movements match the current filters.'}</div>
            {filtersActive && (
              <button type="button" className="btn btn-secondary" style={{ marginTop: 10 }} onClick={clearFilters}>Clear filters</button>
            )}
          </div>
        )}

        <table className="data-table">
          <thead>
            <tr><th>Date</th><th>Medicine</th><th>Batch</th><th>Type</th><th>Qty</th><th>By</th></tr>
          </thead>
          <StaggeredList staggerDelay={0.03}>
            <tbody>
              {visibleTransactions.map((t) => (
                <tr key={t.id}>
                  <td>{new Date(t.created_at).toLocaleString()}</td>
                  <td style={{ fontWeight: 500 }}>{t.medicine_name}</td>
                  <td><span className="stamp">{t.batch_number}</span></td>
                  <td style={{ textTransform: 'capitalize' }}>{t.transaction_type}</td>
                  <td style={{ color: t.quantity < 0 ? 'var(--red)' : 'var(--green)' }}>{t.quantity > 0 ? `+${t.quantity}` : t.quantity}</td>
                  <td>{t.user_name}</td>
                </tr>
              ))}
            </tbody>
          </StaggeredList>
        </table>
      </motion.div>
    </motion.div>
  );
}
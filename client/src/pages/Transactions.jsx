import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Plus, Search, X, Download, ChevronDown, ArrowDownLeft, ArrowUpRight, RefreshCw, Trash2 } from 'lucide-react';
import api from '../api/axios';
import { useToast } from '../context/ToastContext';
import StaggeredList from '../components/StaggeredList';
import Skeleton from '../components/Skeleton';
import { downloadCsv } from '../utils/csv';

// ── Transactions export dropdown ──────────────────────────────────────────────
function TransactionExportDropdown({ onExport }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    function onClickOutside(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const OPTIONS = [
    { label: 'All transactions (CSV)', key: 'csv', format: 'csv' },
    null,
    { label: 'All transactions — 30d (Excel)', key: 'all', format: 'excel', days: 30 },
    { label: 'Sales only — 30d (Excel)', key: 'sale', format: 'excel', days: 30 },
    { label: 'Disposals only — 30d (Excel)', key: 'disposal', format: 'excel', days: 30 },
    { label: 'All transactions — 90d (Excel)', key: 'all', format: 'excel', days: 90 },
    null,
    { label: 'All transactions — 30d (PDF)', key: 'all', format: 'pdf', days: 30 },
    { label: 'All transactions — 30d (Word)', key: 'all', format: 'docx', days: 30 },
  ];

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="btn btn-secondary" onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Download size={15} /> Export <ChevronDown size={13} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: 240,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 12, boxShadow: 'var(--shadow-xl)', zIndex: 50, padding: '6px 0'
        }}>
          {OPTIONS.map((opt, idx) => opt === null ? (
            <hr key={idx} style={{ margin: '4px 0', border: 'none', borderTop: '1px solid var(--border)' }} />
          ) : (
            <button
              key={idx}
              onClick={() => { onExport(opt.key, opt.format, opt.days); setOpen(false); }}
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

const TYPES = ['sale', 'adjustment', 'disposal', 'return'];
const TYPE_FILTERS = [{ value: 'all', label: 'All types' }, ...TYPES.map((type) => ({ value: type, label: type[0].toUpperCase() + type.slice(1) }))];

function transactionConfig(type) {
  if (type === 'sale') return { cls: 'critical', Icon: ArrowDownLeft, label: 'Sale' };
  if (type === 'disposal') return { cls: 'critical', Icon: Trash2, label: 'Disposal' };
  if (type === 'return') return { cls: 'safe', Icon: ArrowUpRight, label: 'Return' };
  return { cls: 'warning', Icon: RefreshCw, label: 'Adjustment' };
}

export default function Transactions() {
  const { addToast } = useToast();
  const [transactions, setTransactions] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ batch_id: '', transaction_type: 'sale', quantity: '', reason: '' });
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const prefersReducedMotion = useReducedMotion();

  async function fetchAll() {
    try {
      const [t, b] = await Promise.all([api.cachedGet('/transactions/recent'), api.cachedGet('/batches')]);
      setTransactions(t.data || []);
      setBatches((b.data || []).filter((batch) => batch.status === 'active' || batch.status === 'depleted'));
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
    setFormError('');
    try {
      await api.post('/transactions', form);
      api.invalidateCache('/transactions/recent');
      api.invalidateCache('/batches');
      setForm({ batch_id: '', transaction_type: 'sale', quantity: '', reason: '' });
      setShowForm(false);
      await fetchAll();
      addToast('Transaction recorded', 'success');
    } catch (err) {
      setFormError(err.response?.data?.error || 'Transaction failed');
    }
  }

  async function handleExport(key, format, days = 30) {
    if (key === 'csv') {
      const rows = visibleTransactions.map(t => ({
        id: t.id, type: t.transaction_type, medicine: t.medicine_name,
        batch: t.batch_number, quantity: t.quantity, reason: t.reason || '',
        user: t.user_name, date: new Date(t.created_at).toLocaleDateString()
      }));
      downloadCsv('transactions.csv', rows, ['id', 'type', 'medicine', 'batch', 'quantity', 'reason', 'user', 'date']);
      return;
    }
    try {
      const typeParam = key !== 'all' ? `&type=${key}` : '';
      const res = await api.get(`/reports/export/transactions?days=${days}&format=${format}${typeParam}`, { responseType: 'blob' });
      const ext = format === 'pdf' ? 'pdf' : format === 'docx' ? 'docx' : 'xlsx';
      const blob = new Blob([res.data], { type: res.headers['content-type'] || 'application/octet-stream' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `transactions_${key}_${days}d.${ext}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      addToast('Transactions exported', 'success');
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
          <h1>Transactions</h1>
          <p>{loading ? 'Loading movements…' : `${visibleTransactions.length} of ${transactions.length} movements shown`}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <TransactionExportDropdown onExport={handleExport} />
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
            <Plus size={15} /> {showForm ? 'Close form' : 'Record transaction'}
          </button>
        </div>
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
          {formError && <p className="error-text" style={{ gridColumn: '1 / -1' }}>{formError}</p>}
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
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <StaggeredList
            staggerDelay={0.03}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}
          >
            {visibleTransactions.map((t) => {
              const isIncrease = t.quantity > 0;
              const config = transactionConfig(t.transaction_type);
              const TypeIcon = config.Icon;
              return (
                <motion.div
                  key={t.id}
                  className="card transaction-card"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    borderTop: `5px solid var(--${config.cls === 'critical' ? 'color-error' : config.cls === 'safe' ? 'color-success' : 'color-secondary'})`,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  whileHover={{ y: -4, boxShadow: 'var(--shadow-md)' }}
                >
                  {/* Top Row: ID & Type Badge */}
                  <div className="transaction-card__top-row">
                    <span className="stamp transaction-card__id">ID: {t.id}</span>
                    <span className={`status-pill transaction-card__type ${config.cls}`}>
                      <TypeIcon aria-hidden="true" size={18} strokeWidth={2.5} />
                      <span>{config.label}</span>
                    </span>
                  </div>

                  {/* Middle Content */}
                  <div className="transaction-card__content">
                    <div className="transaction-card__name">
                      {t.medicine_name}
                    </div>
                    <div className="transaction-card__details">
                      Batch: <span className="stamp transaction-card__batch">{t.batch_number}</span>
                    </div>
                    <div className="transaction-card__stats">
                      <div>
                        <div className="transaction-card__label">Quantity</div>
                        <div className={`transaction-card__quantity ${isIncrease ? 'increase' : 'decrease'}`}>
                          {isIncrease ? '+' : ''}{t.quantity}
                        </div>
                      </div>
                      <div>
                        <div className="transaction-card__label">Date</div>
                        <div className="transaction-card__value">{new Date(t.created_at).toLocaleDateString()}</div>
                      </div>
                    </div>
                    {t.reason && (
                      <div className="transaction-card__reason">
                        Reason: <span>{t.reason}</span>
                      </div>
                    )}
                  </div>

                  {/* Bottom Row: Avatar + User + Time */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                      <div className="transaction-card__avatar">
                        {t.user_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="transaction-card__user">{t.user_name.substring(0, 12)}</div>
                    </div>
                    <div className="transaction-card__time">
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
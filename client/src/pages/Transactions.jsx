import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, X, Download, ChevronDown, ArrowDownLeft, ArrowUpRight, RefreshCw, Trash2, Calendar } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import { useToast } from '../context/ToastContext';
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
      <button type="button" className="flat-action-btn" onClick={() => setOpen(o => !o)}>
        <Download size={15} /> Export <ChevronDown size={13} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: 240,
          background: '#fff', border: '1px solid var(--flat-border)',
          borderRadius: 8, zIndex: 50, padding: '6px 0'
        }}>
          {OPTIONS.map((opt, idx) => opt === null ? (
            <hr key={idx} style={{ margin: '4px 0', border: 'none', borderTop: '1px solid var(--flat-border)' }} />
          ) : (
            <button
              key={idx}
              onClick={() => { onExport(opt.key, opt.format, opt.days); setOpen(false); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--flat-text)', transition: 'background 0.12s ease' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--flat-bg)'}
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

// Maps transaction type severity onto the flat design system's palette.
const TX_FLAT_CLS = { critical: 'red', warning: 'amber', safe: 'green' };

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
  const [searchParams, setSearchParams] = useSearchParams();
  const [dateFilter, setDateFilter] = useState(searchParams.get('date') || '');

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

  // Deep-link support from the Dashboard's sales chart: clicking a day bar
  // lands here with ?date=YYYY-MM-DD already applied, then the param is
  // cleared so it doesn't re-trigger on subsequent navigations.
  useEffect(() => {
    if (searchParams.get('date')) {
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleTransactions = useMemo(() => {
    const term = search.trim().toLowerCase();
    return transactions.filter((t) => {
      if (typeFilter !== 'all' && t.transaction_type !== typeFilter) return false;
      if (dateFilter && new Date(t.created_at).toISOString().slice(0, 10) !== dateFilter) return false;
      if (!term) return true;
      return [t.medicine_name, t.batch_number, t.user_name, t.reason]
        .some((value) => String(value || '').toLowerCase().includes(term));
    });
  }, [transactions, search, typeFilter, dateFilter]);

  const filtersActive = Boolean(search) || typeFilter !== 'all' || Boolean(dateFilter);

  function clearFilters() {
    setSearch('');
    setTypeFilter('all');
    setDateFilter('');
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
    <div className="flat-dashboard">
      <div className="page-header">
        <div>
          <h1>Transactions</h1>
          <p>{loading ? 'Loading movements…' : `${visibleTransactions.length} of ${transactions.length} movements shown`}</p>
        </div>
        <div className="page-header-actions">
          <TransactionExportDropdown onExport={handleExport} />
          <button type="button" className="flat-btn-primary" onClick={() => setShowForm(!showForm)}>
            <Plus size={15} /> {showForm ? 'Close form' : 'New transaction'}
          </button>
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="flat-card"
          style={{ padding: 16, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}
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
            <button type="submit" className="flat-btn-primary">Save transaction</button>
            <button type="button" className="flat-action-btn" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
          {formError && <p className="error-text" style={{ gridColumn: '1 / -1' }}>{formError}</p>}
        </form>
      )}

      <div className="flat-card" style={{ padding: 16 }}>
        <div className="filter-bar" style={{ margin: 0, background: 'none', border: 'none', padding: 0 }}>
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
          {dateFilter && (
            <button type="button" className="filter-toggle" onClick={() => setDateFilter('')} title="Clear date filter">
              <Calendar size={14} /> {new Date(`${dateFilter}T00:00:00`).toLocaleDateString()} <X size={13} />
            </button>
          )}
          {filtersActive && (
            <button type="button" className="flat-action-btn" onClick={clearFilters}>
              <X size={15} /> Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="flat-card">
        <div className="flat-table-header">
          <span className="flat-table-title">Movements</span>
          {filtersActive && (
            <button type="button" className="flat-table-link" onClick={clearFilters}>Clear filters</button>
          )}
        </div>
        <div style={{ padding: 16 }}>
          {error && (
            <div className="flat-empty">
              Unable to load transactions — {error}
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

          {!error && !loading && visibleTransactions.length === 0 && (
            <div className="flat-empty">{transactions.length === 0 ? 'No stock movements recorded yet.' : 'No movements match the current filters.'}</div>
          )}

          {!error && !loading && visibleTransactions.length > 0 && (
            <div className="flat-card-grid">
              {visibleTransactions.map((t) => {
                const isIncrease = t.quantity > 0;
                const config = transactionConfig(t.transaction_type);
                const TypeIcon = config.Icon;
                return (
                  <div key={t.id} className={`flat-card flat-item-card flat-item-card--${TX_FLAT_CLS[config.cls]}`} style={{ cursor: 'default' }}>
                    <div className="flat-item-card__top">
                      <div className="flat-item-icon"><TypeIcon size={20} /></div>
                      <span className={`flat-status-label ${TX_FLAT_CLS[config.cls]}`}>{config.label}</span>
                    </div>
                    <div className="flat-med-name">{t.medicine_name}</div>
                    <div className="flat-med-meta">{t.user_name} · {new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    <span className="flat-tag">Batch {t.batch_number}</span>
                    <div className="flat-item-row">
                      <span>Quantity</span>
                      <strong className={`flat-status-label ${isIncrease ? 'green' : 'red'}`}>{isIncrease ? '+' : ''}{t.quantity}</strong>
                    </div>
                    <div className="flat-item-row">
                      <span>Date</span>
                      <strong>{new Date(t.created_at).toLocaleDateString()}</strong>
                    </div>
                    {t.reason && <div className="flat-med-meta">Reason: {t.reason}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
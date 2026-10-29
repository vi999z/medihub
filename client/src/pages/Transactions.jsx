import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, X, ArrowDownLeft, ArrowUpRight, RefreshCw, Trash2, PackagePlus } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import { useToast } from '../context/ToastContext';
import { downloadCsv } from '../utils/csv';
import StockMovementModal from '../components/StockMovementModal';
import ExportDropdown from '../components/ExportDropdown';
import { downloadBlob } from '../utils/downloadFile';
import { localDateKey } from '../utils/date';

const EXPORT_OPTIONS = [
  { label: 'All transactions — 30d (Excel)', key: 'all', format: 'excel', days: 30 },
  { label: 'Sales only — 30d (Excel)', key: 'sale', format: 'excel', days: 30 },
  { label: 'Disposals only — 30d (Excel)', key: 'disposal', format: 'excel', days: 30 },
  { label: 'All transactions — 90d (Excel)', key: 'all', format: 'excel', days: 90 },
  null,
  { label: 'All transactions — 30d (PDF)', key: 'all', format: 'pdf', days: 30 },
  { label: 'All transactions — 30d (Word)', key: 'all', format: 'docx', days: 30 },
  null,
  { label: 'Current view (CSV)', key: 'csv', format: 'csv' },
];

const TYPE_FILTERS = [
  { value: 'all', label: 'All types' },
  { value: 'stock_in', label: 'Stock in' },
  { value: 'sale', label: 'Sale' },
  { value: 'adjustment', label: 'Adjustment' },
  { value: 'disposal', label: 'Disposal' },
  { value: 'return', label: 'Return' },
];

function transactionConfig(type) {
  if (type === 'stock_in') return { cls: 'safe', Icon: PackagePlus, label: 'Stock in' };
  if (type === 'sale') return { cls: 'critical', Icon: ArrowDownLeft, label: 'Sale' };
  if (type === 'disposal') return { cls: 'critical', Icon: Trash2, label: 'Disposal' };
  if (type === 'return') return { cls: 'safe', Icon: ArrowUpRight, label: 'Return' };
  return { cls: 'warning', Icon: RefreshCw, label: 'Adjustment' };
}

// Maps transaction type severity onto the flat design system's palette.
const TX_FLAT_CLS = { critical: 'red', warning: 'amber', safe: 'green' };

const RECENT_LIMIT = 500;

export default function Transactions() {
  const { addToast } = useToast();
  const [transactions, setTransactions] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [searchParams, setSearchParams] = useSearchParams();
  const [dateFilter, setDateFilter] = useState(searchParams.get('date') || '');

  // A picked day loads every movement on that day; otherwise the latest
  // RECENT_LIMIT movements (the server's default of 50 hid older days).
  const transactionsUrl = dateFilter
    ? `/transactions/recent?date=${dateFilter}&limit=1000`
    : `/transactions/recent?limit=${RECENT_LIMIT}`;

  async function fetchAll() {
    try {
      const [t, b] = await Promise.all([api.cachedGet(transactionsUrl), api.cachedGet('/batches')]);
      setTransactions(t.data || []);
      setBatches(b.data || []);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load transactions');
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchAll(); }, [transactionsUrl]);

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
      if (dateFilter && localDateKey(t.created_at) !== dateFilter) return false;
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

  async function handleSubmit(form) {
    setFormError('');
    try {
      await api.post('/transactions', form);
      api.invalidateCache('/transactions/recent');
      api.invalidateCache('/batches');
      await fetchAll();
      addToast('Transaction recorded', 'success');
    } catch (err) {
      setFormError(err.response?.data?.error || 'Transaction failed');
      throw err;
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
      downloadBlob(blob, `transactions_${key}_${days}d.${ext}`);
      addToast('Transactions exported', 'success');
    } catch (err) {
      addToast('Export failed', 'error');
    }
  }

  return (
    <div className="flat-dashboard">
      <div className="page-actions-only">
        <div className="page-header-actions">
          <ExportDropdown options={EXPORT_OPTIONS} onSelect={({ key, format, days }) => handleExport(key, format, days)} />
          <button type="button" className="flat-btn-primary" onClick={() => setShowForm(true)}>
            <Plus size={15} /> New transaction
          </button>
        </div>
      </div>

      <StockMovementModal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        batches={batches}
        onSubmit={handleSubmit}
        error={formError}
      />

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
          <div className="field filter-select">
            <input
              type="date"
              value={dateFilter}
              max={localDateKey()}
              onChange={(e) => setDateFilter(e.target.value)}
              aria-label="Filter by date"
              title="Show movements on this date"
            />
          </div>
          {filtersActive && (
            <button type="button" className="flat-action-btn" onClick={clearFilters}>
              <X size={15} /> Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="flat-card">
        <div className="flat-table-header">
          <span className="flat-table-title">
            Movements
            {!dateFilter && transactions.length >= RECENT_LIMIT && (
              <span className="flat-med-meta" style={{ fontWeight: 400, marginLeft: 8 }}>latest {RECENT_LIMIT} shown</span>
            )}
          </span>
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
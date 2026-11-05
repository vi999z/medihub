import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, X, Download } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import { useToast } from '../context/ToastContext';
import { downloadCsv } from '../utils/csv';
import StockMovementModal from '../components/StockMovementModal';
import ReportExportModal from '../components/ReportExportModal';
import { localDateKey } from '../utils/date';
import PageHeader from '../components/PageHeader';
import Pagination from '../components/Pagination';
import TableSkeleton from '../components/TableSkeleton';
import usePagination from '../hooks/usePagination';
import { errorMessage } from '../utils/errors';
import { useBranchFilter } from '../context/BranchContext';
import useBranches from '../hooks/useBranches';

const TYPE_FILTERS = [
  { value: 'all', label: 'All types' },
  { value: 'stock_in', label: 'Stock in' },
  { value: 'sale', label: 'Sale' },
  { value: 'adjustment', label: 'Adjustment' },
  { value: 'disposal', label: 'Disposal' },
  { value: 'return', label: 'Return' },
];

// Transaction type onto the flat design system's palette.
const TYPE_CONFIG = {
  stock_in: { cls: 'green', label: 'Stock in' },
  sale: { cls: 'red', label: 'Sale' },
  disposal: { cls: 'red', label: 'Disposal' },
  return: { cls: 'green', label: 'Return' },
};
const ADJUSTMENT_CONFIG = { cls: 'amber', label: 'Adjustment' };

const PAGE_LIMIT = 500;

export default function Transactions() {
  const { addToast } = useToast();
  const [showExport, setShowExport] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const { branch: branchFilter, setBranch: setBranchFilter } = useBranchFilter();
  const { names: branchNames } = useBranches();
  const [searchParams, setSearchParams] = useSearchParams();
  const [dateFilter, setDateFilter] = useState(searchParams.get('date') || '');
  const [recentLimit, setRecentLimit] = useState(PAGE_LIMIT);

  // A picked day loads every movement on that day; otherwise the latest
  // RECENT_LIMIT movements (the server's default of 50 hid older days).
  const transactionsUrl = dateFilter
    ? `/transactions/recent?date=${dateFilter}&limit=1000`
    : `/transactions/recent?limit=${recentLimit}`;

  async function fetchAll() {
    try {
      const [t, b] = await Promise.all([api.cachedGet(transactionsUrl), api.cachedGet('/batches')]);
      setTransactions(t.data || []);
      setBatches(b.data || []);
      setError('');
    } catch (err) {
      setError(errorMessage(err, 'Failed to load transactions'));
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
      if (branchFilter !== 'all' && t.branch !== branchFilter) return false;
      if (dateFilter && localDateKey(t.created_at) !== dateFilter) return false;
      if (!term) return true;
      return [t.medicine_name, t.batch_number, t.user_name, t.reason]
        .some((value) => String(value || '').toLowerCase().includes(term));
    });
  }, [transactions, search, typeFilter, dateFilter, branchFilter]);

  const pager = usePagination(visibleTransactions, { resetKey: [search, typeFilter, dateFilter, branchFilter].join('|') });

  const filtersActive = Boolean(search) || typeFilter !== 'all' || Boolean(dateFilter) || branchFilter !== 'all';

  function clearFilters() {
    setSearch('');
    setTypeFilter('all');
    setDateFilter('');
    setBranchFilter('all');
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
      setFormError(errorMessage(err, 'Transaction failed'));
      throw err;
    }
  }

  // The list currently on screen (respects the search, type, branch and date filters).
  function exportCurrentView() {
    const rows = visibleTransactions.map((t) => ({
      id: t.id, branch: t.branch || '', type: t.transaction_type, medicine: t.medicine_name,
      batch: t.batch_number, quantity: t.quantity, reason: t.reason || '',
      user: t.user_name, date: new Date(t.created_at).toLocaleDateString(),
    }));
    downloadCsv('transactions.csv', rows, ['id', 'branch', 'type', 'medicine', 'batch', 'quantity', 'reason', 'user', 'date']);
  }

  return (
    <div className="flat-dashboard">
      <PageHeader title="Transactions" description="Every stock movement: stock in, sales, adjustments, disposals and returns." legend />
      <div className="page-actions-only">
        <div className="page-header-actions">
          <button type="button" className="flat-action-btn" onClick={() => setShowExport(true)}>
            <Download size={15} /> Export
          </button>
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
            <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} aria-label="Filter by branch">
              <option value="all">All branches</option>
              {branchNames.map((name) => <option key={name} value={name}>{name}</option>)}
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
            {!dateFilter && transactions.length >= recentLimit && (
              <span className="flat-med-meta" style={{ fontWeight: 400, marginLeft: 8 }}>latest {recentLimit} shown</span>
            )}
            {!dateFilter && transactions.length >= recentLimit && recentLimit < 5000 && (
              <button type="button" className="flat-table-link" style={{ marginLeft: 10, fontWeight: 400 }} onClick={() => setRecentLimit((n) => n + PAGE_LIMIT)}>Load more</button>
            )}
          </span>
        </div>
        {error && (
          <div className="flat-empty">
            Unable to load transactions — {error}
            <div style={{ marginTop: 10 }}>
              <button type="button" className="flat-action-btn" onClick={fetchAll}>Retry</button>
            </div>
          </div>
        )}

        {!error && !loading && visibleTransactions.length === 0 && (
          <div className="flat-empty">{transactions.length === 0 ? 'No stock movements recorded yet.' : 'No movements match the current filters.'}</div>
        )}

        {!error && (loading || visibleTransactions.length > 0) && (
          <div className="flat-table-scroll">
            <table className="flat-table flat-table--responsive">
              <thead>
                <tr>
                  <th>Medicine</th>
                  <th>Type</th>
                  <th>Batch no.</th>
                  <th>Branch</th>
                  <th className="flat-col-right">Quantity</th>
                  <th>Recorded by</th>
                  <th>Date</th>
                  <th>Reason</th>
                </tr>
              </thead>
              {loading ? <TableSkeleton cols={8} rows={8} /> : (
                <tbody>
                  {pager.pageItems.map((t) => {
                    const config = TYPE_CONFIG[t.transaction_type] || ADJUSTMENT_CONFIG;
                    const created = new Date(t.created_at);
                    return (
                      <tr key={t.id}>
                        <td data-label="Medicine" className="flat-table-primary">
                          <div className="flat-med-name">{t.medicine_name}</div>
                        </td>
                        <td data-label="Type" className="flat-col-nowrap">
                          <span className={`flat-status-label ${config.cls}`}>{config.label}</span>
                        </td>
                        <td data-label="Batch no." className="flat-col-nowrap">{t.batch_number}</td>
                        <td data-label="Branch">{t.branch || '—'}</td>
                        <td data-label="Quantity" className="flat-col-right">
                          <span className={`flat-qty ${t.quantity > 0 ? 'in' : 'out'}`}>{t.quantity > 0 ? '+' : ''}{t.quantity}</span>
                        </td>
                        <td data-label="Recorded by">{t.user_name}</td>
                        <td data-label="Date" className="flat-col-nowrap">
                          {created.toLocaleDateString()} {created.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td data-label="Reason" className="flat-table-reason">{t.reason || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              )}
            </table>
          </div>
        )}
        {!error && !loading && <Pagination {...pager} itemLabel="movements" />}
      </div>
      <ReportExportModal
        isOpen={showExport}
        onClose={() => setShowExport(false)}
        defaultReport="transactions"
        onExportView={exportCurrentView}
      />
    </div>
  );
}
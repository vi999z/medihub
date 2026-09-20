import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { downloadCsv } from '../utils/csv';

function peso(n) {
  const value = Number(n) || 0;
  return `₱${value.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
}

const DATE_FILTERS = [
  { value: 'today', label: 'Today', days: 1 },
  { value: '7d', label: 'Last 7 days', days: 7 },
  { value: '30d', label: 'Last 30 days', days: 30 },
];

const STATUS_META = {
  out_of_stock: { label: 'Out of stock', cls: 'red' },
  low_stock: { label: 'Running low', cls: 'amber' },
  expiring: { label: 'Expiring soon', cls: 'orange' },
  healthy: { label: 'Healthy', cls: 'green' },
};

// Table title mirrors whichever stock bucket is currently selected, so the
// heading never disagrees with the button the user just clicked.
const TABLE_TITLE_BY_FILTER = {
  all: 'Needs attention',
  out_of_stock: 'Out of stock',
  low_stock: 'Running low',
  expiring: 'Expiring soon',
  healthy: 'Healthy stock',
};

function FlatDropdown({ label, options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onClickOutside(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const current = options.find((o) => o.value === value);

  return (
    <div className="flat-filter-wrapper" ref={ref}>
      <button type="button" className="flat-filter-btn" onClick={() => setOpen((o) => !o)}>
        {current ? current.label : label}
      </button>
      {open && (
        <div className="flat-filter-menu">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={opt.value === value ? 'active' : ''}
              onClick={() => { onChange(opt.value); setOpen(false); }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [todaySales, setTodaySales] = useState(null);
  const [summary, setSummary] = useState(null);
  const [needsAttention, setNeedsAttention] = useState(null);
  const [salesTrend, setSalesTrend] = useState([]);
  const [topSellers, setTopSellers] = useState([]);
  const [error, setError] = useState('');

  const [branchFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('30d');
  const [statusFilter, setStatusFilter] = useState('all');

  const loading = summary === null;
  const horizonDays = DATE_FILTERS.find((f) => f.value === dateFilter)?.days ?? 30;

  useEffect(() => {
    let mounted = true;
    Promise.all([
      api.cachedGet('/reports/today-sales'),
      api.cachedGet('/reports/summary'),
      api.cachedGet(`/reports/needs-attention?days=${horizonDays}`),
      api.cachedGet('/reports/sales-trend?days=7'),
      api.cachedGet('/reports/top-sellers?limit=5'),
    ])
      .then(([todayRes, summaryRes, attentionRes, trendRes, sellersRes]) => {
        if (!mounted) return;
        setTodaySales(todayRes.data);
        setSummary(summaryRes.data);
        setNeedsAttention(attentionRes.data);
        setSalesTrend(trendRes.data);
        setTopSellers(sellersRes.data);
        setError('');
      })
      .catch((err) => {
        if (mounted) setError(err.response?.data?.error || 'Failed to load dashboard data');
      });
    return () => { mounted = false; };
  }, [horizonDays]);

  const categoryOptions = useMemo(() => {
    const names = new Set((needsAttention?.items || []).map((i) => i.category || 'Uncategorized'));
    return [{ value: 'all', label: 'All categories' }, ...[...names].sort().map((c) => ({ value: c, label: c }))];
  }, [needsAttention]);

  const filteredItems = useMemo(() => {
    const items = needsAttention?.items || [];
    return items.filter((i) =>
      (statusFilter === 'all' ? i.status !== 'healthy' : i.status === statusFilter) &&
      (categoryFilter === 'all' || (i.category || 'Uncategorized') === categoryFilter)
    );
  }, [needsAttention, categoryFilter, statusFilter]);

  function toggleStockFilter(status) {
    setStatusFilter((current) => (current === status ? 'all' : status));
  }

  function handleExport() {
    const filename = statusFilter === 'all' ? 'needs-attention.csv' : `${statusFilter}.csv`;
    downloadCsv(
      filename,
      filteredItems.map((i) => ({
        name: i.name,
        category: i.category || '',
        dosage_form: i.dosage_form || '',
        in_stock: i.total_remaining,
        unit: i.unit || '',
        expires: i.nearest_expiry ? i.nearest_expiry.slice(0, 10) : '',
        status: STATUS_META[i.status]?.label || i.status,
      })),
      ['name', 'category', 'dosage_form', 'in_stock', 'unit', 'expires', 'status']
    );
  }

  const maxRevenue = Math.max(1, ...salesTrend.map((d) => d.revenue || 0));
  const trendTotal = salesTrend.reduce((sum, d) => sum + (d.revenue || 0), 0);
  const todayKey = new Date().toISOString().slice(0, 10);
  const vsYesterday = todaySales?.vs_yesterday_pct;

  return (
    <div className="flat-dashboard">
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
        </div>
      </div>

      {error && (
        <div className="flat-card" style={{ padding: 20 }}>
          <strong>Unable to load dashboard</strong>
          <p style={{ margin: '6px 0 0', color: 'var(--flat-text-muted)' }}>{error}</p>
          <button type="button" className="flat-action-btn" style={{ marginTop: 10 }} onClick={() => window.location.reload()}>Retry</button>
        </div>
      )}

      {!error && (
        <>
          {/* a. Filter row */}
          <div className="flat-filter-row">
            <FlatDropdown label="All branches" options={[{ value: 'all', label: 'All branches' }]} value={branchFilter} onChange={() => {}} />
            <FlatDropdown label="All categories" options={categoryOptions} value={categoryFilter} onChange={setCategoryFilter} />
            <FlatDropdown label="Today" options={DATE_FILTERS} value={dateFilter} onChange={setDateFilter} />
            <div className="flat-filter-spacer" />
            <button type="button" className="flat-export-btn" onClick={handleExport}>Export</button>
          </div>

          {/* b. Summary strip */}
          <div className="flat-card flat-summary-strip">
            <div className="flat-summary-col">
              <div className="flat-summary-label">Sales today</div>
              <div className="flat-summary-value">{loading ? '—' : peso(todaySales?.total)}</div>
              <div className={`flat-summary-sub ${vsYesterday > 0 ? 'positive' : vsYesterday < 0 ? 'negative' : ''}`}>
                {loading ? '' : vsYesterday === null || vsYesterday === undefined
                  ? 'no sales yesterday'
                  : `${vsYesterday >= 0 ? '↑' : '↓'} ${Math.abs(vsYesterday).toFixed(0)}% vs yesterday`}
              </div>
            </div>
            <div className="flat-summary-col">
              <div className="flat-summary-label">Inventory value</div>
              <div className="flat-summary-value">{loading ? '—' : peso(summary?.inventory_value)}</div>
              <div className="flat-summary-sub">at cost</div>
            </div>
            <div className="flat-summary-col">
              <div className="flat-summary-label">Retail value</div>
              <div className="flat-summary-value">{loading ? '—' : peso(summary?.retail_value)}</div>
              <div className="flat-summary-sub">if all sold</div>
            </div>
            <div className="flat-summary-col">
              <div className="flat-summary-label">Margin</div>
              <div className="flat-summary-value">{loading ? '—' : `${Number(summary?.margin_pct || 0).toFixed(1)}%`}</div>
              <div className="flat-summary-sub">{loading ? '' : `${peso(summary?.margin_value)} profit`}</div>
            </div>
          </div>

          {/* c. Stock status strip */}
          <div className="flat-card flat-stock-strip">
            <button type="button" className={`flat-stock-col${statusFilter === 'out_of_stock' ? ' active' : ''}`} onClick={() => toggleStockFilter('out_of_stock')}>
              <span className="flat-stock-dot red" />
              <span className="flat-stock-text">
                <span className="flat-stock-number">{loading ? '—' : needsAttention?.counts.out_of_stock ?? 0}</span>
                <span className="flat-stock-label">Out of stock</span>
              </span>
            </button>
            <button type="button" className={`flat-stock-col${statusFilter === 'low_stock' ? ' active' : ''}`} onClick={() => toggleStockFilter('low_stock')}>
              <span className="flat-stock-dot amber" />
              <span className="flat-stock-text">
                <span className="flat-stock-number">{loading ? '—' : needsAttention?.counts.low_stock ?? 0}</span>
                <span className="flat-stock-label">Running low</span>
              </span>
            </button>
            <button type="button" className={`flat-stock-col${statusFilter === 'expiring' ? ' active' : ''}`} onClick={() => toggleStockFilter('expiring')}>
              <span className="flat-stock-dot orange" />
              <span className="flat-stock-text">
                <span className="flat-stock-number">{loading ? '—' : needsAttention?.counts.expiring ?? 0}</span>
                <span className="flat-stock-label">Expiring in {horizonDays}d</span>
              </span>
            </button>
            <button type="button" className={`flat-stock-col${statusFilter === 'healthy' ? ' active' : ''}`} onClick={() => toggleStockFilter('healthy')}>
              <span className="flat-stock-dot green" />
              <span className="flat-stock-text">
                <span className="flat-stock-number">{loading ? '—' : needsAttention?.counts.healthy ?? 0}</span>
                <span className="flat-stock-label">Healthy</span>
              </span>
            </button>
          </div>

          {/* d. Needs attention table */}
          <div className="flat-card">
            <div className="flat-table-header">
              <span className="flat-table-title">{TABLE_TITLE_BY_FILTER[statusFilter] || 'Needs attention'}</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="flat-table">
                <thead>
                  <tr>
                    <th>Medicine</th>
                    <th className="flat-col-right">In stock</th>
                    <th>Expires</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr><td colSpan={4} className="flat-empty">Loading…</td></tr>
                  )}
                  {!loading && filteredItems.length === 0 && (
                    <tr><td colSpan={4} className="flat-empty">Nothing needs attention.</td></tr>
                  )}
                  {!loading && filteredItems.map((item) => {
                    const meta = STATUS_META[item.status];
                    return (
                      <tr key={item.id}>
                        <td>
                          <div className="flat-med-name">{item.name}</div>
                          <div className="flat-med-meta">{[item.category, item.dosage_form].filter(Boolean).join(' · ')}</div>
                        </td>
                        <td className="flat-col-right">{item.total_remaining} {item.unit}</td>
                        <td>{item.nearest_expiry ? item.nearest_expiry.slice(0, 10) : '—'}</td>
                        <td><span className={`flat-status-label ${meta?.cls}`}>{meta?.label}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* e. Bottom row */}
          <div className="flat-bottom-row">
            <div className="flat-card">
              <div className="flat-card-header">
                <h3>Sales, last 7 days</h3>
                <span className="flat-card-total">{peso(trendTotal)} total</span>
              </div>
              <div className="flat-bar-chart">
                {loading && <div className="flat-empty">Loading…</div>}
                {!loading && salesTrend.map((d) => {
                  const isToday = d.date === todayKey;
                  const heightPct = maxRevenue > 0 ? Math.max(2, (d.revenue / maxRevenue) * 100) : 2;
                  const dayLabel = new Date(`${d.date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short' });
                  return (
                    <button
                      type="button"
                      key={d.date}
                      className="flat-bar-col"
                      title={`${peso(d.revenue)} — view transactions`}
                      onClick={() => navigate(`/transactions?date=${d.date}`)}
                    >
                      <div className={`flat-bar${isToday ? ' today' : ''}`} style={{ height: `${heightPct}%` }} />
                      <span className="flat-bar-day">{dayLabel}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flat-card">
              <div className="flat-card-header">
                <h3>Top-selling medicines</h3>
              </div>
              <div className="flat-top-sellers">
                {loading && <div className="flat-empty">Loading…</div>}
                {!loading && topSellers.length === 0 && <div className="flat-empty">No sales recorded yet.</div>}
                {!loading && topSellers.map((s, idx) => (
                  <button
                    type="button"
                    key={s.id}
                    className="flat-seller-row"
                    onClick={() => navigate(`/medicines?q=${encodeURIComponent(s.name)}`)}
                  >
                    <span className="flat-seller-rank">{idx + 1}</span>
                    <span className="flat-seller-name">{s.name}</span>
                    <span className="flat-seller-amount">{peso(s.revenue)}</span>
                    <span className="flat-seller-qty">{s.quantity_sold} sold</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

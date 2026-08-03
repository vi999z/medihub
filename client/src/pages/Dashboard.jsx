import { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { IconPill, IconWallet, IconAlertTriangle, IconPackageOff, IconArrowUpRight, IconArrowDownRight, IconMinus } from '@tabler/icons-react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import AnimatedNumber from '../components/AnimatedNumber';
import Skeleton from '../components/Skeleton';

function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(dateStr) - today) / 86400000);
}
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function TrendChip({ pct }) {
  if (pct === null) return <span className="kpi-trend flat"><IconMinus size={12} /> —</span>;
  if (Math.abs(pct) < 1) return <span className="kpi-trend flat"><IconMinus size={12} /> flat</span>;
  const up = pct > 0;
  return (
    <span className={`kpi-trend ${up ? 'up' : 'down'}`}>
      {up ? <IconArrowUpRight size={12} /> : <IconArrowDownRight size={12} />}
      {Math.abs(pct).toFixed(0)}% vs last week
    </span>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [batches, setBatches] = useState([]);
  const [expiring, setExpiring] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [trend, setTrend] = useState([]);
  const loading = summary === null;

  useEffect(() => {
    let mounted = true;
    Promise.all([
      api.cachedGet('/reports/summary'),
      api.cachedGet('/batches'),
      api.cachedGet('/reports/expiring-soon'),
      api.cachedGet('/reports/low-stock'),
      api.cachedGet('/reports/sales-trend?days=30')
    ])
      .then(([summaryRes, batchesRes, expiringRes, lowStockRes, trendRes]) => {
        if (!mounted) return;
        setSummary(summaryRes.data);
        setBatches(batchesRes.data);
        setExpiring(expiringRes.data);
        setLowStock(lowStockRes.data);
        setTrend(trendRes.data);
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  const activeBatches = batches.filter((b) => b.status === 'active');
  const health = { safe: 0, warning: 0, critical: 0 };
  for (const b of activeBatches) {
    if (b.quantity_remaining <= 0) continue;
    const d = daysUntil(b.expiry_date);
    if (d <= 7) health.critical++;
    else if (d <= 30) health.warning++;
    else health.safe++;
  }

  let salesTrendPct = null;
  if (trend.length >= 14) {
    const last7 = trend.slice(-7).reduce((a, d) => a + d.units_sold, 0);
    const prior7 = trend.slice(-14, -7).reduce((a, d) => a + d.units_sold, 0);
    if (prior7 > 0) salesTrendPct = ((last7 - prior7) / prior7) * 100;
  }

  const kpis = [
    { icon: IconPill, label: 'Medicines tracked', value: summary?.total_medicines ?? 0, prefix: '', trend: null },
    { icon: IconWallet, label: 'Inventory value', value: summary ? Number(summary.inventory_value) : 0, prefix: '₱', trend: salesTrendPct !== null ? -salesTrendPct * 0.3 : null },
    { icon: IconAlertTriangle, label: 'Expiring in 30 days', value: summary?.expiring_soon ?? 0, prefix: '', trend: null },
    { icon: IconPackageOff, label: 'Low stock items', value: summary?.low_stock ?? 0, prefix: '', trend: null },
  ];

  return (
    <>
      <div className="page-shell">
        <div className="hero-panel" style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 13, color: 'var(--steel)', marginBottom: 3 }}>Megawide Drug Pharmacy</p>
          <h1 style={{ fontSize: 'clamp(1.25rem, 2.2vw, 1.7rem)', marginBottom: 6 }}>{getGreeting()}, {user.full_name.split(' ')[0]}</h1>
          <p style={{ margin: 0, color: 'var(--ink-soft)', fontSize: 13 }}>Live inventory health, expiry risk, and procurement insights in one view.</p>
        </div>

      <div className="kpi-grid">
        {kpis.map((k) => (
          <div className="card kpi-card" key={k.label}>
            <div className="kpi-top">
              <div className="kpi-label">{k.label}</div>
              <div className="icon-badge"><k.icon size={16} stroke={1.8} color="var(--steel)" /></div>
            </div>
            <div className="kpi-value">
              {loading ? <Skeleton width={60} height={26} /> : <AnimatedNumber value={k.value} prefix={k.prefix} />}
            </div>
            {!loading && <TrendChip pct={k.trend} />}
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: '20px 24px', marginBottom: 20 }}>
        <div className="section-title">
          <h3>Units sold — last 30 days</h3>
          {salesTrendPct !== null && <TrendChip pct={salesTrendPct} />}
        </div>
        <div style={{ height: 200, marginTop: 8 }}>
          {trend.length === 0 ? (
            <Skeleton height={200} radius={8} />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--amber)" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="var(--amber)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--steel)' }} tickFormatter={(d) => d.slice(5)} axisLine={false} tickLine={false} minTickGap={30} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--steel)' }} axisLine={false} tickLine={false} width={30} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)' }} />
                <Area type="monotone" dataKey="units_sold" stroke="var(--amber)" strokeWidth={2} fill="url(#salesFill)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16 }}>
        <div className="card" style={{ padding: 20 }}>
          <div className="section-title">
            <h3>Expiring soon</h3>
          </div>
          {loading && [1, 2, 3].map((i) => <Skeleton key={i} height={36} style={{ marginBottom: 8 }} />)}
          {!loading && expiring.length === 0 && <p style={{ color: 'var(--steel)', fontSize: 13 }}>Nothing expiring in the next 30 days.</p>}
          {expiring.map((b) => (
            <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{b.medicine_name}</div>
                <span className="stamp" style={{ marginTop: 4 }}>{b.batch_number}</span>
              </div>
              <span className={`status-pill ${b.days_left <= 7 ? 'critical' : 'warning'}`}>{b.days_left}d left</span>
            </div>
          ))}
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div className="section-title">
            <h3>Low stock</h3>
          </div>
          {loading && [1, 2, 3].map((i) => <Skeleton key={i} height={36} style={{ marginBottom: 8 }} />)}
          {!loading && lowStock.length === 0 && <p style={{ color: 'var(--steel)', fontSize: 13 }}>All medicines are above their reorder level.</p>}
          {lowStock.map((m) => (
            <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 500, fontSize: 13 }}>{m.name}</div>
              <span className="stamp">{m.total_remaining} / {m.reorder_level}</span>
            </div>
          ))}
        </div>
      </div>
      </div>
    </>
  );
}
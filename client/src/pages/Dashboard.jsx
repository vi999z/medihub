import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { IconPill, IconWallet, IconAlertTriangle, IconPackageOff, IconArrowUpRight, IconArrowDownRight, IconMinus, IconUpload } from '@tabler/icons-react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import AnimatedNumber from '../components/AnimatedNumber';
import Skeleton from '../components/Skeleton';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function TrendChip({ pct }) {
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
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [expiring, setExpiring] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [trend, setTrend] = useState([]);
  const loading = summary === null;

  useEffect(() => {
    let mounted = true;
    Promise.all([
      api.cachedGet('/reports/summary'),
      api.cachedGet('/reports/expiring-soon'),
      api.cachedGet('/reports/low-stock'),
      api.cachedGet('/reports/sales-trend?days=30')
    ])
      .then(([summaryRes, expiringRes, lowStockRes, trendRes]) => {
        if (!mounted) return;
        setSummary(summaryRes.data);
        setExpiring(expiringRes.data);
        setLowStock(lowStockRes.data);
        setTrend(trendRes.data);
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  let salesTrendPct = null;
  if (trend.length >= 14) {
    const last7 = trend.slice(-7).reduce((a, d) => a + d.units_sold, 0);
    const prior7 = trend.slice(-14, -7).reduce((a, d) => a + d.units_sold, 0);
    if (prior7 > 0) salesTrendPct = ((last7 - prior7) / prior7) * 100;
  }

  const kpis = [
    { icon: IconPill, label: 'Medicines tracked', value: summary?.total_medicines ?? 0, prefix: '' },
    { icon: IconWallet, label: 'Inventory value', value: summary ? Number(summary.inventory_value) : 0, prefix: '₱' },
    { icon: IconAlertTriangle, label: 'Expiring in 30 days', value: summary?.expiring_soon ?? 0, prefix: '' },
    { icon: IconPackageOff, label: 'Low stock items', value: summary?.low_stock ?? 0, prefix: '' },
  ];

  const kpiDelays = [0, 0.06, 0.12, 0.18];

  return (
    <div className="page-shell">
      <div className="hero-panel" style={{ marginBottom: 4, position: 'relative' }}>
        <p style={{ fontSize: 13, color: 'var(--steel)', marginBottom: 4, fontWeight: 600 }}>Megawide Drug Pharmacy</p>
        <h1 style={{ fontSize: 'clamp(1.35rem, 2.4vw, 1.8rem)', marginBottom: 8 }}>{getGreeting()}, {user?.full_name?.split(' ')[0] || 'there'}</h1>
        <p style={{ margin: 0, color: 'var(--ink-soft)', fontSize: 13.5, position: 'relative', zIndex: 1 }}>
          Live inventory health, expiry risk, and procurement insights in one view.
        </p>
        <button
          className="btn btn-primary"
          onClick={() => navigate('/import')}
          style={{ position: 'absolute', top: 20, right: 24, zIndex: 2 }}
        >
          <IconUpload size={15} /> Import CSV
        </button>
      </div>

      <div className="kpi-grid">
        {kpis.map((k, index) => (
          <div
            className={`card kpi-card stagger-item`}
            key={k.label}
            style={{ animationDelay: `${kpiDelays[index]}s` }}
          >
            <div className="kpi-top">
              <div className="kpi-label">{k.label}</div>
              <div className="icon-badge"><k.icon size={17} stroke={1.8} /></div>
            </div>
            <div className="kpi-value">
              {loading ? <Skeleton width={70} height={28} /> : <AnimatedNumber value={k.value} prefix={k.prefix} />}
            </div>
            {!loading && k.trend !== undefined && <TrendChip pct={k.trend} />}
          </div>
        ))}
      </div>

      <div className="card stagger-item" style={{ padding: '22px 24px', marginBottom: 18, animationDelay: '0.24s' }}>
        <div className="section-title">
          <h3>Units sold — last 30 days</h3>
          {salesTrendPct !== null && <TrendChip pct={salesTrendPct} />}
        </div>
        <div style={{ height: 210, marginTop: 4 }}>
          {trend.length === 0 ? (
            <Skeleton height={210} radius={8} />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--amber)" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="var(--amber)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--steel)' }} tickFormatter={(d) => d.slice(5)} axisLine={false} tickLine={false} minTickGap={30} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--steel)' }} axisLine={false} tickLine={false} width={32} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}
                  formatter={(value) => [`${value} units`, 'Units sold']}
                />
                <Area type="monotone" dataKey="units_sold" stroke="var(--amber)" strokeWidth={2.5} fill="url(#salesFill)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: 16 }}>
        <div className="card stagger-item" style={{ padding: 20, animationDelay: '0.3s' }}>
          <div className="section-title">
            <h3>Expiring soon</h3>
            <span className="stamp">{expiring.length} batch{expiring.length === 1 ? '' : 'es'}</span>
          </div>
          {loading && [1, 2, 3].map((i) => <Skeleton key={i} height={38} style={{ marginBottom: 8 }} />)}
          {!loading && expiring.length === 0 && (
            <div className="empty-state" style={{ padding: 20 }}>
              <div className="empty-icon"><IconPackageOff size={20} /></div>
              <span>Nothing expiring in the next 30 days.</span>
            </div>
          )}
          {expiring.map((b) => {
            const pct = Math.max(0, Math.min(((30 - b.days_left) / 30) * 100, 100));
            return (
              <div key={b.id} style={{ padding: '11px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{b.medicine_name}</div>
                    <span className="stamp" style={{ marginTop: 5 }}>{b.batch_number}</span>
                  </div>
                  <span className={`status-pill ${b.days_left <= 7 ? 'critical' : 'warning'}`}>{b.days_left}d left</span>
                </div>
                <div className="stock-bar" style={{ marginTop: 8 }}>
                  <div className={`stock-bar-fill ${b.days_left <= 7 ? 'critical' : 'warning'}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="card stagger-item" style={{ padding: 20, animationDelay: '0.36s' }}>
          <div className="section-title">
            <h3>Low stock</h3>
            <span className="stamp">{lowStock.length} item{lowStock.length === 1 ? '' : 's'}</span>
          </div>
          {loading && [1, 2, 3].map((i) => <Skeleton key={i} height={38} style={{ marginBottom: 8 }} />)}
          {!loading && lowStock.length === 0 && (
            <div className="empty-state" style={{ padding: 20 }}>
              <div className="empty-icon"><IconAlertTriangle size={20} /></div>
              <span>All medicines are above their reorder level.</span>
            </div>
          )}
          {lowStock.map((m) => {
            const stock = Number(m.total_remaining) || 0;
            const reorder = Number(m.reorder_level) || 1;
            const pct = Math.min((stock / reorder) * 100, 100);
            const barCls = stock <= 0 ? 'critical' : pct <= 50 ? 'warning' : 'safe';
            return (
              <div key={m.id} style={{ padding: '11px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{m.name}</div>
                  <span className="stamp">{m.total_remaining} / {m.reorder_level}</span>
                </div>
                <div className="stock-bar">
                  <div className={`stock-bar-fill ${barCls}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
import { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { motion, useReducedMotion } from 'framer-motion';
import { IconPill, IconWallet, IconAlertTriangle, IconPackageOff, IconSearch, IconFilter } from '@tabler/icons-react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import AnimatedNumber from '../components/AnimatedNumber';
import Skeleton from '../components/Skeleton';
import KPICard from '../components/KPICard';
import ChartCard from '../components/ChartCard';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

const PASTEL_COLORS = ['#d4edda', '#c3e6cb', '#f8d7da', '#e2d9f3', '#cce5ff', '#fff3cd'];
const SEVERITY_COLORS = {
  critical: '#dc3545',
  warning: '#ffc107', 
  safe: '#198754'
};

export default function Dashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [expiring, setExpiring] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [trend, setTrend] = useState([]);
  const [categoryData, setCategoryData] = useState([]);
  const [tableSearch, setTableSearch] = useState('');
  const loading = summary === null;
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    let mounted = true;
    Promise.all([
      api.cachedGet('/reports/summary'),
      api.cachedGet('/reports/expiring-soon'),
      api.cachedGet('/reports/low-stock'),
      api.cachedGet('/reports/sales-trend?days=30'),
      api.cachedGet('/reports/by-category')
    ])
      .then(([summaryRes, expiringRes, lowStockRes, trendRes, categoryRes]) => {
        if (!mounted) return;
        setSummary(summaryRes.data);
        setExpiring(expiringRes.data);
        setLowStock(lowStockRes.data);
        setTrend(trendRes.data);
        setCategoryData(categoryRes.data || []);
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

  const filteredExpiring = expiring.filter(b => 
    b.medicine_name?.toLowerCase().includes(tableSearch.toLowerCase()) ||
    b.batch_number?.toLowerCase().includes(tableSearch.toLowerCase())
  );

  const filteredLowStock = lowStock.filter(m => 
    m.name?.toLowerCase().includes(tableSearch.toLowerCase())
  );

  return (
    <>
      <div className="page-shell">
        <motion.div 
          className="hero-panel" 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.4 }}
        >
          <p style={{ fontSize: 13, color: 'var(--steel)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Megawide Drug Pharmacy</p>
          <h1 style={{ fontSize: 'clamp(1.4rem, 2.5vw, 1.8rem)', marginBottom: 8 }}>{getGreeting()}, {user?.full_name?.split(' ')[0] || 'there'}</h1>
          <p style={{ margin: 0, color: 'var(--ink-soft)', fontSize: 14, lineHeight: 1.5 }}>Live inventory health, expiry risk, and procurement insights in one view.</p>
        </motion.div>

        <div className="kpi-grid">
          <KPICard 
            icon={IconPill} 
            label="Medicines tracked" 
            value={summary?.total_medicines ?? 0} 
            color="green"
            loading={loading}
            trend={salesTrendPct}
          />
          <KPICard 
            icon={IconWallet} 
            label="Inventory value" 
            value={summary ? Number(summary.inventory_value) : 0} 
            prefix="₱"
            color="mint"
            loading={loading}
          />
          <KPICard 
            icon={IconAlertTriangle} 
            label="Expiring in 30 days" 
            value={summary?.expiring_soon ?? 0} 
            color="pink"
            loading={loading}
          />
          <KPICard 
            icon={IconPackageOff} 
            label="Low stock items" 
            value={summary?.low_stock ?? 0} 
            color="lavender"
            loading={loading}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 20, marginBottom: 20 }}>
          <ChartCard title="Stock by Category">
            {loading ? (
              <Skeleton height={280} radius={16} />
            ) : categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={PASTEL_COLORS[index % PASTEL_COLORS.length]} />
                  ))}
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="count"
                    labelLine={false}
                    animationBegin={prefersReducedMotion ? 0 : 200}
                    animationDuration={prefersReducedMotion ? 0 : 1000}
                  />
                  <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 24, fontWeight: 800, fill: 'var(--ink)' }}>
                    {categoryData.reduce((a, b) => a + b.count, 0)}
                  </text>
                  <text x="50%" y="58%" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 11, fontWeight: 600, fill: 'var(--steel)' }}>
                    Total Items
                  </text>
                  <Tooltip 
                    contentStyle={{ fontSize: 12, borderRadius: 12, border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)' }}
                    formatter={(value, name) => [value, name]}
                    itemStyle={{ color: 'var(--ink)' }}
                    labelStyle={{ color: 'var(--steel)' }}
                    cursor="pointer"
                  />
                  <Legend 
                    verticalAlign="bottom" 
                    height={24}
                    iconType="circle"
                    formatter={(value, entry) => (
                      <span style={{ fontSize: 12, color: 'var(--ink)', fontWeight: 500 }}>{value} ({entry.payload.count})</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--steel)' }}>
                No category data available
              </div>
            )}
          </ChartCard>

          <ChartCard title="Sales Trend (30 Days)" actions={salesTrendPct !== null && (
            <span className={`kpi-trend ${salesTrendPct > 0 ? 'up' : salesTrendPct < 0 ? 'down' : 'flat'}`}>
              {salesTrendPct > 0 ? '↑' : salesTrendPct < 0 ? '↓' : '→'} {Math.abs(salesTrendPct).toFixed(0)}%
            </span>
          )}>
            {loading ? (
              <Skeleton height={280} radius={16} />
            ) : trend.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 11, fill: 'var(--steel)' }} 
                    tickFormatter={(d) => d.slice(5)} 
                    axisLine={false} 
                    tickLine={false} 
                    minTickGap={30} 
                  />
                  <YAxis 
                    tick={{ fontSize: 11, fill: 'var(--steel)' }} 
                    axisLine={false} 
                    tickLine={false} 
                    width={30} 
                  />
                  <Tooltip 
                    contentStyle={{ fontSize: 12, borderRadius: 12, border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)' }}
                    cursor={{ fill: 'var(--bg-subtle)' }}
                  />
                  <Bar 
                    dataKey="units_sold" 
                    fill="var(--amber)" 
                    radius={[4, 4, 0, 0]}
                    animationBegin={prefersReducedMotion ? 0 : 200}
                    animationDuration={prefersReducedMotion ? 0 : 1000}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--steel)' }}>
                No sales data available
              </div>
            )}
          </ChartCard>
        </div>

        <ChartCard 
          title="Expiring Soon & Low Stock" 
          actions={
            <div style={{ display: 'flex', gap: 8 }}>
              <div className="filter-search" style={{ flex: '0 0 200px' }}>
                <IconSearch size={14} className="filter-search-icon" />
                <input 
                  placeholder="Search..." 
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                />
              </div>
              <button className="btn btn-secondary btn-icon">
                <IconFilter size={14} />
              </button>
            </div>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 20 }}>
            <div>
              <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'var(--steel)' }}>EXPIRING SOON</h4>
              {loading && [1, 2, 3].map((i) => <Skeleton key={i} height={40} style={{ marginBottom: 8 }} />)}
              {!loading && filteredExpiring.length === 0 && <p style={{ color: 'var(--steel)', fontSize: 13 }}>Nothing expiring in the next 30 days.</p>}
              {filteredExpiring.map((b) => (
                <motion.div 
                  key={b.id} 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: prefersReducedMotion ? 0 : 0.3 }}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{b.medicine_name}</div>
                    <span className="stamp" style={{ marginTop: 4 }}>{b.batch_number}</span>
                  </div>
                  <span className={`status-pill ${b.days_left <= 7 ? 'critical' : 'warning'}`} style={{ fontSize: 11 }}>
                    {b.days_left}d left
                  </span>
                </motion.div>
              ))}
            </div>

            <div>
              <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'var(--steel)' }}>LOW STOCK</h4>
              {loading && [1, 2, 3].map((i) => <Skeleton key={i} height={40} style={{ marginBottom: 8 }} />)}
              {!loading && filteredLowStock.length === 0 && <p style={{ color: 'var(--steel)', fontSize: 13 }}>All medicines are above their reorder level.</p>}
              {filteredLowStock.map((m) => (
                <motion.div 
                  key={m.id} 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: prefersReducedMotion ? 0 : 0.3 }}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}
                >
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{m.name}</div>
                  <span className="stamp">{m.total_remaining} / {m.reorder_level}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </ChartCard>
      </div>
    </>
  );
}
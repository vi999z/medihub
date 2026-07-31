import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { IconPill, IconVaccine, IconChartDonut, IconBellRinging } from '@tabler/icons-react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import AnimatedNumber from '../components/AnimatedNumber';
import TiltCard from '../components/TiltCard';
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
function IconBadge({ icon: Icon }) {
  return <div className="icon-badge"><Icon size={20} color="var(--ink)" stroke={1.8} /></div>;
}

const gridVariants = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };
const cardVariants = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } } };

export default function Dashboard() {
  const { user } = useAuth();
  const prefersReducedMotion = useReducedMotion();
  const [summary, setSummary] = useState(null);
  const [medicines, setMedicines] = useState([]);
  const [batches, setBatches] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [expiring, setExpiring] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const loading = summary === null;

  useEffect(() => {
    api.get('/reports/summary').then((r) => setSummary(r.data));
    api.get('/medicines').then((r) => setMedicines(r.data));
    api.get('/batches').then((r) => setBatches(r.data));
    api.get('/notifications?unread=true').then((r) => setNotifications(r.data));
    api.get('/reports/expiring-soon').then((r) => setExpiring(r.data));
    api.get('/reports/low-stock').then((r) => setLowStock(r.data));
  }, []);

  const categories = new Set(medicines.map((m) => m.category).filter(Boolean)).size;
  const rxCount = medicines.filter((m) => m.requires_prescription).length;
  const activeBatches = batches.filter((b) => b.status === 'active');

  const health = { safe: 0, warning: 0, critical: 0 };
  for (const b of activeBatches) {
    if (b.quantity_remaining <= 0) continue;
    const d = daysUntil(b.expiry_date);
    if (d <= 7) health.critical++;
    else if (d <= 30) health.warning++;
    else health.safe++;
  }

  const alertCounts = { critical: 0, warning: 0, info: 0 };
  for (const n of notifications) alertCounts[n.severity] = (alertCounts[n.severity] || 0) + 1;

  const cards = [
    { key: 'butter', icon: IconPill, label: 'Catalog', value: summary?.total_medicines ?? 0, prefix: '',
      breakdown: [[categories, 'categories'], [rxCount, 'Rx required']] },
    { key: 'blush', icon: IconVaccine, label: 'Inventory value', value: summary ? Number(summary.inventory_value) : 0, prefix: '₱',
      breakdown: [[activeBatches.length, 'active batches']] },
    { key: 'sage', icon: IconChartDonut, label: 'Stock health', value: activeBatches.length, prefix: '',
      breakdown: [[health.safe, 'safe'], [health.warning, 'watch'], [health.critical, 'critical']] },
    { key: 'sky', icon: IconBellRinging, label: 'Unread alerts', value: notifications.length, prefix: '',
      breakdown: [[alertCounts.critical || 0, 'critical'], [alertCounts.warning || 0, 'warning']] },
  ];

  return (
    <>
      <p className="greeting-eyebrow">Megawide Drug Pharmacy</p>
      <h1 className="greeting-title">{getGreeting()}, {user.full_name.split(' ')[0]}</h1>
      <p className="greeting-sub">
        {summary?.expiring_soon ?? 0} batches need attention this month, and {summary?.low_stock ?? 0} medicines are approaching their reorder point.
      </p>

      <motion.div className="bento-grid" variants={prefersReducedMotion ? undefined : gridVariants} initial="hidden" animate="show">
        {cards.map((c) => (
          <motion.div key={c.key} variants={prefersReducedMotion ? undefined : cardVariants}>
            <TiltCard className={`bento-card ${c.key}`}>
              <IconBadge icon={c.icon} />
              <div>
                <div className="bento-label">{c.label}</div>
                <div className="bento-value">
                  {loading ? <Skeleton width={70} height={30} /> : <AnimatedNumber value={c.value} prefix={c.prefix} />}
                </div>
              </div>
              <div className="bento-breakdown">
                {c.breakdown.map(([val, label]) => (
                  <div key={label}><strong>{loading ? '—' : val}</strong>{label}</div>
                ))}
              </div>
            </TiltCard>
          </motion.div>
        ))}
      </motion.div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 20 }}>
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 15, marginBottom: 14 }}>Expiring soon</h3>
          {loading && [1, 2, 3].map((i) => <Skeleton key={i} height={40} style={{ marginBottom: 8 }} />)}
          {!loading && expiring.length === 0 && <p style={{ color: 'var(--steel)', fontSize: 13 }}>Nothing expiring in the next 30 days.</p>}
          {expiring.map((b, i) => (
            <motion.div
              key={b.id}
              initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04, duration: 0.25 }}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}
            >
              <div>
                <div style={{ fontWeight: 500, fontSize: 13.5 }}>{b.medicine_name}</div>
                <span className="stamp" style={{ marginTop: 4 }}>{b.batch_number}</span>
              </div>
              <span className={`status-pill ${b.days_left <= 7 ? 'critical' : 'warning'}`}>{b.days_left} day{b.days_left === 1 ? '' : 's'} left</span>
            </motion.div>
          ))}
        </div>

        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 15, marginBottom: 14 }}>Low stock</h3>
          {loading && [1, 2, 3].map((i) => <Skeleton key={i} height={40} style={{ marginBottom: 8 }} />)}
          {!loading && lowStock.length === 0 && <p style={{ color: 'var(--steel)', fontSize: 13 }}>All medicines are above their reorder level.</p>}
          {lowStock.map((m, i) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04, duration: 0.25 }}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}
            >
              <div style={{ fontWeight: 500, fontSize: 13.5 }}>{m.name}</div>
              <span className="stamp">{m.total_remaining} / {m.reorder_level}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </>
  );
}
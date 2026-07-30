import { useEffect, useState } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

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

const Capsule = () => (
  <svg className="bento-shape" width="46" height="46" viewBox="0 0 46 46" fill="none">
    <rect x="6" y="18" width="34" height="14" rx="7" transform="rotate(-30 23 23)" stroke="var(--ink)" strokeWidth="2" />
    <line x1="17" y1="12" x2="24" y2="24" stroke="var(--ink)" strokeWidth="2" />
  </svg>
);
const Cross = () => (
  <svg className="bento-shape" width="40" height="40" viewBox="0 0 40 40" fill="none">
    <path d="M16 4h8v12h12v8H24v12h-8V24H4v-8h12V4z" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" />
  </svg>
);
const Blob = () => (
  <svg className="bento-shape" width="44" height="44" viewBox="0 0 44 44" fill="none">
    <path d="M22 4c9 0 16 6 16 15s-8 21-16 21S6 28 6 19 13 4 22 4z" stroke="var(--ink)" strokeWidth="2" />
  </svg>
);
const Bell = () => (
  <svg className="bento-shape" width="38" height="38" viewBox="0 0 38 38" fill="none">
    <path d="M19 6c-5 0-8 4-8 9v6l-3 5h22l-3-5v-6c0-5-3-9-8-9z" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" />
    <path d="M16 30a3 3 0 006 0" stroke="var(--ink)" strokeWidth="2" />
  </svg>
);

export default function Dashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [medicines, setMedicines] = useState([]);
  const [batches, setBatches] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [expiring, setExpiring] = useState([]);
  const [lowStock, setLowStock] = useState([]);

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

  return (
    <>
      <p className="greeting-eyebrow">Megawide Drug Pharmacy</p>
      <h1 className="greeting-title">{getGreeting()}, {user.full_name.split(' ')[0]}</h1>
      <p className="greeting-sub">
        {summary?.expiring_soon ?? 0} batches need attention this month, and {summary?.low_stock ?? 0} medicines are approaching their reorder point.
      </p>

      <div className="bento-grid">
        <div className="bento-card butter">
          <Capsule />
          <div>
            <div className="bento-label">Catalog</div>
            <div className="bento-value">{summary?.total_medicines ?? '—'}</div>
          </div>
          <div className="bento-breakdown">
            <div><strong>{categories}</strong>categories</div>
            <div><strong>{rxCount}</strong>Rx required</div>
          </div>
        </div>

        <div className="bento-card blush">
          <Cross />
          <div>
            <div className="bento-label">Inventory value</div>
            <div className="bento-value">₱{summary ? Number(summary.inventory_value).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}</div>
          </div>
          <div className="bento-breakdown">
            <div><strong>{activeBatches.length}</strong>active batches</div>
          </div>
        </div>

        <div className="bento-card sage">
          <Blob />
          <div>
            <div className="bento-label">Stock health</div>
            <div className="bento-value">{activeBatches.length}</div>
          </div>
          <div className="bento-breakdown">
            <div><strong>{health.safe}</strong>safe</div>
            <div><strong>{health.warning}</strong>watch</div>
            <div><strong>{health.critical}</strong>critical</div>
          </div>
        </div>

        <div className="bento-card sky">
          <Bell />
          <div>
            <div className="bento-label">Unread alerts</div>
            <div className="bento-value">{notifications.length}</div>
          </div>
          <div className="bento-breakdown">
            <div><strong>{alertCounts.critical || 0}</strong>critical</div>
            <div><strong>{alertCounts.warning || 0}</strong>warning</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 20 }}>
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 15, marginBottom: 14 }}>Expiring soon</h3>
          {expiring.length === 0 && <p style={{ color: 'var(--steel)', fontSize: 13 }}>Nothing expiring in the next 30 days.</p>}
          {expiring.map((b) => (
            <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 13.5 }}>{b.medicine_name}</div>
                <span className="stamp" style={{ marginTop: 4 }}>{b.batch_number}</span>
              </div>
              <span className={`status-pill ${b.days_left <= 7 ? 'critical' : 'warning'}`}>
                {b.days_left} day{b.days_left === 1 ? '' : 's'} left
              </span>
            </div>
          ))}
        </div>

        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 15, marginBottom: 14 }}>Low stock</h3>
          {lowStock.length === 0 && <p style={{ color: 'var(--steel)', fontSize: 13 }}>All medicines are above their reorder level.</p>}
          {lowStock.map((m) => (
            <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 500, fontSize: 13.5 }}>{m.name}</div>
              <span className="stamp">{m.total_remaining} / {m.reorder_level}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
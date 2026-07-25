import { useEffect, useState } from 'react';
import { Pill, Wallet, TriangleAlert, PackageX } from 'lucide-react';
import api from '../api/axios';

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [expiring, setExpiring] = useState([]);
  const [lowStock, setLowStock] = useState([]);

  useEffect(() => {
    api.get('/reports/summary').then((res) => setSummary(res.data));
    api.get('/reports/expiring-soon').then((res) => setExpiring(res.data));
    api.get('/reports/low-stock').then((res) => setLowStock(res.data));
  }, []);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Live snapshot of Megawide Drug Pharmacy inventory</p>
        </div>
      </div>

      <div className="stat-grid">
        <div className="card stat-card accent-amber">
          <div className="value">{summary?.total_medicines ?? '—'}</div>
          <div className="label"><Pill size={12} style={{ marginRight: 4, verticalAlign: -2 }} />Medicines tracked</div>
        </div>
        <div className="card stat-card accent-green">
          <div className="value">₱{summary ? Number(summary.inventory_value).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}</div>
          <div className="label"><Wallet size={12} style={{ marginRight: 4, verticalAlign: -2 }} />Inventory value</div>
        </div>
        <div className="card stat-card accent-gold">
          <div className="value">{summary?.expiring_soon ?? '—'}</div>
          <div className="label"><TriangleAlert size={12} style={{ marginRight: 4, verticalAlign: -2 }} />Batches expiring in 30 days</div>
        </div>
        <div className="card stat-card accent-red">
          <div className="value">{summary?.low_stock ?? '—'}</div>
          <div className="label"><PackageX size={12} style={{ marginRight: 4, verticalAlign: -2 }} />Medicines low on stock</div>
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
import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

function riskPill(score) {
  if (score >= 0.66) return 'critical';
  if (score >= 0.33) return 'warning';
  return 'safe';
}

const TABS = [
  { key: 'risk', label: 'Expiry risk' },
  { key: 'reorder', label: 'Reorder suggestions' },
  { key: 'anomalies', label: 'Anomalies' },
];

export default function AiInsights() {
  const { user } = useAuth();
  const [tab, setTab] = useState('risk');
  const [risk, setRisk] = useState([]);
  const [reorder, setReorder] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [training, setTraining] = useState(false);
  const [trainMsg, setTrainMsg] = useState('');

  async function fetchAll() {
    setLoading(true);
    const [r, ro, a] = await Promise.all([
      api.get('/ai/expiry-risk'),
      api.get('/ai/reorder-suggestions'),
      api.get('/ai/anomalies'),
    ]);
    setRisk(r.data); setReorder(ro.data); setAnomalies(a.data);
    setLoading(false);
  }

  useEffect(() => { fetchAll(); }, []);

  async function handleTrain() {
    setTraining(true); setTrainMsg('');
    try {
      const res = await api.post('/ai/train');
      setTrainMsg(res.data.trained ? `Model retrained on ${res.data.samples} resolved batches.` : res.data.reason);
      fetchAll();
    } catch (err) {
      setTrainMsg(err.response?.data?.error || 'Training failed');
    } finally {
      setTraining(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>AI Insights</h1>
          <p>Expiry risk, reorder timing, and transaction anomalies — computed from your real inventory data</p>
        </div>
        {user.role === 'admin' && (
          <button className="btn btn-secondary" onClick={handleTrain} disabled={training}>
            <RefreshCw size={14} className={training ? 'spin' : ''} /> {training ? 'Training…' : 'Retrain model'}
          </button>
        )}
      </div>

      {trainMsg && <p style={{ fontSize: 13, color: 'var(--steel)', marginBottom: 16 }}>{trainMsg}</p>}

      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="btn"
            style={{
              background: 'none', borderRadius: 0, padding: '10px 4px', marginRight: 20,
              borderBottom: tab === t.key ? '2px solid var(--amber)' : '2px solid transparent',
              color: tab === t.key ? 'var(--ink)' : 'var(--steel)', fontWeight: 600
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'risk' && (
        <div className="card">
          <table className="data-table">
            <thead><tr><th>Medicine</th><th>Batch</th><th>Days left</th><th>Qty</th><th>Sales/day</th><th>Risk</th></tr></thead>
            <tbody>
              {!loading && risk.map((d) => (
                <tr key={d.batch_id}>
                  <td style={{ fontWeight: 500 }}>{d.medicine_name}</td>
                  <td><span className="stamp">{d.batch_number}</span></td>
                  <td>{d.days_left}</td>
                  <td>{d.quantity_remaining}</td>
                  <td>{d.daily_velocity}</td>
                  <td><span className={`status-pill ${riskPill(d.risk_score)}`}>{(d.risk_score * 100).toFixed(0)}%</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && risk.length === 0 && <p style={{ padding: 20, color: 'var(--steel)', fontSize: 13 }}>No active batches to score.</p>}
        </div>
      )}

      {tab === 'reorder' && (
        <div className="card">
          <table className="data-table">
            <thead><tr><th>Medicine</th><th>Current stock</th><th>Avg demand/day</th><th>Days left</th><th>Trend</th><th>Suggested order</th></tr></thead>
            <tbody>
              {!loading && reorder.map((r) => (
                <tr key={r.medicine_id}>
                  <td style={{ fontWeight: 500 }}>{r.medicine_name}</td>
                  <td>{r.current_stock}</td>
                  <td>{r.avg_daily_demand}</td>
                  <td><span className={`status-pill ${r.days_of_stock_left <= 7 ? 'critical' : 'warning'}`}>{r.days_of_stock_left}d</span></td>
                  <td style={{ textTransform: 'capitalize' }}>{r.trend}</td>
                  <td><span className="stamp">{r.suggested_reorder_qty} units</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && reorder.length === 0 && <p style={{ padding: 20, color: 'var(--steel)', fontSize: 13 }}>No medicines need reordering soon.</p>}
        </div>
      )}

      {tab === 'anomalies' && (
        <div className="card">
          <table className="data-table">
            <thead><tr><th>Medicine</th><th>Batch</th><th>Type</th><th>Qty</th><th>Typical</th><th>Z-score</th><th>By</th></tr></thead>
            <tbody>
              {!loading && anomalies.map((a) => (
                <tr key={a.transaction_id}>
                  <td style={{ fontWeight: 500 }}>{a.medicine_name}</td>
                  <td><span className="stamp">{a.batch_number}</span></td>
                  <td style={{ textTransform: 'capitalize' }}>{a.transaction_type}</td>
                  <td>{a.quantity}</td>
                  <td>{a.typical_magnitude}</td>
                  <td><span className="status-pill critical">{a.z_score}σ</span></td>
                  <td>{a.user_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && anomalies.length === 0 && <p style={{ padding: 20, color: 'var(--steel)', fontSize: 13 }}>No anomalies detected in the last 30 days.</p>}
        </div>
      )}
    </>
  );
}
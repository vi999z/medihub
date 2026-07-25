import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

function riskPill(score) {
  if (score >= 0.66) return 'critical';
  if (score >= 0.33) return 'warning';
  return 'safe';
}

export default function AiInsights() {
  const { user } = useAuth();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [training, setTraining] = useState(false);
  const [trainMsg, setTrainMsg] = useState('');

  async function fetchRisk() {
    setLoading(true);
    const res = await api.get('/ai/expiry-risk');
    setData(res.data);
    setLoading(false);
  }

  useEffect(() => { fetchRisk(); }, []);

  async function handleTrain() {
    setTraining(true);
    setTrainMsg('');
    try {
      const res = await api.post('/ai/train');
      setTrainMsg(res.data.trained ? `Model retrained on ${res.data.samples} resolved batches.` : res.data.reason);
      fetchRisk();
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
          <p>Expiry-risk score per active batch — higher means more likely to expire unsold</p>
        </div>
        {user.role === 'admin' && (
          <button className="btn btn-secondary" onClick={handleTrain} disabled={training}>
            <RefreshCw size={14} className={training ? 'spin' : ''} /> {training ? 'Training…' : 'Retrain model'}
          </button>
        )}
      </div>

      {trainMsg && <p style={{ fontSize: 13, color: 'var(--steel)', marginBottom: 16 }}>{trainMsg}</p>}

      <div className="card">
        <table className="data-table">
          <thead>
            <tr><th>Medicine</th><th>Batch</th><th>Days left</th><th>Qty</th><th>Sales/day</th><th>Risk</th><th>Method</th></tr>
          </thead>
          <tbody>
            {!loading && data.map((d) => (
              <tr key={d.batch_id}>
                <td style={{ fontWeight: 500 }}>{d.medicine_name}</td>
                <td><span className="stamp">{d.batch_number}</span></td>
                <td>{d.days_left}</td>
                <td>{d.quantity_remaining}</td>
                <td>{d.daily_velocity}</td>
                <td><span className={`status-pill ${riskPill(d.risk_score)}`}>{(d.risk_score * 100).toFixed(0)}%</span></td>
                <td style={{ fontSize: 12, color: 'var(--steel)', textTransform: 'capitalize' }}>{d.method}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && data.length === 0 && (
          <p style={{ padding: 20, color: 'var(--steel)', fontSize: 13 }}>No active batches to score yet.</p>
        )}
      </div>
    </>
  );
}
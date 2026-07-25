import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import api from '../api/axios';

const TYPES = ['sale', 'adjustment', 'disposal', 'return'];

export default function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [batches, setBatches] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ batch_id: '', transaction_type: 'sale', quantity: '', reason: '' });
  const [error, setError] = useState('');

  async function fetchAll() {
    const [t, b] = await Promise.all([api.get('/transactions/recent'), api.get('/batches')]);
    setTransactions(t.data);
    setBatches(b.data.filter((batch) => batch.status === 'active'));
  }

  useEffect(() => { fetchAll(); }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/transactions', form);
      setForm({ batch_id: '', transaction_type: 'sale', quantity: '', reason: '' });
      setShowForm(false);
      fetchAll();
    } catch (err) {
      setError(err.response?.data?.error || 'Transaction failed');
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Transactions</h1>
          <p>Stock movement log — sales, adjustments, disposals, returns</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          <Plus size={15} /> Record transaction
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card" style={{ padding: 20, marginBottom: 20, display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
          <div className="field">
            <label>Batch</label>
            <select value={form.batch_id} onChange={(e) => setForm({ ...form, batch_id: e.target.value })} required>
              <option value="">Select a batch</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>{b.medicine_name} — {b.batch_number} ({b.quantity_remaining} left)</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Type</label>
            <select value={form.transaction_type} onChange={(e) => setForm({ ...form, transaction_type: e.target.value })}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="field"><label>Quantity</label><input type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required /></div>
          <div className="field"><label>Reason (optional)</label><input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
          <div style={{ gridColumn: 'span 2', display: 'flex', gap: 10 }}>
            <button type="submit" className="btn btn-primary">Save transaction</button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
          {error && <p className="error-text" style={{ gridColumn: 'span 2' }}>{error}</p>}
        </form>
      )}

      <div className="card">
        <table className="data-table">
          <thead>
            <tr><th>Date</th><th>Medicine</th><th>Batch</th><th>Type</th><th>Qty</th><th>By</th></tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <tr key={t.id}>
                <td>{new Date(t.created_at).toLocaleString()}</td>
                <td style={{ fontWeight: 500 }}>{t.medicine_name}</td>
                <td><span className="stamp">{t.batch_number}</span></td>
                <td style={{ textTransform: 'capitalize' }}>{t.transaction_type}</td>
                <td style={{ color: t.quantity < 0 ? 'var(--red)' : 'var(--green)' }}>{t.quantity > 0 ? `+${t.quantity}` : t.quantity}</td>
                <td>{t.user_name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import api from '../api/axios';

function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(dateStr) - today) / 86400000);
}

function statusPillFor(batch) {
  if (batch.status === 'expired') return { cls: 'critical', label: 'Expired' };
  if (batch.status === 'depleted') return { cls: 'warning', label: 'Depleted' };
  if (batch.status === 'recalled') return { cls: 'critical', label: 'Recalled' };
  const days = daysUntil(batch.expiry_date);
  if (days <= 7) return { cls: 'critical', label: `${days}d left` };
  if (days <= 30) return { cls: 'warning', label: `${days}d left` };
  return { cls: 'safe', label: 'Active' };
}

export default function Batches() {
  const [batches, setBatches] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    medicine_id: '', batch_number: '', quantity_received: '',
    cost_price: '', selling_price: '', manufacture_date: '', expiry_date: ''
  });
  const [error, setError] = useState('');

  async function fetchAll() {
    const [b, m] = await Promise.all([api.cachedGet('/batches'), api.cachedGet('/medicines')]);
    setBatches(b.data);
    setMedicines(m.data);
  }

  useEffect(() => { fetchAll(); }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/batches', form);
      api.invalidateCache('/batches');
      api.invalidateCache('/medicines');
      setForm({ medicine_id: '', batch_number: '', quantity_received: '', cost_price: '', selling_price: '', manufacture_date: '', expiry_date: '' });
      setShowForm(false);
      fetchAll();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create batch');
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Batches</h1>
          <p>{batches.length} batches on record, sorted by nearest expiry</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          <Plus size={15} /> Receive stock
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card" style={{ padding: 20, marginBottom: 20, display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
          <div className="field">
            <label>Medicine</label>
            <select value={form.medicine_id} onChange={(e) => setForm({ ...form, medicine_id: e.target.value })} required>
              <option value="">Select a medicine</option>
              {medicines.map((m) => (
                <option key={m.id} value={m.id}>{m.name} {m.strength ? `(${m.strength})` : ''}</option>
              ))}
            </select>
          </div>
          <div className="field"><label>Batch number</label><input value={form.batch_number} onChange={(e) => setForm({ ...form, batch_number: e.target.value })} required /></div>
          <div className="field"><label>Quantity received</label><input type="number" min="1" value={form.quantity_received} onChange={(e) => setForm({ ...form, quantity_received: e.target.value })} required /></div>
          <div className="field"><label>Expiry date</label><input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} required /></div>
          <div className="field"><label>Manufacture date</label><input type="date" value={form.manufacture_date} onChange={(e) => setForm({ ...form, manufacture_date: e.target.value })} /></div>
          <div className="field"><label>Cost price</label><input type="number" step="0.01" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} /></div>
          <div className="field"><label>Selling price</label><input type="number" step="0.01" value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: e.target.value })} /></div>
          <div style={{ gridColumn: 'span 2', display: 'flex', gap: 10 }}>
            <button type="submit" className="btn btn-primary">Save batch</button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
          {error && <p className="error-text" style={{ gridColumn: 'span 2' }}>{error}</p>}
        </form>
      )}

      <div className="card">
        <table className="data-table">
          <thead>
            <tr><th>Medicine</th><th>Batch</th><th>Expiry</th><th>Remaining</th><th>Status</th></tr>
          </thead>
          <tbody>
            {batches.map((b) => {
              const pill = statusPillFor(b);
              return (
                <tr key={b.id}>
                  <td style={{ fontWeight: 500 }}>{b.medicine_name}</td>
                  <td><span className="stamp">{b.batch_number}</span></td>
                  <td><span className="stamp">{new Date(b.expiry_date).toLocaleDateString()}</span></td>
                  <td>{b.quantity_remaining}</td>
                  <td><span className={`status-pill ${pill.cls}`}>{pill.label}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
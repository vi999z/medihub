import { useEffect, useState } from 'react';
import { Plus, Trash2, Pencil, Download } from 'lucide-react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { downloadCsv } from '../utils/csv';

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
  const { user } = useAuth();
  const { addToast } = useToast();
  const [batches, setBatches] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    medicine_id: '', supplier_id: '', batch_number: '', quantity_received: '',
    quantity_remaining: '', cost_price: '', selling_price: '', manufacture_date: '', expiry_date: '', status: 'active'
  });
  const [error, setError] = useState('');

  async function fetchAll() {
    const [b, m, s] = await Promise.all([api.cachedGet('/batches'), api.cachedGet('/medicines'), api.cachedGet('/suppliers')]);
    setBatches(b.data);
    setMedicines(m.data);
    setSuppliers(s.data);
  }

  useEffect(() => { fetchAll(); }, []);

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setForm({
      medicine_id: '', supplier_id: '', batch_number: '', quantity_received: '',
      quantity_remaining: '', cost_price: '', selling_price: '', manufacture_date: '', expiry_date: '', status: 'active'
    });
  }

  function openEdit(batch) {
    setEditingId(batch.id);
    setForm({
      medicine_id: batch.medicine_id || '',
      supplier_id: batch.supplier_id || '',
      batch_number: batch.batch_number || '',
      quantity_received: batch.quantity_received ?? '',
      quantity_remaining: batch.quantity_remaining ?? '',
      cost_price: batch.cost_price ?? '',
      selling_price: batch.selling_price ?? '',
      manufacture_date: batch.manufacture_date ? String(batch.manufacture_date).slice(0, 10) : '',
      expiry_date: batch.expiry_date ? String(batch.expiry_date).slice(0, 10) : '',
      status: batch.status || 'active'
    });
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      if (editingId) {
        await api.put(`/batches/${editingId}`, form);
        addToast('Batch updated', 'success');
      } else {
        await api.post('/batches', form);
        addToast('Batch received', 'success');
      }
      api.invalidateCache('/batches');
      api.invalidateCache('/medicines');
      resetForm();
      await fetchAll();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save batch');
    }
  }

  async function handleRemoveDepleted() {
    if (!window.confirm('Remove all batches that are already depleted?')) return;
    try {
      const res = await api.delete('/batches/depleted');
      api.invalidateCache('/batches');
      await fetchAll();
      addToast(res.data.message || 'Depleted batches removed', 'success');
    } catch (err) {
      addToast(err.response?.data?.error || 'Could not remove depleted batches', 'error');
    }
  }

  function handleExport() {
    const rows = batches.map((batch) => ({
      id: batch.id,
      medicine: batch.medicine_name,
      batch_number: batch.batch_number,
      supplier: batch.supplier_name || '—',
      quantity_remaining: batch.quantity_remaining,
      expiry_date: batch.expiry_date,
      status: batch.status,
      selling_price: batch.selling_price || ''
    }));
    downloadCsv('batches.csv', rows, ['id', 'medicine', 'batch_number', 'supplier', 'quantity_remaining', 'expiry_date', 'status', 'selling_price']);
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Batches</h1>
          <p>{batches.length} batches on record, sorted by nearest expiry</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={handleExport}>
            <Download size={15} /> Export CSV
          </button>
          {user.role === 'admin' && (
            <button className="btn btn-secondary" onClick={handleRemoveDepleted}>
              <Trash2 size={15} /> Remove depleted
            </button>
          )}
          <button className="btn btn-primary" onClick={() => showForm ? resetForm() : setShowForm(true)}>
            <Plus size={15} /> {showForm ? 'Close form' : 'Receive stock'}
          </button>
        </div>
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
          <div className="field">
            <label>Supplier</label>
            <select value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}>
              <option value="">No supplier</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
              ))}
            </select>
          </div>
          <div className="field"><label>Batch number</label><input value={form.batch_number} onChange={(e) => setForm({ ...form, batch_number: e.target.value })} required /></div>
          <div className="field"><label>Quantity received</label><input type="number" min="1" value={form.quantity_received} onChange={(e) => setForm({ ...form, quantity_received: e.target.value })} required /></div>
          <div className="field"><label>Remaining quantity</label><input type="number" min="0" value={form.quantity_remaining} onChange={(e) => setForm({ ...form, quantity_remaining: e.target.value })} /></div>
          <div className="field"><label>Expiry date</label><input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} required /></div>
          <div className="field"><label>Manufacture date</label><input type="date" value={form.manufacture_date} onChange={(e) => setForm({ ...form, manufacture_date: e.target.value })} /></div>
          <div className="field"><label>Cost price</label><input type="number" step="0.01" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} /></div>
          <div className="field"><label>Selling price</label><input type="number" step="0.01" value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: e.target.value })} /></div>
          <div className="field"><label>Status</label><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="active">Active</option><option value="recalled">Recalled</option><option value="depleted">Depleted</option><option value="expired">Expired</option></select></div>
          <div style={{ gridColumn: 'span 2', display: 'flex', gap: 10 }}>
            <button type="submit" className="btn btn-primary">{editingId ? 'Update batch' : 'Save batch'}</button>
            <button type="button" className="btn btn-secondary" onClick={resetForm}>Cancel</button>
          </div>
          {error && <p className="error-text" style={{ gridColumn: 'span 2' }}>{error}</p>}
        </form>
      )}

      <div className="card">
        <table className="data-table">
          <thead>
            <tr><th>Medicine</th><th>Batch</th><th>Expiry</th><th>Remaining</th><th>Status</th><th>Actions</th></tr>
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
                  <td>
                    <button className="btn-icon" onClick={() => openEdit(b)} title="Edit batch"><Pencil size={14} /></button>
                    <button className="btn-icon" onClick={async () => {
                      if (!window.confirm(`Delete batch ${b.batch_number}?`)) return;
                      try {
                        await api.delete(`/batches/${b.id}`);
                        api.invalidateCache('/batches');
                        await fetchAll();
                        addToast('Batch deleted', 'success');
                      } catch (err) {
                        addToast(err.response?.data?.error || 'Could not delete batch', 'error');
                      }
                    }} title="Delete batch"><Trash2 size={14} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
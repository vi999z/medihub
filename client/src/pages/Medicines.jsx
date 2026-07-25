import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

export default function Medicines() {
  const { user } = useAuth();
  const [medicines, setMedicines] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '', generic_name: '', category: '', dosage_form: '',
    strength: '', unit: '', reorder_level: 10, requires_prescription: false
  });
  const [error, setError] = useState('');

  async function fetchMedicines() {
    const res = await api.get('/medicines');
    setMedicines(res.data);
  }

  useEffect(() => { fetchMedicines(); }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/medicines', form);
      setForm({ name: '', generic_name: '', category: '', dosage_form: '', strength: '', unit: '', reorder_level: 10, requires_prescription: false });
      setShowForm(false);
      fetchMedicines();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create medicine');
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Medicines</h1>
          <p>{medicines.length} products in the catalog</p>
        </div>
        {user.role === 'admin' && (
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
            <Plus size={15} /> Add medicine
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card" style={{ padding: 20, marginBottom: 20, display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
          <div className="field"><label>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
          <div className="field"><label>Generic name</label><input value={form.generic_name} onChange={(e) => setForm({ ...form, generic_name: e.target.value })} /></div>
          <div className="field"><label>Category</label><input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
          <div className="field"><label>Dosage form</label><input value={form.dosage_form} onChange={(e) => setForm({ ...form, dosage_form: e.target.value })} /></div>
          <div className="field"><label>Strength</label><input value={form.strength} onChange={(e) => setForm({ ...form, strength: e.target.value })} /></div>
          <div className="field"><label>Unit</label><input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} required /></div>
          <div className="field"><label>Reorder level</label><input type="number" value={form.reorder_level} onChange={(e) => setForm({ ...form, reorder_level: e.target.value })} /></div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
            <input type="checkbox" checked={form.requires_prescription} onChange={(e) => setForm({ ...form, requires_prescription: e.target.checked })} />
            Requires prescription
          </label>
          <div style={{ gridColumn: 'span 2', display: 'flex', gap: 10 }}>
            <button type="submit" className="btn btn-primary">Save medicine</button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
          {error && <p className="error-text" style={{ gridColumn: 'span 2' }}>{error}</p>}
        </form>
      )}

      <div className="card">
        <table className="data-table">
          <thead>
            <tr><th>Name</th><th>Category</th><th>Strength</th><th>Unit</th><th>Reorder level</th></tr>
          </thead>
          <tbody>
            {medicines.map((m) => (
              <tr key={m.id}>
                <td style={{ fontWeight: 500 }}>{m.name}</td>
                <td>{m.category || '—'}</td>
                <td><span className="stamp">{m.strength || '—'}</span></td>
                <td>{m.unit}</td>
                <td>{m.reorder_level}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
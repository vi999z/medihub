import { useEffect, useState } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

export default function Medicines() {
  const { user } = useAuth();
  const [medicines, setMedicines] = useState([]);
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
      fetchMedicines();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create medicine');
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: '40px auto', fontFamily: 'sans-serif' }}>
      <h2>Medicines</h2>

      {user.role === 'admin' && (
        <form onSubmit={handleSubmit} style={{ marginBottom: 30, display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
          <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input placeholder="Generic name" value={form.generic_name} onChange={(e) => setForm({ ...form, generic_name: e.target.value })} />
          <input placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <input placeholder="Dosage form" value={form.dosage_form} onChange={(e) => setForm({ ...form, dosage_form: e.target.value })} />
          <input placeholder="Strength" value={form.strength} onChange={(e) => setForm({ ...form, strength: e.target.value })} />
          <input placeholder="Unit (box, bottle...)" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} required />
          <input type="number" placeholder="Reorder level" value={form.reorder_level} onChange={(e) => setForm({ ...form, reorder_level: e.target.value })} />
          <label>
            <input type="checkbox" checked={form.requires_prescription} onChange={(e) => setForm({ ...form, requires_prescription: e.target.checked })} />
            {' '}Requires prescription
          </label>
          <button type="submit" style={{ gridColumn: 'span 2', padding: 10 }}>Add Medicine</button>
          {error && <p style={{ color: 'red', gridColumn: 'span 2' }}>{error}</p>}
        </form>
      )}

      <table border="1" cellPadding="8" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th>Name</th><th>Category</th><th>Strength</th><th>Unit</th><th>Reorder Level</th>
          </tr>
        </thead>
        <tbody>
          {medicines.map((m) => (
            <tr key={m.id}>
              <td>{m.name}</td><td>{m.category}</td><td>{m.strength}</td><td>{m.unit}</td><td>{m.reorder_level}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
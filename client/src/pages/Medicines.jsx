import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, RefreshCw, Download, Layers3 } from 'lucide-react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { downloadCsv } from '../utils/csv';

const CATEGORY_OPTIONS = [
  'Anti-inflammatory', 'Antibiotic', 'Antihistamine', 'Analgesic', 'Antacid', 'Antiemetic', 'Antipyretic',
  'Antifungal', 'Antiviral', 'Cardiovascular', 'Respiratory', 'Dermatology', 'Gastrointestinal',
  'Vitamins & Supplements', 'Hormonal', 'Diagnostic', 'Other'
];

const emptyForm = {
  name: '', generic_name: '', category: 'Other', dosage_form: '',
  strength: '', unit: '', reorder_level: 10, requires_prescription: false
};

export default function Medicines() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [medicines, setMedicines] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  }

  async function fetchMedicines() {
    const res = await api.cachedGet('/medicines');
    setMedicines(res.data);
  }

  useEffect(() => { fetchMedicines(); }, []);

  function openCreate() {
    resetForm();
    setShowForm(true);
  }

  const groupedMedicines = useMemo(() => {
    const normalized = medicines.filter((medicine) => activeCategory === 'All' || (medicine.category || 'Other') === activeCategory);
    return normalized.reduce((acc, medicine) => {
      const category = medicine.category || 'Other';
      if (!acc[category]) acc[category] = [];
      acc[category].push(medicine);
      return acc;
    }, {});
  }, [medicines, activeCategory]);

  function openEdit(medicine) {
    setEditingId(medicine.id);
    setForm({
      name: medicine.name || '',
      generic_name: medicine.generic_name || '',
      category: medicine.category || '',
      dosage_form: medicine.dosage_form || '',
      strength: medicine.strength || '',
      unit: medicine.unit || '',
      reorder_level: medicine.reorder_level || 10,
      requires_prescription: Boolean(medicine.requires_prescription)
    });
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      if (editingId) {
        await api.put(`/medicines/${editingId}`, form);
        addToast('Medicine updated', 'success');
      } else {
        await api.post('/medicines', form);
        addToast('Medicine added', 'success');
      }
      api.invalidateCache('/medicines');
      resetForm();
      await fetchMedicines();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save medicine');
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this medicine from the catalog?')) return;
    try {
      await api.delete(`/medicines/${id}`);
      api.invalidateCache('/medicines');
      api.invalidateCache('/notifications');
      api.invalidateCache('/notifications?unread=true');
      api.invalidateCache('/batches');
      await fetchMedicines();
      addToast('Medicine deleted', 'success');
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to delete medicine', 'error');
    }
  }

  async function handleRefresh() {
    api.invalidateCache('/medicines');
    await fetchMedicines();
    addToast('Catalog refreshed', 'success');
  }

  function handleExport() {
    const rows = medicines.map((medicine) => ({
      id: medicine.id,
      name: medicine.name,
      generic_name: medicine.generic_name || '',
      category: medicine.category || '',
      dosage_form: medicine.dosage_form || '',
      strength: medicine.strength || '',
      unit: medicine.unit || '',
      reorder_level: medicine.reorder_level || '',
      requires_prescription: medicine.requires_prescription ? 'Yes' : 'No'
    }));
    downloadCsv('medicines.csv', rows, ['id', 'name', 'generic_name', 'category', 'dosage_form', 'strength', 'unit', 'reorder_level', 'requires_prescription']);
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Medicines</h1>
          <p>{medicines.length} products in the catalog</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={handleExport}>
            <Download size={15} /> Export CSV
          </button>
          <button className="btn btn-secondary" onClick={handleRefresh}>
            <RefreshCw size={15} /> Refresh
          </button>
          {user.role === 'admin' && (
            <button className="btn btn-primary" onClick={openCreate}>
              <Plus size={15} /> Add medicine
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card" style={{ padding: 20, marginBottom: 20, display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
          <div className="field"><label>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
          <div className="field"><label>Generic name</label><input value={form.generic_name} onChange={(e) => setForm({ ...form, generic_name: e.target.value })} /></div>
          <div className="field">
            <label>Category</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
          <div className="field"><label>Dosage form</label><input value={form.dosage_form} onChange={(e) => setForm({ ...form, dosage_form: e.target.value })} /></div>
          <div className="field"><label>Strength</label><input value={form.strength} onChange={(e) => setForm({ ...form, strength: e.target.value })} /></div>
          <div className="field"><label>Unit</label><input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} required /></div>
          <div className="field"><label>Reorder level</label><input type="number" value={form.reorder_level} onChange={(e) => setForm({ ...form, reorder_level: e.target.value })} /></div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
            <input type="checkbox" checked={form.requires_prescription} onChange={(e) => setForm({ ...form, requires_prescription: e.target.checked })} />
            Requires prescription
          </label>
          <div style={{ gridColumn: 'span 2', display: 'flex', gap: 10 }}>
            <button type="submit" className="btn btn-primary">{editingId ? 'Update medicine' : 'Save medicine'}</button>
            <button type="button" className="btn btn-secondary" onClick={resetForm}>Cancel</button>
          </div>
          {error && <p className="error-text" style={{ gridColumn: 'span 2' }}>{error}</p>}
        </form>
      )}

      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Layers3 size={16} color="var(--amber)" />
          <strong style={{ fontSize: 13 }}>Browse by category</strong>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          <button className={`btn ${activeCategory === 'All' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveCategory('All')} type="button">All</button>
          {CATEGORY_OPTIONS.map((category) => (
            <button key={category} className={`btn ${activeCategory === category ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveCategory(category)} type="button">{category}</button>
          ))}
        </div>

        {Object.entries(groupedMedicines).map(([category, items]) => (
          <div key={category} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--steel)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{category}</div>
            <table className="data-table">
              <thead>
                <tr><th>Name</th><th>Strength</th><th>Unit</th><th>Reorder level</th>{user.role === 'admin' && <th>Actions</th>}</tr>
              </thead>
              <tbody>
                {items.map((m) => (
                  <tr key={m.id}>
                    <td style={{ fontWeight: 500 }}>{m.name}</td>
                    <td><span className="stamp">{m.strength || '—'}</span></td>
                    <td>{m.unit}</td>
                    <td>{m.reorder_level}</td>
                    {user.role === 'admin' && (
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn-icon" onClick={() => openEdit(m)} title="Edit medicine"><Pencil size={14} /></button>
                          <button className="btn-icon" onClick={() => handleDelete(m.id)} title="Delete medicine"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </>
  );
}
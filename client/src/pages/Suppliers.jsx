import { useEffect, useState } from 'react';
import { Plus, Trash2, RefreshCw } from 'lucide-react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function Suppliers() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [suppliers, setSuppliers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', contact_person: '', phone: '', email: '', address: '' });

  async function fetchAll() {
    const res = await api.cachedGet('/suppliers');
    setSuppliers(res.data);
  }

  useEffect(() => { fetchAll(); }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      await api.post('/suppliers', form);
      api.invalidateCache('/suppliers');
      setForm({ name: '', contact_person: '', phone: '', email: '', address: '' });
      setShowForm(false);
      await fetchAll();
      addToast('Supplier added', 'success');
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to add supplier', 'error');
    }
  }

  async function handleDelete(id) {
    if (!confirm('Remove this supplier?')) return;
    await api.delete(`/suppliers/${id}`);
    api.invalidateCache('/suppliers');
    await fetchAll();
    addToast('Supplier removed', 'success');
  }

  async function handleRefresh() {
    api.invalidateCache('/suppliers');
    await fetchAll();
    addToast('Supplier list refreshed', 'success');
  }

  return (
    <>
      <div className="page-header">
        <div><h1>Suppliers</h1><p>{suppliers.length} suppliers on file</p></div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={handleRefresh}><RefreshCw size={15} /> Refresh</button>
          {user.role === 'admin' && (
            <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}><Plus size={15} /> Add supplier</button>
          )}
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card" style={{ padding: 20, marginBottom: 20, display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
          <div className="field"><label>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
          <div className="field"><label>Contact person</label><input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></div>
          <div className="field"><label>Phone</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div className="field"><label>Email</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="field" style={{ gridColumn: 'span 2' }}><label>Address</label><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div style={{ gridColumn: 'span 2', display: 'flex', gap: 10 }}>
            <button type="submit" className="btn btn-primary">Save supplier</button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="card">
        <table className="data-table">
          <thead><tr><th>Name</th><th>Contact</th><th>Phone</th><th>Email</th>{user.role === 'admin' && <th></th>}</tr></thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.id}>
                <td style={{ fontWeight: 500 }}>{s.name}</td>
                <td>{s.contact_person || '—'}</td>
                <td>{s.phone || '—'}</td>
                <td>{s.email || '—'}</td>
                {user.role === 'admin' && (
                  <td><button className="btn-icon" onClick={() => handleDelete(s.id)}><Trash2 size={14} /></button></td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {suppliers.length === 0 && <p style={{ padding: 20, color: 'var(--steel)', fontSize: 13 }}>No suppliers yet. Add your first one above.</p>}
      </div>
    </>
  );
}
import { useEffect, useState } from 'react';
import { Plus, Trash2, RefreshCw, Pencil, Download } from 'lucide-react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { downloadCsv } from '../utils/csv';

export default function Suppliers() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [suppliers, setSuppliers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: '', contact_person: '', phone: '', email: '', address: '' });

  async function fetchAll() {
    const res = await api.cachedGet('/suppliers');
    setSuppliers(res.data);
  }

  useEffect(() => { fetchAll(); }, []);

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setForm({ name: '', contact_person: '', phone: '', email: '', address: '' });
  }

  function openEdit(supplier) {
    setEditingId(supplier.id);
    setForm({
      name: supplier.name || '',
      contact_person: supplier.contact_person || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      address: supplier.address || ''
    });
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      if (editingId) {
        await api.put(`/suppliers/${editingId}`, form);
        addToast('Supplier updated', 'success');
      } else {
        await api.post('/suppliers', form);
        addToast('Supplier added', 'success');
      }
      api.invalidateCache('/suppliers');
      resetForm();
      await fetchAll();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to save supplier', 'error');
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

  function handleExport() {
    const rows = suppliers.map((supplier) => ({
      id: supplier.id,
      name: supplier.name,
      contact_person: supplier.contact_person || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      address: supplier.address || ''
    }));
    downloadCsv('suppliers.csv', rows, ['id', 'name', 'contact_person', 'phone', 'email', 'address']);
  }

  return (
    <>
      <div className="page-header">
        <div><h1>Suppliers</h1><p>{suppliers.length} suppliers on file</p></div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={handleExport}><Download size={15} /> Export CSV</button>
          <button className="btn btn-secondary" onClick={handleRefresh}><RefreshCw size={15} /> Refresh</button>
          {user.role === 'admin' && (
            <button className="btn btn-primary" onClick={() => showForm ? resetForm() : setShowForm(true)}><Plus size={15} /> {showForm ? 'Close form' : 'Add supplier'}</button>
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
            <button type="submit" className="btn btn-primary">{editingId ? 'Update supplier' : 'Save supplier'}</button>
            <button type="button" className="btn btn-secondary" onClick={resetForm}>Cancel</button>
          </div>
        </form>
      )}

      <div className="card">
        <table className="data-table">
          <thead><tr><th>Name</th><th>Contact</th><th>Phone</th><th>Email</th>{user.role === 'admin' && <th>Actions</th>}</tr></thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.id}>
                <td style={{ fontWeight: 500 }}>{s.name}</td>
                <td>{s.contact_person || '—'}</td>
                <td>{s.phone || '—'}</td>
                <td>{s.email || '—'}</td>
                {user.role === 'admin' && (
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn-icon" onClick={() => openEdit(s)} title="Edit supplier"><Pencil size={14} /></button>
                      <button className="btn-icon" onClick={() => handleDelete(s.id)} title="Delete supplier"><Trash2 size={14} /></button>
                    </div>
                  </td>
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
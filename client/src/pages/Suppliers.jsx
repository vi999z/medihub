import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, RefreshCw, Pencil, Download, Search, X, Upload } from 'lucide-react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { downloadCsv } from '../utils/csv';
import Modal from '../components/Modal';
import CsvImportModal from '../components/CsvImportModal';

export default function Suppliers() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ name: '', contact_person: '', phone: '', email: '', address: '' });

  async function fetchAll() {
    try {
      const res = await api.cachedGet('/suppliers');
      setSuppliers(res.data || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchAll(); }, []);

  const visibleSuppliers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return suppliers;
    return suppliers.filter((supplier) => [supplier.name, supplier.contact_person, supplier.phone, supplier.email, supplier.address]
      .some((value) => String(value || '').toLowerCase().includes(term)));
  }, [suppliers, search]);

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
    if (!window.confirm('Remove this supplier?')) return;
    try {
      await api.delete(`/suppliers/${id}`);
      api.invalidateCache('/suppliers');
      await fetchAll();
      addToast('Supplier removed', 'success');
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to remove supplier', 'error');
    }
  }

  async function handleRefresh() {
    api.invalidateCache('/suppliers');
    await fetchAll();
    addToast('Supplier list refreshed', 'success');
  }

  function handleExport() {
    const rows = visibleSuppliers.map((supplier) => ({
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
        <div>
          <h1>Suppliers</h1>
          <p>{loading ? 'Loading suppliers…' : `${visibleSuppliers.length} of ${suppliers.length} suppliers shown`}</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={handleExport}><Download size={15} /> Export CSV</button>
          {user.role === 'admin' && (
            <button className="btn btn-secondary" onClick={() => setShowImport(true)}><Upload size={15} /> Import CSV</button>
          )}
          <button className="btn btn-secondary" onClick={handleRefresh}><RefreshCw size={15} /> Refresh</button>
          {user.role === 'admin' && (
            <button className="btn btn-primary" onClick={() => showForm ? resetForm() : setShowForm(true)}><Plus size={15} /> {showForm ? 'Close form' : 'Add supplier'}</button>
          )}
        </div>
      </div>

      <CsvImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        type="suppliers"
        onImported={() => {
          api.invalidateCache('/suppliers');
          fetchAll();
        }}
      />

      <Modal
        open={showForm}
        onClose={resetForm}
        icon={Plus}
        title={editingId ? 'Edit supplier' : 'Add supplier'}
        subtitle={editingId ? 'Update this supplier’s details.' : 'Add a new supplier to your network.'}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={resetForm}>Cancel</button>
            <button type="submit" form="supplier-form" className="btn btn-primary">{editingId ? 'Update supplier' : 'Save supplier'}</button>
          </>
        }
      >
        <form id="supplier-form" onSubmit={handleSubmit} className="form-grid">
          <div className="field"><label>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
          <div className="field"><label>Contact person</label><input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></div>
          <div className="field"><label>Phone</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div className="field"><label>Email</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="field span-2"><label>Address</label><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
        </form>
      </Modal>

      <div className="card" style={{ padding: 16 }}>
        <div className="filter-bar">
          <div className="filter-search">
            <Search size={15} className="filter-search-icon" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, contact, phone, email…"
              aria-label="Search suppliers"
            />
            {search && (
              <button type="button" className="btn-icon filter-search-clear" onClick={() => setSearch('')} title="Clear search">
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <table className="data-table">
          <thead><tr><th>Name</th><th>Contact</th><th>Phone</th><th>Email</th>{user.role === 'admin' && <th>Actions</th>}</tr></thead>
          <tbody>
            {visibleSuppliers.map((s) => (
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
        {!loading && visibleSuppliers.length === 0 && (
          <div className="empty-state">
            {suppliers.length === 0 ? 'No suppliers yet. Add your first one above.' : `No suppliers match “${search}”.`}
          </div>
        )}
      </div>
    </>
  );
}
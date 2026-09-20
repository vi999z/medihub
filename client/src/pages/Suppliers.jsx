import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, RefreshCw, Pencil, Download, Search, X, Building2 } from 'lucide-react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { downloadCsv } from '../utils/csv';

export default function Suppliers() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ name: '', contact_person: '', phone: '', email: '', address: '' });
  const [error, setError] = useState('');

  async function fetchAll() {
    try {
      const res = await api.cachedGet('/suppliers');
      setSuppliers(res.data || []);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load suppliers');
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
    <div className="flat-dashboard">
      <div className="page-header">
        <div>
          <h1>Suppliers</h1>
          <p>{loading ? 'Loading suppliers…' : `${visibleSuppliers.length} of ${suppliers.length} shown`}</p>
        </div>
        <div className="page-header-actions">
          <button type="button" className="flat-action-btn" onClick={handleExport}>
            <Download size={15} /> Export CSV
          </button>
          <button type="button" className="flat-action-btn" onClick={handleRefresh}>
            <RefreshCw size={15} /> Refresh
          </button>
          {user.role === 'admin' && (
            <button type="button" className="flat-btn-primary" onClick={() => showForm ? resetForm() : setShowForm(true)}>
              <Plus size={15} /> {showForm ? 'Close form' : 'Add supplier'}
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="flat-card"
          style={{ padding: 16, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}
        >
          <div className="field"><label>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
          <div className="field"><label>Contact person</label><input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></div>
          <div className="field"><label>Phone</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div className="field"><label>Email</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="field" style={{ gridColumn: '1 / -1' }}><label>Address</label><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10 }}>
            <button type="submit" className="flat-btn-primary">{editingId ? 'Update supplier' : 'Save supplier'}</button>
            <button type="button" className="flat-action-btn" onClick={resetForm}>Cancel</button>
          </div>
        </form>
      )}

      <div className="flat-card" style={{ padding: 16 }}>
        <div className="filter-bar" style={{ margin: 0, background: 'none', border: 'none', padding: 0 }}>
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
      </div>

      <div className="flat-card">
        <div className="flat-table-header">
          <span className="flat-table-title">Suppliers</span>
        </div>
        <div style={{ padding: 16 }}>
          {error && (
            <div className="flat-empty">
              Unable to load suppliers — {error}
              <div style={{ marginTop: 10 }}>
                <button type="button" className="flat-action-btn" onClick={fetchAll}>Retry</button>
              </div>
            </div>
          )}

          {!error && loading && (
            <div className="flat-card-grid">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flat-card flat-item-card">
                  <div className="flat-item-icon skeleton" style={{ border: 'none' }} />
                  <div className="skeleton" style={{ height: 16, width: '70%', margin: '4px 0' }} />
                  <div className="skeleton" style={{ height: 12, width: '50%' }} />
                </div>
              ))}
            </div>
          )}

          {!error && !loading && visibleSuppliers.length === 0 && (
            <div className="flat-empty">{suppliers.length === 0 ? 'No suppliers yet. Add your first one above.' : `No suppliers match "${search}".`}</div>
          )}

          {!error && !loading && visibleSuppliers.length > 0 && (
            <div className="flat-card-grid">
              {visibleSuppliers.map((s) => (
                <div key={s.id} className="flat-card flat-item-card" style={{ cursor: 'default' }}>
                  <div className="flat-item-card__top">
                    <div className="flat-item-icon"><Building2 size={22} /></div>
                  </div>
                  <div className="flat-med-name">{s.name}</div>
                  <div className="flat-med-meta">{s.contact_person || 'No contact person listed'}</div>
                  <div className="flat-item-row">
                    <span>Phone</span>
                    <strong>{s.phone || '—'}</strong>
                  </div>
                  <div className="flat-item-row">
                    <span>Email</span>
                    <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.email || '—'}</strong>
                  </div>
                  <div className="flat-med-meta" style={{ marginTop: 2 }}>{s.address || 'No address listed'}</div>
                  {user.role === 'admin' && (
                    <div className="flat-item-card__actions">
                      <button type="button" className="flat-action-btn" onClick={() => openEdit(s)}>
                        <Pencil size={13} /> Edit
                      </button>
                      <button type="button" className="flat-action-btn" onClick={() => handleDelete(s.id)}>
                        <Trash2 size={13} /> Remove
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
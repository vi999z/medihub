import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Plus, Trash2, RefreshCw, Pencil, Download, Search, X } from 'lucide-react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { downloadCsv } from '../utils/csv';
import StaggeredList from '../components/StaggeredList';
import Skeleton from '../components/Skeleton';

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
  const prefersReducedMotion = useReducedMotion();

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
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.4 }}
    >
      <div className="page-header">
        <div>
          <h1>Suppliers</h1>
          <p>{loading ? 'Loading suppliers…' : `${visibleSuppliers.length} of ${suppliers.length} shown`}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={handleExport}>
            <Download size={15} /> Export CSV
          </button>
          <button className="btn btn-secondary" onClick={handleRefresh}>
            <RefreshCw size={15} /> Refresh
          </button>
          {user.role === 'admin' && (
            <button className="btn btn-primary" onClick={() => showForm ? resetForm() : setShowForm(true)}>
              <Plus size={15} /> {showForm ? 'Close form' : 'Add supplier'}
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <motion.form
          onSubmit={handleSubmit}
          className="card"
          style={{ marginBottom: 20, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.3 }}
        >
          <div className="field"><label>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
          <div className="field"><label>Contact person</label><input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></div>
          <div className="field"><label>Phone</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div className="field"><label>Email</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="field" style={{ gridColumn: '1 / -1' }}><label>Address</label><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10 }}>
            <button type="submit" className="btn btn-primary">{editingId ? 'Update supplier' : 'Save supplier'}</button>
            <button type="button" className="btn btn-secondary" onClick={resetForm}>Cancel</button>
          </div>
        </motion.form>
      )}

      <motion.div
        className="card table-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.5, delay: prefersReducedMotion ? 0 : 0.1 }}
      >
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

        {error && (
          <div className="empty-state">
            <strong>Unable to load suppliers</strong>
            <p style={{ margin: '6px 0 0' }}>{error}</p>
            <button className="btn btn-secondary" style={{ marginTop: 10 }} onClick={fetchAll}>Retry</button>
          </div>
        )}

        {!loading && !error && visibleSuppliers.length === 0 && (
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Name</th><th>Contact</th><th>Phone</th><th>Email</th><th>Address</th>{user.role === 'admin' && <th>Actions</th>}</tr></thead>
              <tbody>
                <tr className="empty-row">
                  <td colSpan={user.role === 'admin' ? 6 : 5}>
                    <div className="empty-state compact-empty-state">
                      {suppliers.length === 0 ? 'No suppliers yet. Add your first one above.' : `No suppliers match "${search}".`}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {loading && (
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Name</th><th>Contact</th><th>Phone</th><th>Email</th><th>Address</th>{user.role === 'admin' && <th>Actions</th>}</tr></thead>
              <tbody>
                {[1, 2, 3, 4].map((i) => (
                  <tr key={i}>
                    <td><Skeleton height={16} /></td>
                    <td><Skeleton height={16} /></td>
                    <td><Skeleton height={16} /></td>
                    <td><Skeleton height={16} /></td>
                    <td><Skeleton height={16} /></td>
                    {user.role === 'admin' && <td><Skeleton height={16} /></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && (
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Name</th><th>Contact</th><th>Phone</th><th>Email</th><th>Address</th>{user.role === 'admin' && <th>Actions</th>}</tr></thead>
              <StaggeredList staggerDelay={0.03}>
                <tbody>
                  {visibleSuppliers.map((s) => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 500 }}>{s.name}</td>
                      <td>{s.contact_person || '—'}</td>
                      <td>{s.phone || '—'}</td>
                      <td>{s.email || '—'}</td>
                      <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.address || '—'}</td>
                      {user.role === 'admin' && (
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn-icon" onClick={() => openEdit(s)} title="Edit supplier"><Pencil size={14} /></button>
                            <button className="btn-icon" onClick={() => handleDelete(s.id)} title="Remove supplier"><Trash2 size={14} /></button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </StaggeredList>
            </table>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
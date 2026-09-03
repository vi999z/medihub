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
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.5, delay: prefersReducedMotion ? 0 : 0.1 }}
      >
        <div className="filter-bar" style={{ padding: 16, margin: 0, marginBottom: 16, background: 'var(--surface-strong)', borderRadius: 'var(--radius)' }}>
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
          <div className="empty-state compact-empty-state">
            {suppliers.length === 0 ? 'No suppliers yet. Add your first one above.' : `No suppliers match "${search}".`}
          </div>
        )}

        {loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="card" style={{ minHeight: 210, padding: 16 }}>
                <Skeleton height={14} style={{ marginBottom: 14, width: '35%' }} />
                <Skeleton height={18} style={{ marginBottom: 10 }} />
                <Skeleton height={14} style={{ marginBottom: 8, width: '75%' }} />
                <Skeleton height={14} style={{ marginBottom: 18, width: '60%' }} />
                <Skeleton height={32} style={{ borderRadius: 999 }} />
              </div>
            ))}
          </div>
        )}

        {!loading && !error && visibleSuppliers.length > 0 && (
          <StaggeredList staggerDelay={0.03}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {visibleSuppliers.map((s) => (
                <motion.div key={s.id} className="card" style={{ padding: 16, borderTop: '4px solid var(--green)', display: 'flex', flexDirection: 'column', minHeight: 220 }} whileHover={{ y: -4, boxShadow: 'var(--shadow-md)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span className="stamp">ID: {s.id}</span>
                    <span className="status-pill safe" style={{ fontSize: 10, padding: '3px 8px' }}>Active supplier</span>
                  </div>
                  <div style={{ flex: 1, marginBottom: 14 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{s.name}</div>
                    <div style={{ color: 'var(--steel)', fontSize: 12, marginBottom: 12 }}>{s.contact_person || 'No contact person listed'}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12 }}>
                      <div><div style={{ color: 'var(--steel)', fontSize: 11 }}>Phone</div><div style={{ fontWeight: 600 }}>{s.phone || '—'}</div></div>
                      <div><div style={{ color: 'var(--steel)', fontSize: 11 }}>Email</div><div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.email || '—'}</div></div>
                    </div>
                    <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 10, color: 'var(--steel)', fontSize: 11 }}>{s.address || 'No address listed'}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--gradient-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12 }}>{s.name.charAt(0).toUpperCase()}</div><span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)' }}>Supplier</span></div>
                    {user.role === 'admin' && <div style={{ display: 'flex', gap: 6 }}><button className="btn-icon" onClick={() => openEdit(s)} title="Edit supplier"><Pencil size={14} /></button><button className="btn-icon" onClick={() => handleDelete(s.id)} title="Remove supplier"><Trash2 size={14} /></button></div>}
                  </div>
                </motion.div>
              ))}
            </div>
          </StaggeredList>
        )}
      </motion.div>
    </motion.div>
  );
}
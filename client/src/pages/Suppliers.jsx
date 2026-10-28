import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, RefreshCw, Pencil, Download, Search, X, Building2 } from 'lucide-react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useDialog } from '../context/DialogContext';
import { downloadCsv } from '../utils/csv';
import { validateSupplierForm, trimFields, MAX_LENGTH } from '../utils/validation';

export default function Suppliers() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { confirm } = useDialog();
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ name: '', contact_person: '', phone: '', email: '', address: '' });
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

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
    setFormError('');
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
    if (saving) return;
    setFormError('');
    const validationError = validateSupplierForm(form);
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setSaving(true);
    try {
      const payload = trimFields(form);
      if (editingId) {
        await api.put(`/suppliers/${editingId}`, payload);
        addToast('Supplier updated', 'success');
      } else {
        await api.post('/suppliers', payload);
        addToast('Supplier added', 'success');
      }
      api.invalidateCache('/suppliers');
      resetForm();
      await fetchAll();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to save supplier');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!(await confirm({ title: 'Remove supplier', message: 'Remove this supplier?', confirmLabel: 'Remove', danger: true }))) return;
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
      <div className="page-actions-only">
        <div className="page-header-actions">
          <button type="button" className="flat-action-btn" onClick={handleExport}>
            <Download size={15} /> Export CSV
          </button>
          <button type="button" className="flat-action-btn" onClick={handleRefresh}>
            <RefreshCw size={15} /> Refresh
          </button>
          {(user.role === 'admin' || user.role === 'pharmacist') && (
            <button type="button" className="flat-btn-primary" onClick={() => showForm ? resetForm() : setShowForm(true)}>
              <Plus size={15} /> {showForm ? 'Close form' : 'Add supplier'}
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          noValidate
          className="flat-card"
          style={{ padding: 16, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(250px, 100%), 1fr))' }}
        >
          <div className="field"><label>Name</label><input value={form.name} maxLength={MAX_LENGTH.supplierName} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
          <div className="field"><label>Contact person</label><input value={form.contact_person} maxLength={MAX_LENGTH.contactPerson} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></div>
          <div className="field"><label>Phone</label><input type="tel" inputMode="tel" value={form.phone} maxLength={MAX_LENGTH.phone} placeholder="e.g. +63 912 345 6789" onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div className="field"><label>Email</label><input type="email" value={form.email} maxLength={MAX_LENGTH.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="field" style={{ gridColumn: '1 / -1' }}><label>Address</label><input value={form.address} maxLength={MAX_LENGTH.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10 }}>
            <button type="submit" className="flat-btn-primary" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Update supplier' : 'Save supplier'}</button>
            <button type="button" className="flat-action-btn" onClick={resetForm}>Cancel</button>
          </div>
          {formError && <p className="error-text" role="alert" style={{ gridColumn: '1 / -1', margin: 0 }}>{formError}</p>}
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
                <div key={s.id} className="flat-card flat-item-card flat-item-card--accent" style={{ cursor: 'default' }}>
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
                  {(user.role === 'admin' || user.role === 'pharmacist') && (
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
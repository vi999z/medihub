import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Plus, Trash2, Pencil, Download, Search, X, QrCode } from 'lucide-react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { downloadCsv } from '../utils/csv';
import { daysUntil } from '../utils/date';
import StaggeredList from '../components/StaggeredList';
import QRCodeDisplay from '../components/QRCode';
import Skeleton from '../components/Skeleton';

const STATUS_FILTERS = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'expiring', label: 'Expiring in 30 days' },
  { value: 'expired', label: 'Expired' },
  { value: 'depleted', label: 'Depleted' },
  { value: 'recalled', label: 'Recalled' }
];

function statusPillFor(batch) {
  if (batch.status === 'expired') return { cls: 'critical', label: 'Expired' };
  if (batch.status === 'depleted') return { cls: 'warning', label: 'Depleted' };
  if (batch.status === 'recalled') return { cls: 'critical', label: 'Recalled' };
  const days = daysUntil(batch.expiry_date);
  if (days <= 7) return { cls: 'critical', label: `${days}d left` };
  if (days <= 30) return { cls: 'warning', label: `${days}d left` };
  return { cls: 'safe', label: 'Active' };
}

export default function Batches() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [batches, setBatches] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    medicine_id: '', supplier_id: '', batch_number: '', quantity_received: '',
    quantity_remaining: '', cost_price: '', selling_price: '', manufacture_date: '', expiry_date: '', status: 'active'
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrBatch, setQrBatch] = useState(null);
  const prefersReducedMotion = useReducedMotion();

  async function fetchAll() {
    try {
      const [b, m, s] = await Promise.all([api.cachedGet('/batches'), api.cachedGet('/medicines'), api.cachedGet('/suppliers')]);
      setBatches(b.data);
      setMedicines(m.data);
      setSuppliers(s.data);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load batches');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchAll(); }, []);

  const visibleBatches = useMemo(() => {
    const term = search.trim().toLowerCase();
    return batches.filter((batch) => {
      if (statusFilter === 'expiring') {
        if (batch.status !== 'active' || daysUntil(batch.expiry_date) > 30) return false;
      } else if (statusFilter !== 'all' && batch.status !== statusFilter) {
        return false;
      }
      if (!term) return true;
      return [batch.medicine_name, batch.batch_number, batch.supplier_name]
        .some((value) => String(value || '').toLowerCase().includes(term));
    });
  }, [batches, search, statusFilter]);

  const filtersActive = Boolean(search) || statusFilter !== 'all';

  function clearFilters() {
    setSearch('');
    setStatusFilter('all');
  }

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setForm({
      medicine_id: '', supplier_id: '', batch_number: '', quantity_received: '',
      quantity_remaining: '', cost_price: '', selling_price: '', manufacture_date: '', expiry_date: '', status: 'active'
    });
  }

  function openEdit(batch) {
    setEditingId(batch.id);
    setForm({
      medicine_id: batch.medicine_id || '',
      supplier_id: batch.supplier_id || '',
      batch_number: batch.batch_number || '',
      quantity_received: batch.quantity_received ?? '',
      quantity_remaining: batch.quantity_remaining ?? '',
      cost_price: batch.cost_price ?? '',
      selling_price: batch.selling_price ?? '',
      manufacture_date: batch.manufacture_date ? String(batch.manufacture_date).slice(0, 10) : '',
      expiry_date: batch.expiry_date ? String(batch.expiry_date).slice(0, 10) : '',
      status: batch.status || 'active'
    });
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      if (editingId) {
        await api.put(`/batches/${editingId}`, form);
        addToast('Batch updated', 'success');
      } else {
        await api.post('/batches', form);
        addToast('Batch received', 'success');
      }
      api.invalidateCache('/batches');
      api.invalidateCache('/medicines');
      resetForm();
      await fetchAll();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save batch');
    }
  }

  async function handleRemoveDepleted() {
    if (!window.confirm('Remove all batches that are already depleted?')) return;
    try {
      const res = await api.delete('/batches/depleted');
      api.invalidateCache('/batches');
      api.invalidateCache('/notifications');
      api.invalidateCache('/notifications?unread=true');
      await fetchAll();
      addToast(res.data.message || 'Depleted batches removed', 'success');
    } catch (err) {
      addToast(err.response?.data?.error || 'Could not remove depleted batches', 'error');
    }
  }

  function handleExport() {
    const rows = visibleBatches.map((batch) => ({
      id: batch.id,
      medicine: batch.medicine_name,
      batch_number: batch.batch_number,
      supplier: batch.supplier_name || '—',
      quantity_remaining: batch.quantity_remaining,
      expiry_date: batch.expiry_date,
      status: batch.status,
      selling_price: batch.selling_price || ''
    }));
    downloadCsv('batches.csv', rows, ['id', 'medicine', 'batch_number', 'supplier', 'quantity_remaining', 'expiry_date', 'status', 'selling_price']);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.4 }}
    >
      <div className="page-header">
        <div>
          <h1>Batches</h1>
          <p>{loading ? 'Loading batches…' : `${visibleBatches.length} of ${batches.length} batches shown, sorted by nearest expiry`}</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={handleExport}>
            <Download size={15} /> Export CSV
          </button>
          {user.role === 'admin' && (
            <button className="btn btn-secondary" onClick={handleRemoveDepleted}>
              <Trash2 size={15} /> Remove depleted
            </button>
          )}
          <button className="btn btn-primary" onClick={() => showForm ? resetForm() : setShowForm(true)}>
            <Plus size={15} /> {showForm ? 'Close form' : 'Receive stock'}
          </button>
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
          <div className="field">
            <label>Medicine</label>
            <select value={form.medicine_id} onChange={(e) => setForm({ ...form, medicine_id: e.target.value })} required>
              <option value="">Select a medicine</option>
              {medicines.map((m) => (
                <option key={m.id} value={m.id}>{m.name} {m.strength ? `(${m.strength})` : ''}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Supplier</label>
            <select value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}>
              <option value="">No supplier</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
              ))}
            </select>
          </div>
          <div className="field"><label>Batch number</label><input value={form.batch_number} onChange={(e) => setForm({ ...form, batch_number: e.target.value })} required /></div>
          <div className="field"><label>Quantity received</label><input type="number" min="1" value={form.quantity_received} onChange={(e) => setForm({ ...form, quantity_received: e.target.value })} required /></div>
          <div className="field"><label>Remaining quantity</label><input type="number" min="0" value={form.quantity_remaining} onChange={(e) => setForm({ ...form, quantity_remaining: e.target.value })} /></div>
          <div className="field"><label>Expiry date</label><input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} required /></div>
          <div className="field"><label>Manufacture date</label><input type="date" value={form.manufacture_date} onChange={(e) => setForm({ ...form, manufacture_date: e.target.value })} /></div>
          <div className="field"><label>Cost price</label><input type="number" step="0.01" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} /></div>
          <div className="field"><label>Selling price</label><input type="number" step="0.01" value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: e.target.value })} /></div>
          <div className="field"><label>Status</label><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="active">Active</option><option value="recalled">Recalled</option><option value="depleted">Depleted</option><option value="expired">Expired</option></select></div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10 }}>
            <button type="submit" className="btn btn-primary">{editingId ? 'Update batch' : 'Save batch'}</button>
            <button type="button" className="btn btn-secondary" onClick={resetForm}>Cancel</button>
          </div>
          {error && <p className="error-text" style={{ gridColumn: '1 / -1' }}>{error}</p>}
        </motion.form>
      )}

      <div style={{ padding: '16px', background: 'var(--surface-strong)', borderRadius: 'var(--radius)' }}>
        <div className="filter-bar" style={{ margin: 0 }}>
          <div className="filter-search">
            <Search size={15} className="filter-search-icon" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search medicine, batch number, supplier…"
              aria-label="Search batches"
            />
            {search && (
              <button type="button" className="btn-icon filter-search-clear" onClick={() => setSearch('')} title="Clear search">
                <X size={14} />
              </button>
            )}
          </div>
          <div className="field filter-select">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
              {STATUS_FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          {filtersActive && (
            <button type="button" className="btn btn-secondary" onClick={clearFilters}>
              <X size={15} /> Clear filters
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="empty-state">
          <strong>Unable to load batches</strong>
          <p style={{ margin: '6px 0 0' }}>{error}</p>
          <button className="btn btn-secondary" style={{ marginTop: 10 }} onClick={fetchAll}>Retry</button>
        </div>
      )}

      {loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="card" style={{ height: '280px' }}>
              <Skeleton height={16} style={{ marginBottom: '12px' }} />
              <Skeleton height={16} style={{ marginBottom: '8px' }} />
              <Skeleton height={16} style={{ marginBottom: '16px' }} />
              <Skeleton height={16} style={{ marginBottom: '12px' }} />
              <Skeleton height={40} style={{ borderRadius: '999px' }} />
            </div>
          ))}
        </div>
      )}

      {!loading && !error && visibleBatches.length === 0 && (
        <div className="empty-state">
          <strong>No batches found</strong>
          <p style={{ margin: '6px 0 0' }}>{batches.length === 0 ? 'No batches recorded yet.' : 'No batches match the current filters.'}</p>
          {filtersActive && (
            <button type="button" className="btn btn-secondary" style={{ marginTop: 10 }} onClick={clearFilters}>Clear filters</button>
          )}
        </div>
      )}

      {!loading && !error && visibleBatches.length > 0 && (
        <motion.div 
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <StaggeredList staggerDelay={0.03}>
            {visibleBatches.map((b) => {
              const pill = statusPillFor(b);
              const borderColorMap = { 'safe': 'var(--green)', 'warning': 'var(--gold)', 'critical': 'var(--red)' };
              return (
                <motion.div
                  key={b.id}
                  className="card"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '16px',
                    borderTop: `4px solid ${borderColorMap[pill.cls]}`,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  whileHover={{ y: -4, boxShadow: 'var(--shadow-md)' }}
                >
                  {/* Top Row: ID & Status */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span className="stamp" style={{ fontSize: '11px' }}>ID: {b.id}</span>
                    <span className={`status-pill ${pill.cls}`} style={{ fontSize: '10px', padding: '3px 8px' }}>{pill.label}</span>
                  </div>

                  {/* Middle Content */}
                  <div style={{ flex: 1, marginBottom: '12px' }}>
                    <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--ink)', marginBottom: '4px', lineHeight: 1.3 }}>
                      {b.medicine_name}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--steel)', marginBottom: '8px', lineHeight: 1.4 }}>
                      Batch: <span className="stamp" style={{ fontSize: '11px' }}>{b.batch_number}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
                      <div>
                        <div style={{ color: 'var(--steel)', fontSize: '11px' }}>Remaining</div>
                        <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{b.quantity_remaining}</div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--steel)', fontSize: '11px' }}>Expiry</div>
                        <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{new Date(b.expiry_date).toLocaleDateString()}</div>
                      </div>
                    </div>
                    {b.supplier_name && (
                      <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border)', fontSize: '11px', color: 'var(--steel)' }}>
                        Supplier: <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{b.supplier_name}</span>
                      </div>
                    )}
                  </div>

                  {/* Bottom Row: Avatar + Label + Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--gradient-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '12px', fontWeight: 700, flexShrink: 0 }}>
                        {b.medicine_name.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--ink-soft)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.medicine_name.substring(0, 12)}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={() => openEdit(b)}
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          background: 'var(--bg-subtle)',
                          border: '1px solid var(--border)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--amber-tint)'; e.currentTarget.style.borderColor = 'var(--amber)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-subtle)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                        title="Edit batch"
                      >
                        <Pencil size={14} color="var(--ink)" />
                      </button>
                      <button
                        type="button"
                        onClick={() => { setQrBatch(b); setShowQRModal(true); }}
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          background: 'var(--bg-subtle)',
                          border: '1px solid var(--border)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--amber-tint)'; e.currentTarget.style.borderColor = 'var(--amber)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-subtle)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                        title="Show QR code"
                      >
                        <QrCode size={14} color="var(--ink)" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </StaggeredList>
        </motion.div>
      )}

      {showQRModal && qrBatch && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowQRModal(false)}>
          <motion.div 
            className="card" 
            style={{ padding: 24, maxWidth: 400, width: '90%' }}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>Batch QR Code</h3>
              <button className="btn-icon" onClick={() => setShowQRModal(false)}><X size={18} /></button>
            </div>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <QRCodeDisplay value={qrBatch.id.toString()} size={250} />
            </div>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <p style={{ fontWeight: 500, margin: '0 0 4px' }}>{qrBatch.medicine_name}</p>
              <p style={{ color: 'var(--steel)', margin: 0, fontSize: 13 }}>Batch: {qrBatch.batch_number}</p>
              <p style={{ color: 'var(--steel)', margin: 0, fontSize: 13 }}>ID: {qrBatch.id}</p>
            </div>
            <button 
              className="btn btn-primary" 
              style={{ width: '100%' }}
              onClick={() => {
                const canvas = document.querySelector('.qr-code-container canvas');
                if (canvas) {
                  const link = document.createElement('a');
                  link.download = `batch-${qrBatch.batch_number}-qr.png`;
                  link.href = canvas.toDataURL();
                  link.click();
                }
              }}
            >
              Download QR Code
            </button>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
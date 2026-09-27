import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Pencil, Download, Search, X, QrCode, ChevronDown, Package } from 'lucide-react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useDialog } from '../context/DialogContext';
import { downloadCsv } from '../utils/csv';
import { daysUntil } from '../utils/date';
import QRCodeDisplay from '../components/QRCode';
import ReceiveStockModal from '../components/ReceiveStockModal';

// ── Export dropdown button ────────────────────────────────────────────────────
function ExportDropdown({ onExport }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    function onClickOutside(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const EXPORT_OPTIONS = [
    { label: 'Active batches (Excel)', status: 'active', format: 'excel' },
    { label: 'Expiring soon (Excel)', status: 'expiring', format: 'excel' },
    { label: 'Expired batches (Excel)', status: 'expired', format: 'excel' },
    { label: 'Depleted batches (Excel)', status: 'depleted', format: 'excel' },
    { label: 'Recalled batches (Excel)', status: 'recalled', format: 'excel' },
    { label: 'Wasted medicines (Excel)', status: 'wasted', format: 'excel' },
    null, // divider
    { label: 'Expired batches (PDF)', status: 'expired', format: 'pdf' },
    { label: 'Wasted medicines (PDF)', status: 'wasted', format: 'pdf' },
    { label: 'Expired batches (Word)', status: 'expired', format: 'docx' },
    null, // divider
    { label: 'Current view (CSV)', status: 'csv', format: 'csv' },
  ];

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" className="flat-action-btn" onClick={() => setOpen(o => !o)}>
        <Download size={15} /> Export <ChevronDown size={13} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: 230,
          background: '#fff', border: '1px solid var(--flat-border)',
          borderRadius: 8, zIndex: 50,
          padding: '6px 0', overflow: 'hidden'
        }}>
          {EXPORT_OPTIONS.map((opt, idx) =>
            opt === null ? (
              <hr key={idx} style={{ margin: '4px 0', border: 'none', borderTop: '1px solid var(--flat-border)' }} />
            ) : (
              <button
                key={idx}
                onClick={() => { onExport(opt.status, opt.format); setOpen(false); }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '9px 16px', background: 'none', border: 'none',
                  cursor: 'pointer', fontSize: 13, color: 'var(--flat-text)',
                  transition: 'background 0.12s ease'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--flat-bg)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                {opt.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

const STATUS_FILTERS = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'expiring', label: 'Expiring in 14 days' },
  { value: 'expired', label: 'Expired' },
  { value: 'depleted', label: 'Depleted' },
  { value: 'recalled', label: 'Recalled' }
];

function statusPillFor(batch) {
  if (batch.status === 'expired') return { cls: 'critical', label: 'Expired' };
  if (batch.status === 'depleted') return { cls: 'orange', label: 'Depleted' };
  if (batch.status === 'recalled') return { cls: 'critical', label: 'Recalled' };
  if (!batch.expiry_date) return { cls: 'safe', label: 'Active' };
  const days = daysUntil(batch.expiry_date);
  if (days <= 3) return { cls: 'critical', label: `${days}d left` };
  if (days <= 14) return { cls: 'warning', label: `${days}d left` };
  if (days <= 60) return { cls: 'orange', label: `${days}d left` };
  return { cls: 'safe', label: 'Active' };
}

// Maps the same pill classification onto the flat design system's palette.
const BATCH_FLAT_CLS = { critical: 'red', warning: 'amber', orange: 'orange', safe: 'green' };

export default function Batches() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { confirm } = useDialog();
  const [batches, setBatches] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingBatch, setEditingBatch] = useState(null);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrBatch, setQrBatch] = useState(null);

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
      if (statusFilter === 'all' && Number(batch.quantity_remaining) <= 0) return false;
      if (statusFilter === 'expiring') {
        if (batch.status !== 'active' || daysUntil(batch.expiry_date) > 14) return false;
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
    setEditingBatch(null);
    setFormError('');
  }

  function openEdit(batch) {
    setEditingBatch(batch);
    setShowForm(true);
  }

  async function handleBatchSubmit(form) {
    setFormError('');
    try {
      if (editingBatch) {
        await api.put(`/batches/${editingBatch.id}`, form);
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
      setFormError(err.response?.data?.error || 'Failed to save batch');
      throw err;
    }
  }

  async function handleRemoveDepleted() {
    if (!(await confirm({ title: 'Remove depleted batches', message: 'Remove all batches that are already depleted?', confirmLabel: 'Remove', danger: true }))) return;
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

  async function handleExport(status, format) {
    if (status === 'csv') {
      // CSV of currently visible batches
      const rows = visibleBatches.map((batch) => ({
        id: batch.id, medicine: batch.medicine_name, batch_number: batch.batch_number,
        supplier: batch.supplier_name || '—', quantity_remaining: batch.quantity_remaining,
        expiry_date: batch.expiry_date ? String(batch.expiry_date).slice(0, 10) : '',
        status: batch.status, selling_price: batch.selling_price || ''
      }));
      downloadCsv('batches.csv', rows, ['id', 'medicine', 'batch_number', 'supplier', 'quantity_remaining', 'expiry_date', 'status', 'selling_price']);
      return;
    }
    try {
      const endpoint = status === 'wasted'
        ? `/reports/export/wasted?format=${format}`
        : `/reports/export/batches?status=${status}&format=${format}`;
      const res = await api.get(endpoint, { responseType: 'blob' });
      const ext = format === 'pdf' ? 'pdf' : format === 'docx' ? 'docx' : 'xlsx';
      const blob = new Blob([res.data], { type: res.headers['content-type'] || 'application/octet-stream' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${status}_batches_${new Date().toISOString().slice(0, 10)}.${ext}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      addToast(`Export downloaded`, 'success');
    } catch (err) {
      addToast('Export failed', 'error');
    }
  }

  return (
    <div className="flat-dashboard">
      <div className="page-actions-only">
        <div className="page-header-actions">
          <ExportDropdown onExport={handleExport} />
          {user.role === 'admin' && (
            <button type="button" className="flat-action-btn" onClick={handleRemoveDepleted}>
              <Trash2 size={15} /> Remove depleted
            </button>
          )}
          <button type="button" className="flat-btn-primary" onClick={() => { setEditingBatch(null); setShowForm(true); }}>
            <Plus size={15} /> Receive stock
          </button>
        </div>
      </div>

      <ReceiveStockModal
        isOpen={showForm}
        onClose={resetForm}
        medicines={medicines}
        suppliers={suppliers}
        editingBatch={editingBatch}
        onSubmit={handleBatchSubmit}
        error={formError}
      />

      <div className="flat-card" style={{ padding: 16 }}>
        <div className="filter-bar" style={{ margin: 0, background: 'none', border: 'none', padding: 0 }}>
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
            <button type="button" className="flat-action-btn" onClick={clearFilters}>
              <X size={15} /> Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="flat-card">
        <div className="flat-table-header">
          <span className="flat-table-title">Batches</span>
          {filtersActive && (
            <button type="button" className="flat-table-link" onClick={clearFilters}>Clear filters</button>
          )}
        </div>
        <div style={{ padding: 16 }}>
          {error && (
            <div className="flat-empty">
              Unable to load batches — {error}
              <div style={{ marginTop: 10 }}>
                <button type="button" className="flat-action-btn" onClick={fetchAll}>Retry</button>
              </div>
            </div>
          )}

          {!error && loading && (
            <div className="flat-card-grid">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="flat-card flat-item-card">
                  <div className="flat-item-icon skeleton" style={{ border: 'none' }} />
                  <div className="skeleton" style={{ height: 16, width: '70%', margin: '4px 0' }} />
                  <div className="skeleton" style={{ height: 12, width: '50%' }} />
                </div>
              ))}
            </div>
          )}

          {!error && !loading && visibleBatches.length === 0 && (
            <div className="flat-empty">{batches.length === 0 ? 'No batches recorded yet.' : 'No batches match the current filters.'}</div>
          )}

          {!error && !loading && visibleBatches.length > 0 && (
            <div className="flat-card-grid">
              {visibleBatches.map((b) => {
                const pill = statusPillFor(b);
                return (
                  <div key={b.id} className={`flat-card flat-item-card flat-item-card--${BATCH_FLAT_CLS[pill.cls]}`} style={{ cursor: 'default' }}>
                    <div className="flat-item-card__top">
                      <div className="flat-item-icon"><Package size={22} /></div>
                      <span className={`flat-status-label ${BATCH_FLAT_CLS[pill.cls]}`}>{pill.label}</span>
                    </div>
                    <div className="flat-med-name">{b.medicine_name}</div>
                    <div className="flat-med-meta">{b.supplier_name || 'No supplier listed'}</div>
                    <span className="flat-tag">Batch {b.batch_number}</span>
                    <div className="flat-item-row">
                      <span>Remaining</span>
                      <strong>{b.quantity_remaining}</strong>
                    </div>
                    <div className="flat-item-row">
                      <span>Expiry</span>
                      <strong>{new Date(b.expiry_date).toLocaleDateString()}</strong>
                    </div>
                    <div className="flat-item-card__actions">
                      <button type="button" className="flat-action-btn" onClick={() => openEdit(b)}>
                        <Pencil size={13} /> Edit
                      </button>
                      <button type="button" className="flat-action-btn" onClick={() => { setQrBatch(b); setShowQRModal(true); }}>
                        <QrCode size={13} /> QR
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showQRModal && qrBatch && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowQRModal(false)}>
          <div
            className="card"
            style={{ padding: 24, maxWidth: 400, width: '90%' }}
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
              type="button"
              className="flat-btn-primary"
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
          </div>
        </div>
      )}
    </div>
  );
}
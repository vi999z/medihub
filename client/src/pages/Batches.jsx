import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Pencil, Search, X, QrCode, Package } from 'lucide-react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useDialog } from '../context/DialogContext';
import { downloadCsv } from '../utils/csv';
import { daysUntil } from '../utils/date';
import { batchStatus } from '../utils/batchStatus';
import BatchQrModal from '../components/BatchQrModal';
import ReceiveStockModal from '../components/ReceiveStockModal';
import ExportDropdown from '../components/ExportDropdown';
import { downloadBlob } from '../utils/downloadFile';

const EXPORT_OPTIONS = [
  { label: 'Active batches (Excel)', key: 'active', format: 'excel' },
  { label: 'Expiring soon (Excel)', key: 'expiring', format: 'excel' },
  { label: 'Expired batches (Excel)', key: 'expired', format: 'excel' },
  { label: 'Depleted batches (Excel)', key: 'depleted', format: 'excel' },
  { label: 'Recalled batches (Excel)', key: 'recalled', format: 'excel' },
  { label: 'Wasted medicines (Excel)', key: 'wasted', format: 'excel' },
  null,
  { label: 'Expired batches (PDF)', key: 'expired', format: 'pdf' },
  { label: 'Wasted medicines (PDF)', key: 'wasted', format: 'pdf' },
  { label: 'Expired batches (Word)', key: 'expired', format: 'docx' },
  null,
  { label: 'Current view (CSV)', key: 'csv', format: 'csv' },
];

const STATUS_FILTERS = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'expiring', label: 'Expiring in 14 days' },
  { value: 'expired', label: 'Expired' },
  { value: 'depleted', label: 'Depleted' },
  { value: 'recalled', label: 'Recalled' }
];

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
      downloadBlob(blob, `${status}_batches_${new Date().toISOString().slice(0, 10)}.${ext}`);
      addToast(`Export downloaded`, 'success');
    } catch (err) {
      addToast('Export failed', 'error');
    }
  }

  return (
    <div className="flat-dashboard">
      <div className="page-actions-only">
        <div className="page-header-actions">
          <ExportDropdown options={EXPORT_OPTIONS} onSelect={({ key, format }) => handleExport(key, format)} />
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
                const pill = batchStatus(b);
                return (
                  <div key={b.id} className={`flat-card flat-item-card flat-item-card--${pill.cls}`} style={{ cursor: 'default' }}>
                    <div className="flat-item-card__top">
                      <div className="flat-item-icon"><Package size={22} /></div>
                      <span className={`flat-status-label ${pill.cls}`}>{pill.label}</span>
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
                      <button type="button" className="flat-action-btn" onClick={() => setQrBatch(b)}>
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

      <BatchQrModal batch={qrBatch} onClose={() => setQrBatch(null)} />
    </div>
  );
}
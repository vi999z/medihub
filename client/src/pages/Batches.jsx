import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Pencil, Search, X, QrCode, Download, Link2 } from 'lucide-react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useDialog } from '../context/DialogContext';
import { downloadCsv } from '../utils/csv';
import { daysUntil } from '../utils/date';
import { batchStatus } from '../utils/batchStatus';
import QrModal from '../components/QrModal';
import AnimatedModal from '../components/AnimatedModal';
import PageHeader from '../components/PageHeader';
import useBranches from '../hooks/useBranches';
import ReceiveStockModal from '../components/ReceiveStockModal';
import ReportExportModal from '../components/ReportExportModal';
import Pagination from '../components/Pagination';
import RowAction from '../components/RowAction';
import TableSkeleton from '../components/TableSkeleton';
import usePagination from '../hooks/usePagination';
import { errorMessage } from '../utils/errors';
import { useBranchFilter } from '../context/BranchContext';

const STATUS_FILTERS = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'expiring', label: 'Expiring in 14 days' },
  { value: 'unlinked', label: 'Not linked to a medicine' },
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
  const { branch: branchFilter, setBranch: setBranchFilter } = useBranchFilter();
  const [showExport, setShowExport] = useState(false);
  const { names: branchNames } = useBranches();
  const [qrBatch, setQrBatch] = useState(null);
  const [linkBatch, setLinkBatch] = useState(null);
  const [linkMedicineId, setLinkMedicineId] = useState('');
  const [linkError, setLinkError] = useState('');
  const [linking, setLinking] = useState(false);

  async function fetchAll() {
    try {
      const [b, m, s] = await Promise.all([api.cachedGet('/batches'), api.cachedGet('/medicines'), api.cachedGet('/suppliers')]);
      setBatches(b.data);
      setMedicines(m.data);
      setSuppliers(s.data);
      setError('');
    } catch (err) {
      setError(errorMessage(err, 'Failed to load batches'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchAll(); }, []);

  const visibleBatches = useMemo(() => {
    const term = search.trim().toLowerCase();
    return batches.filter((batch) => {
      if (branchFilter !== 'all' && batch.branch !== branchFilter) return false;
      if (statusFilter === 'all' && Number(batch.quantity_remaining) <= 0) return false;
      if (statusFilter === 'unlinked') {
        if (batch.linked) return false;
      } else if (statusFilter === 'expiring') {
        if (batch.status !== 'active' || daysUntil(batch.expiry_date) > 14) return false;
      } else if (statusFilter !== 'all' && batch.status !== statusFilter) {
        return false;
      }
      if (!term) return true;
      return [batch.medicine_name, batch.batch_number, batch.supplier_name]
        .some((value) => String(value || '').toLowerCase().includes(term));
    });
  }, [batches, search, statusFilter, branchFilter]);

  const pager = usePagination(visibleBatches, { resetKey: [search, statusFilter, branchFilter].join('|') });

  const filtersActive = Boolean(search) || statusFilter !== 'all' || branchFilter !== 'all';

  function clearFilters() {
    setSearch('');
    setStatusFilter('all');
    setBranchFilter('all');
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
      setFormError(errorMessage(err, 'Failed to save batch'));
      throw err;
    }
  }

  function openLink(batch) {
    setLinkBatch(batch);
    setLinkMedicineId('');
    setLinkError('');
  }

  // Medicines the batch can be linked to: the ones in the branch it was received for.
  const linkChoices = linkBatch
    ? medicines.filter((m) => m.branch === linkBatch.branch)
    : [];
  const suggested = linkBatch
    ? linkChoices.find((m) => (linkBatch.pending_barcode && m.barcode === linkBatch.pending_barcode) ||
        String(m.name).toLowerCase() === String(linkBatch.medicine_name || '').toLowerCase())
    : null;

  async function handleLink(event) {
    event.preventDefault();
    if (!linkMedicineId) { setLinkError('Choose a medicine to link'); return; }
    setLinking(true);
    setLinkError('');
    try {
      await api.post(`/batches/${linkBatch.id}/link`, { medicine_id: Number(linkMedicineId) });
      api.invalidateCache('/batches');
      api.invalidateCache('/medicines');
      api.invalidateCache('/reports/needs-attention?days=14');
      api.invalidateCache('/notifications');
      api.invalidateCache('/notifications?unread=true');
      setLinkBatch(null);
      addToast('Batch linked to the medicine', 'success');
      await fetchAll();
    } catch (err) {
      setLinkError(errorMessage(err, 'Could not link this batch'));
    } finally {
      setLinking(false);
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
      addToast(errorMessage(err, 'Could not remove depleted batches'), 'error');
    }
  }

  // The list currently on screen (respects the search, branch and status filters).
  function exportCurrentView() {
    const rows = visibleBatches.map((batch) => ({
      id: batch.id, branch: batch.branch, medicine: batch.medicine_name, linked: batch.linked ? 'yes' : 'no', batch_number: batch.batch_number,
      supplier: batch.supplier_name || '—', quantity_remaining: batch.quantity_remaining,
      expiry_date: batch.expiry_date ? String(batch.expiry_date).slice(0, 10) : '',
      status: batch.status, selling_price: batch.selling_price || ''
    }));
    downloadCsv('batches.csv', rows, ['id', 'branch', 'medicine', 'linked', 'batch_number', 'supplier', 'quantity_remaining', 'expiry_date', 'status', 'selling_price']);
  }

  return (
    <div className="flat-dashboard">
      <PageHeader title="Batches" description="Every delivery received, with its quantity, expiry date, branch and status." legend />
      <div className="page-actions-only">
        <div className="page-header-actions">
          <button type="button" className="flat-action-btn" onClick={() => setShowExport(true)}>
            <Download size={15} /> Export
          </button>
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
            <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} aria-label="Filter by branch">
              <option value="all">All branches</option>
              {branchNames.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
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
        </div>
        {error && (
          <div className="flat-empty">
            Unable to load batches — {error}
            <div style={{ marginTop: 10 }}>
              <button type="button" className="flat-action-btn" onClick={fetchAll}>Retry</button>
            </div>
          </div>
        )}

        {!error && !loading && visibleBatches.length === 0 && (
          <div className="flat-empty">{batches.length === 0 ? 'No batches recorded yet.' : 'No batches match the current filters.'}</div>
        )}

        {!error && (loading || visibleBatches.length > 0) && (
          <div className="flat-table-scroll">
            <table className="flat-table flat-table--responsive">
              <thead>
                <tr>
                  <th>Medicine</th>
                  <th>Batch no.</th>
                  <th>Supplier</th>
                  <th>Branch</th>
                  <th className="flat-col-right">Remaining</th>
                  <th>Expiry</th>
                  <th>Status</th>
                  <th className="flat-col-right flat-table-actions">Actions</th>
                </tr>
              </thead>
              {loading ? <TableSkeleton cols={8} rows={8} /> : (
                <tbody>
                  {pager.pageItems.map((b) => {
                    const pill = batchStatus(b);
                    return (
                      <tr key={b.id}>
                        <td data-label="Medicine" className="flat-table-primary">
                          <div className="flat-med-name">{b.medicine_name}</div>
                          {!b.linked && (
                            <div className="flat-table-tags">
                              <span className="flat-tag" title="Not counted in any medicine stock until it is linked">Not linked</span>
                            </div>
                          )}
                        </td>
                        <td data-label="Batch no." className="flat-col-nowrap">{b.batch_number}</td>
                        <td data-label="Supplier">{b.supplier_name || '—'}</td>
                        <td data-label="Branch">{b.branch}</td>
                        <td data-label="Remaining" className="flat-col-right">{b.quantity_remaining}</td>
                        <td data-label="Expiry" className="flat-col-nowrap">{new Date(b.expiry_date).toLocaleDateString()}</td>
                        <td data-label="Status" className="flat-col-nowrap">
                          <span className={`flat-status-label ${pill.cls}`}>{pill.label}</span>
                        </td>
                        <td className="flat-table-actions">
                          <div className="flat-table-actions__row">
                            <RowAction icon={Pencil} label="Edit" onClick={() => openEdit(b)} />
                            <RowAction icon={QrCode} label="QR" onClick={() => setQrBatch(b)} />
                            {!b.linked && <RowAction icon={Link2} label="Link to medicine" primary onClick={() => openLink(b)} />}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              )}
            </table>
          </div>
        )}
        {!error && !loading && <Pagination {...pager} itemLabel="batches" />}
      </div>

      <AnimatedModal isOpen={Boolean(linkBatch)} onClose={() => setLinkBatch(null)}>
        {linkBatch && (
          <form onSubmit={handleLink} noValidate className="card" style={{ padding: 24, border: 'none', boxShadow: 'none' }}>
            <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}><Link2 size={20} /> Link to a medicine</h2>
            <p style={{ margin: '6px 0 16px', color: 'var(--steel)', fontSize: 13 }}>
              Batch {linkBatch.batch_number} was received as <strong>{linkBatch.medicine_name}</strong>
              {linkBatch.pending_strength ? ` ${linkBatch.pending_strength}` : ''} for {linkBatch.branch}. After linking, its {linkBatch.quantity_remaining} units count toward that medicine's stock and alerts.
            </p>
            <div className="field">
              <label>Medicine in {linkBatch.branch}</label>
              <select value={linkMedicineId} onChange={(e) => setLinkMedicineId(e.target.value)} autoFocus>
                <option value="">{linkChoices.length ? 'Choose a medicine' : 'No medicines in this branch yet'}</option>
                {linkChoices.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}{m.strength ? ` · ${m.strength}` : ''}{m.id === suggested?.id ? ' (suggested)' : ''}</option>
                ))}
              </select>
            </div>
            {suggested && !linkMedicineId && (
              <button type="button" className="flat-action-btn" style={{ marginTop: 8 }} onClick={() => setLinkMedicineId(String(suggested.id))}>
                Use suggested: {suggested.name}
              </button>
            )}
            {linkError && <p className="error-text" role="alert">{linkError}</p>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button type="button" className="flat-action-btn" onClick={() => setLinkBatch(null)}>Cancel</button>
              <button type="submit" className="flat-btn-primary" disabled={linking}>{linking ? 'Linking...' : 'Link batch'}</button>
            </div>
          </form>
        )}
      </AnimatedModal>

      <QrModal
        target={qrBatch && { kind: 'batch', id: qrBatch.id, title: qrBatch.medicine_name, subtitle: `Batch ${qrBatch.batch_number}` }}
        onClose={() => setQrBatch(null)}
      />
      <ReportExportModal defaultReport="batches"
        isOpen={showExport}
        onClose={() => setShowExport(false)}
        onExportView={exportCurrentView}
        viewLabel="Download this list (CSV)"
      />
    </div>
  );
}
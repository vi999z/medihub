import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Pencil, Trash2, RefreshCw, Download, Search, X,
  Upload, QrCode, ChevronDown, Pill, PillBottle, Droplet, Syringe, Camera
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { downloadCsv } from '../utils/csv';
import { daysUntil } from '../utils/date';
import CsvImport from '../components/CsvImport';
import AnimatedModal from '../components/AnimatedModal';
import QRCodeDisplay from '../components/QRCode';
import ReceiveStockModal from '../components/ReceiveStockModal';
import StockMovementModal from '../components/StockMovementModal';

// ── Export dropdown for medicines page ────────────────────────────────────────
function MedicineExportDropdown({ onExport }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    function onClickOutside(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const OPTIONS = [
    { label: 'Current view (CSV)', key: 'csv', format: 'csv' },
    null,
    { label: 'Expired batches (Excel)', key: 'expired', format: 'excel' },
    { label: 'Depleted batches (Excel)', key: 'depleted', format: 'excel' },
    { label: 'Recalled batches (Excel)', key: 'recalled', format: 'excel' },
    { label: 'Wasted medicines (Excel)', key: 'wasted', format: 'excel' },
    null,
    { label: 'Expired batches (PDF)', key: 'expired', format: 'pdf' },
    { label: 'Wasted medicines (PDF)', key: 'wasted', format: 'pdf' },
  ];

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" className="flat-action-btn" onClick={() => setOpen(o => !o)}>
        <Download size={15} /> Export <ChevronDown size={13} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: 220,
          background: '#fff', border: '1px solid var(--flat-border)',
          borderRadius: 8, zIndex: 50, padding: '6px 0'
        }}>
          {OPTIONS.map((opt, idx) => opt === null ? (
            <hr key={idx} style={{ margin: '4px 0', border: 'none', borderTop: '1px solid var(--flat-border)' }} />
          ) : (
            <button
              key={idx}
              onClick={() => { onExport(opt.key, opt.format); setOpen(false); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--flat-text)', transition: 'background 0.12s ease' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--flat-bg)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >{opt.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

const CATEGORY_OPTIONS = [
  'Anti-inflammatory', 'Antibiotic', 'Antihistamine', 'Analgesic', 'Antacid', 'Antiemetic', 'Antipyretic',
  'Antifungal', 'Antiviral', 'Cardiovascular', 'Respiratory', 'Dermatology', 'Gastrointestinal',
  'Vitamins & Supplements', 'Hormonal', 'Diagnostic', 'Other'
];

const STOCK_FILTERS = [
  { value: 'all', label: 'All stock levels' },
  { value: 'out', label: 'Out of stock' },
  { value: 'low', label: 'Low stock' },
  { value: 'healthy', label: 'Healthy stock' },
  { value: 'expiring', label: 'Expiring in 14 days' }
];

const SORT_OPTIONS = [
  { value: 'name-asc', label: 'Name (A–Z)' },
  { value: 'name-desc', label: 'Name (Z–A)' },
  { value: 'stock-asc', label: 'Stock (lowest first)' },
  { value: 'stock-desc', label: 'Stock (highest first)' },
  { value: 'expiry-asc', label: 'Nearest expiry' },
  { value: 'category-asc', label: 'Category (A–Z)' }
];

const emptyForm = {
  name: '', generic_name: '', category: 'Other', dosage_form: '',
  strength: '', unit: '', reorder_level: 10, requires_prescription: false
};

const emptyBatchForm = {
  supplier_id: '', batch_number: '', quantity_received: '',
  quantity_remaining: '', cost_price: '', selling_price: '', manufacture_date: '', expiry_date: '', status: 'active'
};

function categoryOf(medicine) {
  return medicine.category || 'Other';
}

// Mutually-exclusive classification shared with the Dashboard's "Needs
// attention" table (server/models/reportModel.js:getNeedsAttention) — a
// medicine's `status` field decides its bucket by priority: out of stock
// beats expiring beats low stock beats healthy. Keeping both pages on the
// same source avoids the counts disagreeing for the same underlying data.
const STOCK_STATE_BY_STATUS = {
  out_of_stock: { key: 'out', cls: 'critical', label: 'Out of stock' },
  low_stock: { key: 'low', cls: 'warning', label: 'Running low' },
  expiring: { key: 'expiring', cls: 'warning', label: 'Expiring soon' },
  healthy: { key: 'healthy', cls: 'safe', label: 'In stock' },
};

function stockStateOf(medicine) {
  return STOCK_STATE_BY_STATUS[medicine.status] || STOCK_STATE_BY_STATUS.healthy;
}

// Maps each stock bucket to the flat design system's status colors
// (server/models/reportModel.js:getNeedsAttention buckets, same as Dashboard).
const STOCK_FLAT_CLS = { out: 'red', low: 'amber', expiring: 'orange', healthy: 'green' };

// No photo field exists on medicines — a generic icon by dosage form gives
// each card a quick visual cue instead of a repeated placeholder.
function iconForDosageForm(dosageForm) {
  const form = String(dosageForm || '').toLowerCase();
  if (form.includes('syrup') || form.includes('liquid') || form.includes('suspension')) return Droplet;
  if (form.includes('injection')) return Syringe;
  if (form.includes('tablet') || form.includes('capsule')) return Pill;
  return PillBottle;
}

function expiryLabel(medicine) {
  if (!medicine.nearest_expiry) return null;
  const days = daysUntil(medicine.nearest_expiry);
  if (days <= 3) return { cls: 'critical', label: `${days}d to expiry` };
  if (days <= 14) return { cls: 'warning', label: `${days}d to expiry` };
  if (days <= 60) return { cls: 'orange', label: `${days}d to expiry` };
  return { cls: 'safe', label: new Date(medicine.nearest_expiry).toLocaleDateString() };
}

function batchStatusPill(batch) {
  if (batch.status === 'expired') return { cls: 'critical', label: 'Expired' };
  if (batch.status === 'depleted') return { cls: 'orange', label: 'Depleted' };
  if (batch.status === 'recalled') return { cls: 'purple', label: 'Recalled' };
  if (!batch.expiry_date) return { cls: 'safe', label: 'Active' };
  const days = daysUntil(batch.expiry_date);
  if (days <= 3) return { cls: 'critical', label: `${days}d left` };
  if (days <= 14) return { cls: 'warning', label: `${days}d left` };
  if (days <= 60) return { cls: 'orange', label: `${days}d left` };
  return { cls: 'safe', label: 'Active' };
}

export default function Medicines() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [medicines, setMedicines] = useState([]);
  const [medicineStatusById, setMedicineStatusById] = useState({});
  const [batches, setBatches] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [showReceiveStock, setShowReceiveStock] = useState(false);
  const [receiveStockError, setReceiveStockError] = useState('');
  const [showStockMovement, setShowStockMovement] = useState(false);
  const [stockMovementError, setStockMovementError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // Medicine photo (separate from `form` since it uploads via its own
  // multipart endpoint, not the JSON create/update body).
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [imageUploading, setImageUploading] = useState(false);
  const imageInputRef = useRef(null);

  // Medicine detail modal state
  const [detailMedicine, setDetailMedicine] = useState(null);
  const [showBatchForm, setShowBatchForm] = useState(false);
  const [editingBatchId, setEditingBatchId] = useState(null);
  const [batchForm, setBatchForm] = useState(emptyBatchForm);
  const [batchError, setBatchError] = useState('');
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrBatch, setQrBatch] = useState(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('q') || '';
  const [activeCategory, setActiveCategory] = useState('All');
  const [stockFilter, setStockFilter] = useState('all');
  const [prescriptionOnly, setPrescriptionOnly] = useState(false);
  const [sortBy, setSortBy] = useState('name-asc');

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
    setImageFile(null);
    setImagePreview('');
  }

  function resetBatchForm() {
    setBatchForm(emptyBatchForm);
    setEditingBatchId(null);
    setShowBatchForm(false);
    setBatchError('');
  }

  function handleCsvImportComplete(result) {
    api.invalidateCache('/medicines');
    api.invalidateCache('/reports/needs-attention?days=14');
    api.invalidateCache('/batches');
    api.invalidateCache('/notifications');
    api.invalidateCache('/notifications?unread=true');
    fetchMedicines();
    addToast(`Imported ${result.created} medicines, ${result.batchesCreated || 0} batches, ${result.alertsCreated || 0} alerts`, 'success');
    if (result.failed > 0) {
      addToast(`${result.failed} rows failed to import`, 'error');
    }
    setShowCsvImport(false);
  }

  async function fetchMedicines() {
    try {
      const [medRes, statusRes] = await Promise.all([
        api.cachedGet('/medicines'),
        api.cachedGet('/reports/needs-attention?days=14'),
      ]);
      setMedicines(medRes.data);
      const statusMap = {};
      (statusRes.data?.items || []).forEach((item) => { statusMap[item.id] = item.status; });
      setMedicineStatusById(statusMap);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load medicines');
    } finally {
      setLoading(false);
    }
  }

  async function fetchBatches() {
    try {
      const res = await api.cachedGet('/batches');
      setBatches(res.data);
    } catch (err) {
      // Non-fatal; batches are supplementary on this page
    }
  }

  async function fetchSuppliers() {
    try {
      const res = await api.cachedGet('/suppliers');
      setSuppliers(res.data);
    } catch (err) {
      // Non-fatal
    }
  }

  async function handleReceiveStock(form) {
    setReceiveStockError('');
    try {
      await api.post('/batches', {
        ...form,
        quantity_remaining: form.quantity_received,
        status: 'active'
      });
      api.invalidateCache('/batches');
      api.invalidateCache('/medicines');
    api.invalidateCache('/reports/needs-attention?days=14');
      api.invalidateCache('/notifications');
      api.invalidateCache('/notifications?unread=true');
      await Promise.all([fetchBatches(), fetchMedicines()]);
      addToast('Stock received', 'success');
    } catch (err) {
      const message = err.response?.data?.error || 'Failed to receive stock';
      setReceiveStockError(message);
      throw err;
    }
  }

  async function handleStockMovement(form) {
    setStockMovementError('');
    try {
      await api.post('/transactions', form);
      api.invalidateCache('/transactions/recent');
      api.invalidateCache('/batches');
      api.invalidateCache('/medicines');
    api.invalidateCache('/reports/needs-attention?days=14');
      api.invalidateCache('/notifications');
      api.invalidateCache('/notifications?unread=true');
      await Promise.all([fetchBatches(), fetchMedicines()]);
      addToast('Stock movement recorded', 'success');
    } catch (err) {
      const message = err.response?.data?.error || 'Failed to record stock movement';
      setStockMovementError(message);
      throw err;
    }
  }

  useEffect(() => {
    fetchMedicines();
    fetchBatches();
    fetchSuppliers();
  }, []);

  // Handle scanner "Add to Stock" navigation: open the first medicine's batch form
  useEffect(() => {
    if (searchParams.get('addBatch') === 'true' && medicines.length > 0) {
      const target = medicines[0];
      setDetailMedicine(target);
      setShowBatchForm(true);
      setBatchForm((prev) => ({ ...prev, batch_number: searchParams.get('code') || '' }));
      // Clear the param so it doesn't re-trigger
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, medicines, setSearchParams]);

  function openCreate() {
    resetForm();
    setShowForm(true);
  }

  const categories = useMemo(() => {
    const used = new Set(medicines.map(categoryOf));
    return CATEGORY_OPTIONS.filter((option) => used.has(option))
      .concat([...used].filter((category) => !CATEGORY_OPTIONS.includes(category)).sort());
  }, [medicines]);

  const countsByCategory = useMemo(() => medicines.reduce((acc, medicine) => {
    const category = categoryOf(medicine);
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {}), [medicines]);

  // Overlay the authoritative status (out_of_stock/low_stock/expiring/healthy)
  // from the shared needs-attention classification onto the full medicine
  // records, so counts and filtering here always agree with the Dashboard.
  const medicinesWithStatus = useMemo(() => medicines.map((medicine) => ({
    ...medicine,
    status: medicineStatusById[medicine.id] || 'healthy',
  })), [medicines, medicineStatusById]);

  const summary = useMemo(() => medicinesWithStatus.reduce((acc, medicine) => {
    acc[stockStateOf(medicine).key] += 1;
    return acc;
  }, { out: 0, low: 0, healthy: 0, expiring: 0 }), [medicinesWithStatus]);

  const visibleMedicines = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = medicinesWithStatus.filter((medicine) => {
      if (activeCategory !== 'All' && categoryOf(medicine) !== activeCategory) return false;
      if (prescriptionOnly && !medicine.requires_prescription) return false;
      if (stockFilter !== 'all' && stockStateOf(medicine).key !== stockFilter) return false;
      if (!term) return true;
      return [medicine.name, medicine.generic_name, medicine.category, medicine.dosage_form, medicine.strength]
        .some((value) => String(value || '').toLowerCase().includes(term));
    });

    const [field, direction] = sortBy.split('-');
    const sign = direction === 'desc' ? -1 : 1;
    return filtered.sort((a, b) => {
      if (field === 'stock') return sign * ((Number(a.total_stock) || 0) - (Number(b.total_stock) || 0));
      if (field === 'expiry') {
        const av = a.nearest_expiry ? new Date(a.nearest_expiry).getTime() : Infinity;
        const bv = b.nearest_expiry ? new Date(b.nearest_expiry).getTime() : Infinity;
        return sign * (av - bv);
      }
      if (field === 'category') {
        const byCategory = categoryOf(a).localeCompare(categoryOf(b));
        if (byCategory !== 0) return sign * byCategory;
      }
      return sign * String(a.name || '').localeCompare(String(b.name || ''));
    });
  }, [medicines, search, activeCategory, stockFilter, prescriptionOnly, sortBy]);

  const filtersActive = search || activeCategory !== 'All' || stockFilter !== 'all' || prescriptionOnly;

  function updateSearch(value) {
    setSearchParams(value ? { q: value } : {}, { replace: true });
  }

  function clearFilters() {
    updateSearch('');
    setActiveCategory('All');
    setStockFilter('all');
    setPrescriptionOnly(false);
  }

  function openEdit(medicine) {
    setEditingId(medicine.id);
    setForm({
      name: medicine.name || '',
      generic_name: medicine.generic_name || '',
      category: categoryOf(medicine),
      dosage_form: medicine.dosage_form || '',
      strength: medicine.strength || '',
      unit: medicine.unit || '',
      reorder_level: medicine.reorder_level || 10,
      requires_prescription: Boolean(medicine.requires_prescription)
    });
    setImageFile(null);
    setImagePreview(medicine.image_url || '');
    setShowForm(true);
  }

  function handleImageSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function clearImageSelection() {
    setImageFile(null);
    setImagePreview('');
    if (imageInputRef.current) imageInputRef.current.value = '';
  }

  async function removeExistingImage() {
    if (!editingId) { clearImageSelection(); return; }
    if (!window.confirm('Remove this medicine’s photo?')) return;
    try {
      await api.delete(`/medicines/${editingId}/image`);
      api.invalidateCache('/medicines');
      clearImageSelection();
      await fetchMedicines();
      addToast('Photo removed', 'success');
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to remove photo', 'error');
    }
  }

  async function uploadMedicineImage(id, file) {
    setImageUploading(true);
    try {
      const body = new FormData();
      body.append('image', file);
      await api.post(`/medicines/${id}/image`, body, { headers: { 'Content-Type': 'multipart/form-data' } });
      api.invalidateCache('/medicines');
    } catch (err) {
      addToast(err.response?.data?.error || 'Medicine saved, but the photo failed to upload', 'error');
    } finally {
      setImageUploading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      let medicineId = editingId;
      if (editingId) {
        await api.put(`/medicines/${editingId}`, form);
        addToast('Medicine updated', 'success');
      } else {
        const res = await api.post('/medicines', form);
        medicineId = res.data.id;
        addToast('Medicine added', 'success');
      }
      if (imageFile && medicineId) {
        await uploadMedicineImage(medicineId, imageFile);
      }
      api.invalidateCache('/medicines');
    api.invalidateCache('/reports/needs-attention?days=14');
      resetForm();
      await fetchMedicines();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save medicine');
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this medicine from the catalog?')) return;
    try {
      await api.delete(`/medicines/${id}`);
      api.invalidateCache('/medicines');
    api.invalidateCache('/reports/needs-attention?days=14');
      api.invalidateCache('/notifications');
      api.invalidateCache('/notifications?unread=true');
      api.invalidateCache('/batches');
      await fetchMedicines();
      await fetchBatches();
      addToast('Medicine deleted', 'success');
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to delete medicine', 'error');
    }
  }

  async function handleRefresh() {
    setLoading(true);
    api.invalidateCache('/medicines');
    api.invalidateCache('/reports/needs-attention?days=14');
    api.invalidateCache('/batches');
    await Promise.all([fetchMedicines(), fetchBatches()]);
    addToast('Catalog refreshed', 'success');
  }

  async function handleExport(key, format) {
    if (key === 'csv') {
      const rows = visibleMedicines.map((medicine) => ({
        id: medicine.id, name: medicine.name, generic_name: medicine.generic_name || '',
        category: categoryOf(medicine), dosage_form: medicine.dosage_form || '',
        strength: medicine.strength || '', unit: medicine.unit || '',
        total_stock: medicine.total_stock ?? '', reorder_level: medicine.reorder_level || '',
        stock_status: stockStateOf(medicine).label,
        nearest_expiry: medicine.nearest_expiry ? String(medicine.nearest_expiry).slice(0, 10) : '',
        requires_prescription: medicine.requires_prescription ? 'Yes' : 'No'
      }));
      downloadCsv('medicines.csv', rows, ['id', 'name', 'generic_name', 'category', 'dosage_form', 'strength', 'unit', 'total_stock', 'reorder_level', 'stock_status', 'nearest_expiry', 'requires_prescription']);
      return;
    }
    try {
      const endpoint = key === 'wasted'
        ? `/reports/export/wasted?format=${format}`
        : `/reports/export/batches?status=${key}&format=${format}`;
      const res = await api.get(endpoint, { responseType: 'blob' });
      const ext = format === 'pdf' ? 'pdf' : format === 'docx' ? 'docx' : 'xlsx';
      const blob = new Blob([res.data], { type: res.headers['content-type'] || 'application/octet-stream' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${key}_${new Date().toISOString().slice(0, 10)}.${ext}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      addToast('Export downloaded', 'success');
    } catch (err) {
      addToast('Export failed', 'error');
    }
  }

  // ---- Batch handlers (integrated into medicine detail modal) ----

  function openDetail(medicine) {
    setDetailMedicine(medicine);
    resetBatchForm();
  }

  function closeDetail() {
    setDetailMedicine(null);
    resetBatchForm();
  }

  const detailBatches = useMemo(() => {
    if (!detailMedicine) return [];
    return batches
      .filter((b) => Number(b.medicine_id) === Number(detailMedicine.id) && Number(b.quantity_remaining) > 0)
      .sort((a, b) => {
        const av = a.expiry_date ? new Date(a.expiry_date).getTime() : Infinity;
        const bv = b.expiry_date ? new Date(b.expiry_date).getTime() : Infinity;
        return av - bv;
      });
  }, [batches, detailMedicine]);

  function openBatchCreate() {
    setEditingBatchId(null);
    setBatchForm(emptyBatchForm);
    setShowBatchForm(true);
    setBatchError('');
  }

  function openBatchEdit(batch) {
    setEditingBatchId(batch.id);
    setBatchForm({
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
    setShowBatchForm(true);
    setBatchError('');
  }

  async function handleBatchSubmit(e) {
    e.preventDefault();
    setBatchError('');
    const payload = { ...batchForm, medicine_id: detailMedicine.id };
    try {
      if (editingBatchId) {
        await api.put(`/batches/${editingBatchId}`, payload);
        addToast('Batch updated', 'success');
      } else {
        await api.post('/batches', payload);
        addToast('Batch received', 'success');
      }
      api.invalidateCache('/batches');
      api.invalidateCache('/medicines');
    api.invalidateCache('/reports/needs-attention?days=14');
      api.invalidateCache('/notifications');
      api.invalidateCache('/notifications?unread=true');
      resetBatchForm();
      await Promise.all([fetchBatches(), fetchMedicines()]);
      // Refresh the detail medicine object so stock/expiry reflect the new batch
      const updated = medicines.find((m) => Number(m.id) === Number(detailMedicine.id));
      if (updated) setDetailMedicine(updated);
    } catch (err) {
      setBatchError(err.response?.data?.error || 'Failed to save batch');
    }
  }

  async function handleBatchDelete(batch) {
    if (!window.confirm(`Delete batch ${batch.batch_number || batch.id}?`)) return;
    try {
      await api.delete(`/batches/${batch.id}`);
      api.invalidateCache('/batches');
      api.invalidateCache('/medicines');
    api.invalidateCache('/reports/needs-attention?days=14');
      api.invalidateCache('/notifications');
      api.invalidateCache('/notifications?unread=true');
      await Promise.all([fetchBatches(), fetchMedicines()]);
      const updated = medicines.find((m) => Number(m.id) === Number(detailMedicine.id));
      if (updated) setDetailMedicine(updated);
      addToast('Batch deleted', 'success');
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to delete batch', 'error');
    }
  }

  return (
    <div className="flat-dashboard">
      <div className="page-header">
        <div>
          <h1>Medicines</h1>
          <p>
            {loading ? 'Loading catalog…' : `${visibleMedicines.length} of ${medicines.length} products shown`}
          </p>
        </div>
        <div className="page-header-actions">
          <MedicineExportDropdown onExport={handleExport} />
          <button className="flat-action-btn" onClick={handleRefresh}>
            <RefreshCw size={15} /> Refresh
          </button>
          {(user.role === 'admin' || user.role === 'pharmacist') && (
            <>
              <button className="flat-action-btn" onClick={() => setShowCsvImport(true)}>
                <Upload size={15} /> Import medicine list
              </button>
              <button className="flat-btn-primary" onClick={openCreate}>
                <Plus size={15} /> Add medicine
              </button>
            </>
          )}
          {(user.role === 'admin' || user.role === 'pharmacist') && (
            <button className="flat-btn-primary" onClick={() => { setReceiveStockError(''); setShowReceiveStock(true); }}>
              <Plus size={15} /> Receive stock
            </button>
          )}
        </div>
      </div>

      <div className="flat-card flat-stock-strip">
        <button type="button" className={`flat-stock-col${stockFilter === 'out' ? ' active' : ''}`} onClick={() => setStockFilter(stockFilter === 'out' ? 'all' : 'out')}>
          <span className="flat-stock-dot red" />
          <span className="flat-stock-text">
            <span className="flat-stock-number">{summary.out}</span>
            <span className="flat-stock-label">Out of stock</span>
          </span>
        </button>
        <button type="button" className={`flat-stock-col${stockFilter === 'low' ? ' active' : ''}`} onClick={() => setStockFilter(stockFilter === 'low' ? 'all' : 'low')}>
          <span className="flat-stock-dot amber" />
          <span className="flat-stock-text">
            <span className="flat-stock-number">{summary.low}</span>
            <span className="flat-stock-label">At or below reorder level</span>
          </span>
        </button>
        <button type="button" className={`flat-stock-col${stockFilter === 'expiring' ? ' active' : ''}`} onClick={() => setStockFilter(stockFilter === 'expiring' ? 'all' : 'expiring')}>
          <span className="flat-stock-dot orange" />
          <span className="flat-stock-text">
            <span className="flat-stock-number">{summary.expiring}</span>
            <span className="flat-stock-label">Expiring within 14 days</span>
          </span>
        </button>
        <button type="button" className={`flat-stock-col${stockFilter === 'healthy' ? ' active' : ''}`} onClick={() => setStockFilter(stockFilter === 'healthy' ? 'all' : 'healthy')}>
          <span className="flat-stock-dot green" />
          <span className="flat-stock-text">
            <span className="flat-stock-number">{summary.healthy}</span>
            <span className="flat-stock-label">Healthy stock</span>
          </span>
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="flat-card" style={{ marginBottom: 0, padding: 16, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Photo</label>
            <div className="flat-photo-picker">
              <div className="flat-photo-preview">
                {imagePreview ? <img src={imagePreview} alt="" /> : <Camera size={22} />}
              </div>
              <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleImageSelect} hidden />
              <button type="button" className="flat-action-btn" onClick={() => imageInputRef.current?.click()}>
                <Camera size={13} /> {imagePreview ? 'Change photo' : 'Choose photo'}
              </button>
              {imagePreview && (
                <button type="button" className="flat-action-btn" onClick={removeExistingImage}>
                  <X size={13} /> Remove
                </button>
              )}
              {imageUploading && <span className="flat-med-meta">Uploading…</span>}
            </div>
          </div>
          <div className="field"><label>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
          <div className="field"><label>Generic name</label><input value={form.generic_name} onChange={(e) => setForm({ ...form, generic_name: e.target.value })} /></div>
          <div className="field">
            <label>Category</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
          <div className="field"><label>Dosage form</label><input value={form.dosage_form} onChange={(e) => setForm({ ...form, dosage_form: e.target.value })} /></div>
          <div className="field"><label>Strength</label><input value={form.strength} onChange={(e) => setForm({ ...form, strength: e.target.value })} /></div>
          <div className="field"><label>Unit</label><input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} required /></div>
          <div className="field"><label>Reorder level</label><input type="number" value={form.reorder_level} onChange={(e) => setForm({ ...form, reorder_level: e.target.value })} /></div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
            <input type="checkbox" checked={form.requires_prescription} onChange={(e) => setForm({ ...form, requires_prescription: e.target.checked })} />
            Requires prescription
          </label>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10 }}>
            <button type="submit" className="flat-btn-primary">{editingId ? 'Update medicine' : 'Save medicine'}</button>
            <button type="button" className="flat-action-btn" onClick={resetForm}>Cancel</button>
          </div>
          {error && <p className="error-text" style={{ gridColumn: '1 / -1' }}>{error}</p>}
        </form>
      )}

      <div className="flat-card" style={{ padding: '16px' }}>
        <div className="filter-bar" style={{ margin: 0, background: 'none', border: 'none', padding: 0 }}>
          <div className="filter-search">
            <Search size={15} className="filter-search-icon" />
            <input
              value={search}
              onChange={(e) => updateSearch(e.target.value)}
              placeholder="Search name, generic name, dosage form…"
              aria-label="Search medicines"
            />
            {search && (
              <button type="button" className="btn-icon filter-search-clear" onClick={() => updateSearch('')} title="Clear search">
                <X size={14} />
              </button>
            )}
          </div>
          <div className="field filter-select">
            <select value={stockFilter} onChange={(e) => setStockFilter(e.target.value)} aria-label="Filter by stock level">
              {STOCK_FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div className="field filter-select">
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="Sort medicines">
              {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>Sort: {option.label}</option>)}
            </select>
          </div>
          <label className="filter-toggle">
            <input type="checkbox" checked={prescriptionOnly} onChange={(e) => setPrescriptionOnly(e.target.checked)} />
            Prescription only
          </label>
          {filtersActive && (
            <button type="button" className="flat-action-btn" onClick={clearFilters}>
              <X size={15} /> Clear filters
            </button>
          )}
        </div>

        <div className="chip-row" style={{ marginBottom: 0, paddingBottom: 0 }}>
          <button type="button" className={`chip ${activeCategory === 'All' ? 'active' : ''}`} onClick={() => setActiveCategory('All')}>
            All <span>{medicines.length}</span>
          </button>
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              className={`chip ${activeCategory === category ? 'active' : ''}`}
              onClick={() => setActiveCategory(activeCategory === category ? 'All' : category)}
            >
              {category} <span>{countsByCategory[category]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flat-card">
        <div className="flat-table-header">
          <span className="flat-table-title">Catalog</span>
          {filtersActive && (
            <button type="button" className="flat-table-link" onClick={clearFilters}>Clear filters</button>
          )}
        </div>
        <div style={{ padding: 16 }}>
          {error && (
            <div className="flat-empty">
              Unable to load medicines — {error}
              <div style={{ marginTop: 10 }}>
                <button type="button" className="flat-action-btn" onClick={fetchMedicines}>Retry</button>
              </div>
            </div>
          )}
          {!error && !loading && visibleMedicines.length === 0 && (
            <div className="flat-empty">No medicines match the current filters.</div>
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
          {!error && !loading && visibleMedicines.length > 0 && (
            <div className="flat-card-grid">
              {visibleMedicines.map((m) => {
                const state = stockStateOf(m);
                const expiry = expiryLabel(m);
                const Icon = iconForDosageForm(m.dosage_form);
                return (
                  <div key={m.id} className={`flat-card flat-item-card flat-item-card--${STOCK_FLAT_CLS[state.key]}`} onClick={() => openDetail(m)}>
                    <div className="flat-item-card__top">
                      <div className="flat-item-icon">
                        {m.image_url ? <img src={m.image_url} alt="" /> : <Icon size={22} />}
                      </div>
                      <span className={`flat-status-label ${STOCK_FLAT_CLS[state.key]}`}>{state.label}</span>
                    </div>
                    <div className="flat-med-name">{m.name}</div>
                    <div className="flat-med-meta">
                      {m.generic_name || '—'}
                      {m.requires_prescription ? ' · Rx' : ''}
                    </div>
                    <span className="flat-tag">{categoryOf(m)}</span>
                    <div className="flat-item-row">
                      <span>Stock</span>
                      <strong>{m.total_stock ?? 0} {m.unit}</strong>
                    </div>
                    <div className="flat-item-row">
                      <span>Expires</span>
                      <strong>{expiry ? expiry.label : '—'}</strong>
                    </div>
                    <div className="flat-item-card__actions">
                      <button type="button" className="flat-action-btn" onClick={(e) => { e.stopPropagation(); openEdit(m); }}>
                        <Pencil size={13} /> Edit
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Medicine detail modal with integrated batches */}
      <AnimatedModal isOpen={Boolean(detailMedicine)} onClose={closeDetail} className="medicine-detail-modal">
        {detailMedicine && (
          <div className="medicine-detail-modal__body">
            <div className="medicine-detail-modal__header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                {detailMedicine.image_url && (
                  <div className="flat-item-icon" style={{ width: 56, height: 56 }}>
                    <img src={detailMedicine.image_url} alt="" />
                  </div>
                )}
                <div>
                  <h2 style={{ margin: 0 }}>{detailMedicine.name}</h2>
                  <p style={{ margin: '4px 0 0', color: 'var(--steel)', fontSize: 13 }}>
                    {[detailMedicine.generic_name, detailMedicine.dosage_form, detailMedicine.strength].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={`status-pill ${stockStateOf(detailMedicine).cls}`}>{stockStateOf(detailMedicine).label}</span>
                <button type="button" className="btn-icon" onClick={closeDetail} title="Close medicine details"><X size={18} /></button>
              </div>
            </div>

            <div className="medicine-detail-stats">
              <div className="medicine-detail-stat">
                <div style={{ color: 'var(--steel)', fontSize: 11 }}>Total stock</div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{detailMedicine.total_stock ?? 0} {detailMedicine.unit}</div>
              </div>
              <div className="medicine-detail-stat">
                <div style={{ color: 'var(--steel)', fontSize: 11 }}>Reorder level</div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{detailMedicine.reorder_level ?? 0}</div>
              </div>
              <div className="medicine-detail-stat">
                <div style={{ color: 'var(--steel)', fontSize: 11 }}>Batches</div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{detailBatches.length}</div>
              </div>
            </div>

            <div className="medicine-detail-modal__section-header">
              <h3 style={{ margin: 0 }}>Batches</h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-secondary" onClick={() => { setStockMovementError(''); setShowStockMovement(true); }} disabled={detailBatches.length === 0}>
                  Record movement
                </button>
                <button className="btn btn-primary" onClick={openBatchCreate}>
                  <Plus size={14} /> Receive stock
                </button>
              </div>
            </div>

            {showBatchForm && (
              <form onSubmit={handleBatchSubmit} className="card" style={{ marginBottom: 16, padding: 16, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                <div className="field">
                  <label>Supplier</label>
                  <select value={batchForm.supplier_id} onChange={(e) => setBatchForm({ ...batchForm, supplier_id: e.target.value })}>
                    <option value="">No supplier</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                    ))}
                  </select>
                </div>
                <div className="field"><label>Batch number</label><input value={batchForm.batch_number} onChange={(e) => setBatchForm({ ...batchForm, batch_number: e.target.value })} required /></div>
                <div className="field"><label>Quantity received</label><input type="number" min="1" value={batchForm.quantity_received} onChange={(e) => setBatchForm({ ...batchForm, quantity_received: e.target.value })} required /></div>
                <div className="field"><label>Remaining quantity</label><input type="number" min="0" value={batchForm.quantity_remaining} onChange={(e) => setBatchForm({ ...batchForm, quantity_remaining: e.target.value })} /></div>
                <div className="field"><label>Expiry date</label><input type="date" value={batchForm.expiry_date} onChange={(e) => setBatchForm({ ...batchForm, expiry_date: e.target.value })} required /></div>
                <div className="field"><label>Manufacture date</label><input type="date" value={batchForm.manufacture_date} onChange={(e) => setBatchForm({ ...batchForm, manufacture_date: e.target.value })} /></div>
                <div className="field"><label>Cost price</label><input type="number" step="0.01" value={batchForm.cost_price} onChange={(e) => setBatchForm({ ...batchForm, cost_price: e.target.value })} /></div>
                <div className="field"><label>Selling price</label><input type="number" step="0.01" value={batchForm.selling_price} onChange={(e) => setBatchForm({ ...batchForm, selling_price: e.target.value })} /></div>
                <div className="field"><label>Status</label><select value={batchForm.status} onChange={(e) => setBatchForm({ ...batchForm, status: e.target.value })}><option value="active">Active</option><option value="recalled">Recalled</option><option value="depleted">Depleted</option><option value="expired">Expired</option></select></div>
                <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10 }}>
                  <button type="submit" className="btn btn-primary">{editingBatchId ? 'Update batch' : 'Save batch'}</button>
                  <button type="button" className="btn btn-secondary" onClick={resetBatchForm}>Cancel</button>
                </div>
                {batchError && <p className="error-text" style={{ gridColumn: '1 / -1' }}>{batchError}</p>}
              </form>
            )}

            {detailBatches.length === 0 && !showBatchForm && (
              <div className="empty-state" style={{ padding: '24px' }}>
                <strong>No batches for this medicine</strong>
                <p style={{ margin: '6px 0 0' }}>Receive stock to add a batch.</p>
              </div>
            )}

            {detailBatches.length > 0 && (
              <div className="medicine-detail-batches">
                {detailBatches.map((b) => {
                    const pill = batchStatusPill(b);
                    const borderColorMap = { 'safe': 'var(--green)', 'warning': 'var(--gold)', 'critical': 'var(--red)' };
                            return (
                      <div
                        key={b.id}
                        className="card"
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          padding: '14px',
                          borderTop: `4px solid ${borderColorMap[pill.cls]}`
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                          <span className="stamp" style={{ fontSize: '11px' }}>Batch: {b.batch_number}</span>
                          <span className={`status-pill ${pill.cls}`} style={{ fontSize: '10px', padding: '3px 8px' }}>{pill.label}</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12, marginBottom: 8 }}>
                          <div>
                            <div style={{ color: 'var(--steel)', fontSize: 11 }}>Remaining</div>
                            <div style={{ fontWeight: 600 }}>{b.quantity_remaining}</div>
                          </div>
                          <div>
                            <div style={{ color: 'var(--steel)', fontSize: 11 }}>Expiry</div>
                            <div style={{ fontWeight: 600 }}>{new Date(b.expiry_date).toLocaleDateString()}</div>
                          </div>
                        </div>
                        {b.supplier_name && (
                          <div style={{ fontSize: 11, color: 'var(--steel)', marginBottom: 8 }}>
                            Supplier: <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{b.supplier_name}</span>
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 'auto' }}>
                          <button
                            type="button"
                            onClick={() => openBatchEdit(b)}
                            style={{
                              width: '30px', height: '30px', borderRadius: '50%', background: 'var(--bg-subtle)',
                              border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
                            }}
                            title="Edit batch"
                          >
                            <Pencil size={13} color="var(--ink)" />
                          </button>
                          <button
                            type="button"
                            onClick={() => { setQrBatch(b); setShowQRModal(true); }}
                            style={{
                              width: '30px', height: '30px', borderRadius: '50%', background: 'var(--bg-subtle)',
                              border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
                            }}
                            title="Show QR code"
                          >
                            <QrCode size={13} color="var(--ink)" />
                          </button>
                          {(user.role === 'admin' || user.role === 'pharmacist') && (
                            <button
                              type="button"
                              onClick={() => handleBatchDelete(b)}
                              style={{
                                width: '30px', height: '30px', borderRadius: '50%', background: 'var(--bg-subtle)',
                                border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
                              }}
                              title="Delete batch"
                            >
                              <Trash2 size={13} color="var(--red)" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}
      </AnimatedModal>

      {/* QR code modal */}
      <AnimatedModal isOpen={showQRModal && Boolean(qrBatch)} onClose={() => setShowQRModal(false)}>
        {qrBatch && (
          <div className="card" style={{ padding: 24, border: 'none', boxShadow: 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>Batch QR Code</h3>
              <button type="button" className="btn-icon" onClick={() => setShowQRModal(false)} title="Close QR code"><X size={18} /></button>
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
          </div>
        )}
      </AnimatedModal>

      <AnimatedModal isOpen={showCsvImport} onClose={() => setShowCsvImport(false)}>
        <CsvImport
          onClose={() => setShowCsvImport(false)}
          onImportComplete={handleCsvImportComplete}
          entityType="medicines"
        />
      </AnimatedModal>

      <ReceiveStockModal
        isOpen={showReceiveStock}
        onClose={() => setShowReceiveStock(false)}
        medicines={medicines}
        suppliers={suppliers}
        onSubmit={handleReceiveStock}
        error={receiveStockError}
      />

      {detailMedicine && (
        <StockMovementModal
          isOpen={showStockMovement}
          onClose={() => setShowStockMovement(false)}
          medicine={detailMedicine}
          batches={detailBatches.filter((batch) => batch.status === 'active' || batch.status === 'depleted')}
          onSubmit={handleStockMovement}
          error={stockMovementError}
        />
      )}
    </div>
  );
}
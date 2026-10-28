import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Pencil, Trash2, RefreshCw, Search, X,
  Upload, QrCode, Pill, PillBottle, Droplet, Syringe, Camera
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import api, { resolveFileUrl } from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useDialog } from '../context/DialogContext';
import { downloadCsv } from '../utils/csv';
import { daysUntil } from '../utils/date';
import { batchStatus } from '../utils/batchStatus';
import { validateMedicineForm, trimFields, MAX_LENGTH } from '../utils/validation';
import CsvImport from '../components/CsvImport';
import AnimatedModal from '../components/AnimatedModal';
import BatchQrModal from '../components/BatchQrModal';
import ReceiveStockModal from '../components/ReceiveStockModal';
import StockMovementModal from '../components/StockMovementModal';
import ExportDropdown from '../components/ExportDropdown';
import { downloadBlob } from '../utils/downloadFile';

const EXPORT_OPTIONS = [
  { label: 'Expired batches (Excel)', key: 'expired', format: 'excel' },
  { label: 'Depleted batches (Excel)', key: 'depleted', format: 'excel' },
  { label: 'Recalled batches (Excel)', key: 'recalled', format: 'excel' },
  { label: 'Wasted medicines (Excel)', key: 'wasted', format: 'excel' },
  null,
  { label: 'Expired batches (PDF)', key: 'expired', format: 'pdf' },
  { label: 'Wasted medicines (PDF)', key: 'wasted', format: 'pdf' },
  null,
  { label: 'Current view (CSV)', key: 'csv', format: 'csv' },
];

const CATEGORY_OPTIONS = [
  'Anti-inflammatory', 'Antibiotic', 'Antihistamine', 'Analgesic', 'Antacid', 'Antiemetic', 'Antipyretic',
  'Antifungal', 'Antiviral', 'Cardiovascular', 'Respiratory', 'Dermatology', 'Gastrointestinal',
  'Vitamins & Supplements', 'Hormonal', 'Diagnostic', 'Other'
];

const BRANCH_OPTIONS = ['QMC', 'MT Carmel'];

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
  { value: 'category-asc', label: 'Category (A–Z)' },
  { value: 'value-desc', label: 'Value (highest first)' },
  { value: 'margin-asc', label: 'Margin (lowest first)' }
];

const emptyForm = {
  name: '', generic_name: '', category: 'Other', dosage_form: '',
  strength: '', unit: '', reorder_level: 10, requires_prescription: false, branch: 'QMC'
};

function categoryOf(medicine) {
  return medicine.category || 'Other';
}

// Same formula as the Dashboard's aggregate margin (server/models/reportModel.js:43),
// applied per medicine so "Margin (lowest first)" can surface the worst performers.
function marginOf(medicine) {
  const retail = Number(medicine.retail_value) || 0;
  const cost = Number(medicine.inventory_value) || 0;
  return retail > 0 ? ((retail - cost) / retail) * 100 : 0;
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

export default function Medicines() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { confirm } = useDialog();
  const [medicines, setMedicines] = useState([]);
  const [medicineStatusById, setMedicineStatusById] = useState({});
  const [batches, setBatches] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [showReceiveStock, setShowReceiveStock] = useState(false);
  const [receiveStockError, setReceiveStockError] = useState('');
  const [scannedCode, setScannedCode] = useState('');
  const [showStockMovement, setShowStockMovement] = useState(false);
  const [stockMovementError, setStockMovementError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
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
  const [editingBatch, setEditingBatch] = useState(null);
  const [batchError, setBatchError] = useState('');
  const [qrBatch, setQrBatch] = useState(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('q') || '';
  const [activeCategory, setActiveCategory] = useState('All');
  const [stockFilter, setStockFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [prescriptionOnly, setPrescriptionOnly] = useState(false);
  const [sortBy, setSortBy] = useState(() => searchParams.get('sort') || 'name-asc');

  function resetForm() {
    setFormError('');
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
    setImageFile(null);
    setImagePreview('');
  }

  function resetBatchForm() {
    setEditingBatch(null);
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

  // Scanner "Add to stock" lands here with ?addBatch=true&code=…: open the
  // Receive stock form with the scanned code as the batch number, and let the
  // user pick which medicine it belongs to.
  useEffect(() => {
    if (searchParams.get('addBatch') === 'true') {
      setScannedCode(searchParams.get('code') || '');
      setReceiveStockError('');
      setShowReceiveStock(true);
      // Clear the param so it doesn't re-trigger
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

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
      if (branchFilter !== 'all' && (medicine.branch || 'QMC') !== branchFilter) return false;
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
      if (field === 'value') return sign * ((Number(a.inventory_value) || 0) - (Number(b.inventory_value) || 0));
      if (field === 'margin') return sign * (marginOf(a) - marginOf(b));
      return sign * String(a.name || '').localeCompare(String(b.name || ''));
    });
  }, [medicinesWithStatus, search, activeCategory, stockFilter, branchFilter, prescriptionOnly, sortBy]);

  const filtersActive = search || activeCategory !== 'All' || stockFilter !== 'all' || branchFilter !== 'all' || prescriptionOnly;

  function updateSearch(value) {
    setSearchParams(value ? { q: value } : {}, { replace: true });
  }

  function clearFilters() {
    updateSearch('');
    setActiveCategory('All');
    setStockFilter('all');
    setBranchFilter('all');
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
      requires_prescription: Boolean(medicine.requires_prescription),
      branch: medicine.branch || 'QMC'
    });
    setImageFile(null);
    setImagePreview(resolveFileUrl(medicine.image_url) || '');
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
    if (!(await confirm({ title: 'Remove photo', message: 'Remove this medicine’s photo?', confirmLabel: 'Remove', danger: true }))) return;
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
    if (saving) return;
    setFormError('');
    const validationError = validateMedicineForm(form);
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setSaving(true);
    try {
      const payload = trimFields(form);
      let medicineId = editingId;
      if (editingId) {
        await api.put(`/medicines/${editingId}`, payload);
        addToast('Medicine updated', 'success');
      } else {
        const res = await api.post('/medicines', payload);
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
      setFormError(err.response?.data?.error || 'Failed to save medicine');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(medicine) {
    const medicineBatches = batches.filter((b) => b.medicine_id === medicine.id);
    const inStock = Number(medicine.total_stock) || 0;
    const details = medicineBatches.length
      ? ` Its ${medicineBatches.length} batch${medicineBatches.length === 1 ? '' : 'es'}${inStock ? ` (${inStock} ${medicine.unit} in stock)` : ''} and their stock movement history will be deleted too.`
      : '';
    if (!(await confirm({
      title: 'Delete medicine',
      message: `Delete ${medicine.name} from the catalog?${details} This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    }))) return;
    try {
      await api.delete(`/medicines/${medicine.id}`);
      api.invalidateCache('/medicines');
      api.invalidateCache('/reports/needs-attention?days=14');
      api.invalidateCache('/notifications');
      api.invalidateCache('/notifications?unread=true');
      api.invalidateCache('/batches');
      api.invalidateCache('/transactions/recent');
      if (detailMedicine?.id === medicine.id) closeDetail();
      await fetchMedicines();
      await fetchBatches();
      addToast(`${medicine.name} deleted`, 'success');
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
      downloadBlob(blob, `${key}_${new Date().toISOString().slice(0, 10)}.${ext}`);
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
    setEditingBatch(null);
    setShowBatchForm(true);
    setBatchError('');
  }

  function openBatchEdit(batch) {
    setEditingBatch(batch);
    setShowBatchForm(true);
    setBatchError('');
  }

  async function handleBatchSubmit(form) {
    setBatchError('');
    const payload = { ...form, medicine_id: detailMedicine.id };
    try {
      if (editingBatch) {
        await api.put(`/batches/${editingBatch.id}`, payload);
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
      throw err;
    }
  }

  async function handleBatchDelete(batch) {
    if (!(await confirm({ title: 'Delete batch', message: `Delete batch ${batch.batch_number || batch.id}?`, confirmLabel: 'Delete', danger: true }))) return;
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
      <div className="page-actions-only">
        <div className="page-header-actions">
          <ExportDropdown options={EXPORT_OPTIONS} onSelect={({ key, format }) => handleExport(key, format)} />
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

      <AnimatedModal isOpen={showForm} onClose={resetForm} className="medicine-form-modal">
        {showForm && (
        <div className="medicine-form-modal__body">
        <div className="medicine-form-modal__header">
          <h2 style={{ margin: 0 }}>{editingId ? 'Edit medicine' : 'Add medicine'}</h2>
          <button type="button" className="btn-icon" onClick={resetForm} title="Close"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} noValidate style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(250px, 100%), 1fr))' }}>
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
          <div className="field"><label>Name</label><input value={form.name} maxLength={MAX_LENGTH.medicineName} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
          <div className="field"><label>Generic name</label><input value={form.generic_name} maxLength={MAX_LENGTH.genericName} onChange={(e) => setForm({ ...form, generic_name: e.target.value })} /></div>
          <div className="field">
            <label>Category</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              {/* Keep a custom category (e.g. from a CSV import) selectable when editing */}
              {form.category && !CATEGORY_OPTIONS.includes(form.category) && <option value={form.category}>{form.category}</option>}
            </select>
          </div>
          <div className="field"><label>Dosage form</label><input value={form.dosage_form} maxLength={MAX_LENGTH.dosageForm} placeholder="e.g. Tablet" onChange={(e) => setForm({ ...form, dosage_form: e.target.value })} /></div>
          <div className="field"><label>Strength</label><input value={form.strength} maxLength={MAX_LENGTH.strength} placeholder="e.g. 500mg" onChange={(e) => setForm({ ...form, strength: e.target.value })} /></div>
          <div className="field"><label>Unit</label><input value={form.unit} maxLength={MAX_LENGTH.unit} placeholder="e.g. box" onChange={(e) => setForm({ ...form, unit: e.target.value })} required /></div>
          <div className="field"><label>Reorder level</label><input type="number" inputMode="numeric" min="0" max="100000" step="1" value={form.reorder_level} onChange={(e) => setForm({ ...form, reorder_level: e.target.value })} required /></div>
          <div className="field">
            <label>Branch</label>
            <select value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })}>
              {BRANCH_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
            <input type="checkbox" checked={form.requires_prescription} onChange={(e) => setForm({ ...form, requires_prescription: e.target.checked })} />
            Requires prescription
          </label>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10 }}>
            <button type="submit" className="flat-btn-primary" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Update medicine' : 'Save medicine'}</button>
            <button type="button" className="flat-action-btn" onClick={resetForm}>Cancel</button>
          </div>
          {formError && <p className="error-text" role="alert" style={{ gridColumn: '1 / -1' }}>{formError}</p>}
        </form>
        </div>
        )}
      </AnimatedModal>

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
            <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} aria-label="Filter by branch">
              <option value="all">All branches</option>
              {BRANCH_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
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
                <div key={i} className="flat-card flat-item-card flat-item-card--photo-layout">
                  <div className="flat-item-photo skeleton" style={{ border: 'none', borderRadius: '7px 7px 0 0' }} />
                  <div className="flat-item-card__body">
                    <div className="skeleton" style={{ height: 16, width: '70%', margin: '4px 0' }} />
                    <div className="skeleton" style={{ height: 12, width: '50%' }} />
                  </div>
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
                  <div key={m.id} className={`flat-card flat-item-card flat-item-card--photo-layout flat-item-card--${STOCK_FLAT_CLS[state.key]}`} onClick={() => openDetail(m)}>
                    <div className="flat-item-photo">
                      {m.image_url ? <img src={resolveFileUrl(m.image_url)} alt="" /> : <Icon size={32} />}
                      <span className={`flat-status-label flat-status-label--badge ${STOCK_FLAT_CLS[state.key]}`}>{state.label}</span>
                    </div>
                    <div className="flat-item-card__body">
                      <div className="flat-med-name">{m.name}</div>
                      <div className="flat-med-meta">
                        {m.generic_name || '—'}
                        {m.requires_prescription ? ' · Rx' : ''}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <span className="flat-tag">{categoryOf(m)}</span>
                        <span className="flat-tag">{m.branch || 'QMC'}</span>
                      </div>
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
                        {(user.role === 'admin' || user.role === 'pharmacist') && (
                          <button type="button" className="flat-action-btn" onClick={(e) => { e.stopPropagation(); handleDelete(m); }}>
                            <Trash2 size={13} /> Delete
                          </button>
                        )}
                      </div>
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
                  <div className="flat-item-icon flat-item-icon--photo">
                    <img src={resolveFileUrl(detailMedicine.image_url)} alt="" />
                  </div>
                )}
                <div>
                  <h2 style={{ margin: 0 }}>{detailMedicine.name}</h2>
                  <p className="flat-med-meta" style={{ margin: '4px 0 0' }}>
                    {[detailMedicine.generic_name, detailMedicine.dosage_form, detailMedicine.strength].filter(Boolean).join(' · ') || '—'}
                  </p>
                  <span className="flat-tag" style={{ marginTop: 6 }}>{detailMedicine.branch || 'QMC'}</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={`flat-status-label ${STOCK_FLAT_CLS[stockStateOf(detailMedicine).key]}`}>{stockStateOf(detailMedicine).label}</span>
                <button type="button" className="btn-icon" onClick={closeDetail} title="Close medicine details"><X size={18} /></button>
              </div>
            </div>

            <div className="medicine-detail-stats">
              <div className="medicine-detail-stat">
                <div className="flat-med-meta" style={{ margin: 0, fontSize: 12 }}>Total stock</div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{detailMedicine.total_stock ?? 0} {detailMedicine.unit}</div>
              </div>
              <div className="medicine-detail-stat">
                <div className="flat-med-meta" style={{ margin: 0, fontSize: 12 }}>Reorder level</div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{detailMedicine.reorder_level ?? 0}</div>
              </div>
              <div className="medicine-detail-stat">
                <div className="flat-med-meta" style={{ margin: 0, fontSize: 12 }}>Batches</div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{detailBatches.length}</div>
              </div>
            </div>

            <div className="medicine-detail-modal__section-header">
              <h3 style={{ margin: 0 }}>Batches</h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="flat-action-btn" onClick={() => { setStockMovementError(''); setShowStockMovement(true); }} disabled={detailBatches.length === 0}>
                  Record movement
                </button>
                <button type="button" className="flat-btn-primary" onClick={openBatchCreate}>
                  <Plus size={14} /> Receive stock
                </button>
              </div>
            </div>

            {detailBatches.length === 0 && (
              <div className="flat-empty">No batches for this medicine yet. Receive stock to add one.</div>
            )}

            {detailBatches.length > 0 && (
              <div className="medicine-detail-batches">
                {detailBatches.map((b) => {
                  const pill = batchStatus(b);
                  return (
                    <div key={b.id} className={`flat-card flat-item-card flat-item-card--${pill.cls}`} style={{ cursor: 'default' }}>
                      <div className="flat-item-card__top" style={{ alignItems: 'center' }}>
                        <span className="flat-tag" style={{ margin: 0 }}>Batch {b.batch_number}</span>
                        <span className={`flat-status-label ${pill.cls}`}>{pill.label}</span>
                      </div>
                      <div className="flat-item-row">
                        <span>Remaining</span>
                        <strong>{b.quantity_remaining}</strong>
                      </div>
                      <div className="flat-item-row">
                        <span>Expiry</span>
                        <strong>{new Date(b.expiry_date).toLocaleDateString()}</strong>
                      </div>
                      <div className="flat-item-row">
                        <span>Supplier</span>
                        <strong>{b.supplier_name || '—'}</strong>
                      </div>
                      <div className="flat-item-card__actions">
                        <button type="button" className="flat-action-btn" onClick={() => openBatchEdit(b)} title="Edit batch">
                          <Pencil size={13} /> Edit
                        </button>
                        <button type="button" className="flat-action-btn" onClick={() => setQrBatch(b)} title="Show QR code">
                          <QrCode size={13} /> QR
                        </button>
                        {(user.role === 'admin' || user.role === 'pharmacist') && (
                          <button type="button" className="flat-action-btn" onClick={() => handleBatchDelete(b)} title="Delete batch">
                            <Trash2 size={13} /> Delete
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

      <BatchQrModal batch={qrBatch} onClose={() => setQrBatch(null)} />

      <AnimatedModal isOpen={showCsvImport} onClose={() => setShowCsvImport(false)}>
        <CsvImport
          onClose={() => setShowCsvImport(false)}
          onImportComplete={handleCsvImportComplete}
          entityType="medicines"
        />
      </AnimatedModal>

      <ReceiveStockModal
        isOpen={showReceiveStock}
        onClose={() => { setShowReceiveStock(false); setScannedCode(''); }}
        initialBatchNumber={scannedCode}
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

      {detailMedicine && (
        <ReceiveStockModal
          isOpen={showBatchForm}
          onClose={resetBatchForm}
          lockedMedicine={detailMedicine}
          suppliers={suppliers}
          editingBatch={editingBatch}
          onSubmit={handleBatchSubmit}
          error={batchError}
        />
      )}
    </div>
  );
}
import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Plus, Pencil, Trash2, RefreshCw, Download, Search, X,
  FileWarning, Upload, QrCode
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { downloadCsv } from '../utils/csv';
import { daysUntil } from '../utils/date';
import CsvImport from '../components/CsvImport';
import AnimatedNumber from '../components/AnimatedNumber';
import StaggeredList from '../components/StaggeredList';
import AnimatedModal from '../components/AnimatedModal';
import Skeleton from '../components/Skeleton';
import QRCodeDisplay from '../components/QRCode';

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
  { value: 'expiring', label: 'Expiring in 30 days' }
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

function stockStateOf(medicine) {
  const stock = Number(medicine.total_stock) || 0;
  const reorder = Number(medicine.reorder_level) || 0;
  if (stock <= 0) return { key: 'out', cls: 'critical', label: 'Out of stock' };
  if (stock <= reorder) return { key: 'low', cls: 'warning', label: 'Low stock' };
  return { key: 'healthy', cls: 'safe', label: 'In stock' };
}

function expiryLabel(medicine) {
  if (!medicine.nearest_expiry) return null;
  const days = daysUntil(medicine.nearest_expiry);
  if (days <= 30) return { cls: days <= 7 ? 'critical' : 'warning', label: `${days}d to expiry` };
  return { cls: 'safe', label: new Date(medicine.nearest_expiry).toLocaleDateString() };
}

function batchStatusPill(batch) {
  if (batch.status === 'expired') return { cls: 'critical', label: 'Expired' };
  if (batch.status === 'depleted') return { cls: 'warning', label: 'Depleted' };
  if (batch.status === 'recalled') return { cls: 'critical', label: 'Recalled' };
  const days = daysUntil(batch.expiry_date);
  if (days <= 7) return { cls: 'critical', label: `${days}d left` };
  if (days <= 30) return { cls: 'warning', label: `${days}d left` };
  return { cls: 'safe', label: 'Active' };
}

export default function Medicines() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [medicines, setMedicines] = useState([]);
  const [batches, setBatches] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const prefersReducedMotion = useReducedMotion();

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
  }

  function resetBatchForm() {
    setBatchForm(emptyBatchForm);
    setEditingBatchId(null);
    setShowBatchForm(false);
    setBatchError('');
  }

  function handleCsvImportComplete(result) {
    api.invalidateCache('/medicines');
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
      const res = await api.cachedGet('/medicines');
      setMedicines(res.data);
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

  const summary = useMemo(() => medicines.reduce((acc, medicine) => {
    const state = stockStateOf(medicine).key;
    acc[state] += 1;
    if (Number(medicine.expiring_batches) > 0) acc.expiring += 1;
    return acc;
  }, { out: 0, low: 0, healthy: 0, expiring: 0 }), [medicines]);

  const visibleMedicines = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = medicines.filter((medicine) => {
      if (activeCategory !== 'All' && categoryOf(medicine) !== activeCategory) return false;
      if (prescriptionOnly && !medicine.requires_prescription) return false;
      if (stockFilter === 'expiring' && !(Number(medicine.expiring_batches) > 0)) return false;
      if (stockFilter !== 'all' && stockFilter !== 'expiring' && stockStateOf(medicine).key !== stockFilter) return false;
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
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      if (editingId) {
        await api.put(`/medicines/${editingId}`, form);
        addToast('Medicine updated', 'success');
      } else {
        await api.post('/medicines', form);
        addToast('Medicine added', 'success');
      }
      api.invalidateCache('/medicines');
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
    api.invalidateCache('/batches');
    await Promise.all([fetchMedicines(), fetchBatches()]);
    addToast('Catalog refreshed', 'success');
  }

  function handleExport() {
    const rows = visibleMedicines.map((medicine) => ({
      id: medicine.id,
      name: medicine.name,
      generic_name: medicine.generic_name || '',
      category: categoryOf(medicine),
      dosage_form: medicine.dosage_form || '',
      strength: medicine.strength || '',
      unit: medicine.unit || '',
      total_stock: medicine.total_stock ?? '',
      reorder_level: medicine.reorder_level || '',
      stock_status: stockStateOf(medicine).label,
      nearest_expiry: medicine.nearest_expiry ? String(medicine.nearest_expiry).slice(0, 10) : '',
      requires_prescription: medicine.requires_prescription ? 'Yes' : 'No'
    }));
    downloadCsv('medicines.csv', rows, [
      'id', 'name', 'generic_name', 'category', 'dosage_form', 'strength', 'unit',
      'total_stock', 'reorder_level', 'stock_status', 'nearest_expiry', 'requires_prescription'
    ]);
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
      .filter((b) => Number(b.medicine_id) === Number(detailMedicine.id))
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

  async function handleRemoveDepleted() {
    if (!window.confirm('Remove all batches that are already depleted?')) return;
    try {
      const res = await api.delete('/batches/depleted');
      api.invalidateCache('/batches');
      api.invalidateCache('/medicines');
      api.invalidateCache('/notifications');
      api.invalidateCache('/notifications?unread=true');
      await Promise.all([fetchBatches(), fetchMedicines()]);
      addToast(res.data.message || 'Depleted batches removed', 'success');
    } catch (err) {
      addToast(err.response?.data?.error || 'Could not remove depleted batches', 'error');
    }
  }

  function handleBatchExport() {
    const rows = detailBatches.map((batch) => ({
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
          <h1>Medicines</h1>
          <p>
            {loading ? 'Loading catalog…' : `${visibleMedicines.length} of ${medicines.length} products shown`}
          </p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={handleExport}>
            <Download size={15} /> Export CSV
          </button>
          <button className="btn btn-secondary" onClick={handleRefresh}>
            <RefreshCw size={15} /> Refresh
          </button>
          {user.role === 'admin' && (
            <>
              <button className="btn btn-secondary" onClick={() => setShowCsvImport(true)}>
                <Upload size={15} /> Import CSV
              </button>
              <button className="btn btn-primary" onClick={openCreate}>
                <Plus size={15} /> Add medicine
              </button>
            </>
          )}
        </div>
      </div>

      <motion.div 
        className="stat-grid"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.5, delay: prefersReducedMotion ? 0 : 0.1 }}
      >
        <motion.button
          type="button"
          className={`card stat-card accent-red filter-tile ${stockFilter === 'out' ? 'active' : ''}`}
          onClick={() => setStockFilter(stockFilter === 'out' ? 'all' : 'out')}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.98 }}
        >
          <div className="value"><AnimatedNumber value={summary.out} /></div>
          <div className="label">Out of stock</div>
        </motion.button>
        <motion.button
          type="button"
          className={`card stat-card accent-gold filter-tile ${stockFilter === 'low' ? 'active' : ''}`}
          onClick={() => setStockFilter(stockFilter === 'low' ? 'all' : 'low')}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.98 }}
        >
          <div className="value"><AnimatedNumber value={summary.low} /></div>
          <div className="label">At or below reorder level</div>
        </motion.button>
        <motion.button
          type="button"
          className={`card stat-card accent-amber filter-tile ${stockFilter === 'expiring' ? 'active' : ''}`}
          onClick={() => setStockFilter(stockFilter === 'expiring' ? 'all' : 'expiring')}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.98 }}
        >
          <div className="value"><AnimatedNumber value={summary.expiring} /></div>
          <div className="label">Expiring within 30 days</div>
        </motion.button>
        <motion.button
          type="button"
          className={`card stat-card accent-green filter-tile ${stockFilter === 'healthy' ? 'active' : ''}`}
          onClick={() => setStockFilter(stockFilter === 'healthy' ? 'all' : 'healthy')}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.98 }}
        >
          <div className="value"><AnimatedNumber value={summary.healthy} /></div>
          <div className="label">Healthy stock</div>
        </motion.button>
      </motion.div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card" style={{ marginBottom: 20, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
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
            <button type="submit" className="btn btn-primary">{editingId ? 'Update medicine' : 'Save medicine'}</button>
            <button type="button" className="btn btn-secondary" onClick={resetForm}>Cancel</button>
          </div>
          {error && <p className="error-text" style={{ gridColumn: '1 / -1' }}>{error}</p>}
        </form>
      )}

      <div style={{ padding: '16px', background: 'var(--surface-strong)', borderRadius: 'var(--radius)' }}>
        <div className="filter-bar" style={{ margin: 0 }}>
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
            <button type="button" className="btn btn-secondary" onClick={clearFilters}>
              <X size={15} /> Clear filters
            </button>
          )}
        </div>

        <div className="chip-row">
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

      {error && (
        <div className="empty-state">
          <strong>Unable to load medicines</strong>
          <p style={{ margin: '6px 0 0' }}>{error}</p>
          <button className="btn btn-secondary" style={{ marginTop: 10 }} onClick={fetchMedicines}>Retry</button>
        </div>
      )}

      {!loading && !error && visibleMedicines.length === 0 && (
        <div className="empty-state">
          <FileWarning size={24} style={{ marginBottom: 6 }} />
          <strong>No medicines found</strong>
          <p style={{ margin: '6px 0 0' }}>No medicines match the current filters.</p>
          {filtersActive && (
            <button type="button" className="btn btn-secondary" style={{ marginTop: 10 }} onClick={clearFilters}>Clear filters</button>
          )}
        </div>
      )}

      {loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="card" style={{ height: '260px' }}>
              <Skeleton height={16} style={{ marginBottom: '12px' }} />
              <Skeleton height={16} style={{ marginBottom: '8px' }} />
              <Skeleton height={16} style={{ marginBottom: '16px' }} />
              <Skeleton height={16} style={{ marginBottom: '12px' }} />
              <Skeleton height={40} style={{ borderRadius: '999px' }} />
            </div>
          ))}
        </div>
      )}

      {!loading && !error && visibleMedicines.length > 0 && (
        <motion.div 
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {visibleMedicines.map((m) => {
            const state = stockStateOf(m);
            const expiry = expiryLabel(m);
            const borderColorMap = { 'safe': 'var(--green)', 'warning': 'var(--gold)', 'critical': 'var(--red)' };
            return (
              <motion.div
                key={m.id}
                className="card"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '16px',
                  borderTop: `4px solid ${borderColorMap[state.cls]}`,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                whileHover={{ y: -4, boxShadow: 'var(--shadow-md)' }}
                onClick={() => openDetail(m)}
              >
                {/* Top Row: ID & Status */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span className="stamp" style={{ fontSize: '11px' }}>ID: {m.id}</span>
                  <span className={`status-pill ${state.cls}`} style={{ fontSize: '10px', padding: '3px 8px' }}>{state.label}</span>
                </div>

                {/* Middle Content */}
                <div style={{ flex: 1, marginBottom: '12px' }}>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--ink)', marginBottom: '4px', lineHeight: 1.3 }}>
                    {m.name}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--steel)', marginBottom: '8px', lineHeight: 1.4 }}>
                    {[m.generic_name, m.dosage_form].filter(Boolean).join(' · ') || '—'}
                    {m.requires_prescription ? ' · Rx' : ''}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
                    <div>
                      <div style={{ color: 'var(--steel)', fontSize: '11px' }}>Stock</div>
                      <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{m.total_stock ?? 0} {m.unit}</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--steel)', fontSize: '11px' }}>Category</div>
                      <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{categoryOf(m)}</div>
                    </div>
                  </div>
                  {expiry && (
                    <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                      <div style={{ color: 'var(--steel)', fontSize: '11px' }}>Expiry</div>
                      <span className={`status-pill ${expiry.cls}`} style={{ fontSize: '11px', marginTop: '4px' }}>{expiry.label}</span>
                    </div>
                  )}
                </div>

                {/* Bottom Row: Avatar + Label + Action */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--gradient-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '12px', fontWeight: 700 }}>
                      {m.name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--ink-soft)', fontWeight: 600 }}>{m.name.substring(0, 12)}</div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); openEdit(m); }}
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      background: 'var(--bg-subtle)',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => { e.target.style.background = 'var(--amber-tint)'; e.target.style.borderColor = 'var(--amber)'; }}
                    onMouseLeave={(e) => { e.target.style.background = 'var(--bg-subtle)'; e.target.style.borderColor = 'var(--border)'; }}
                    title="Edit medicine"
                  >
                    <Pencil size={16} color="var(--ink)" />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Medicine detail modal with integrated batches */}
      <AnimatedModal isOpen={Boolean(detailMedicine)} onClose={closeDetail}>
        {detailMedicine && (
          <div style={{ maxHeight: '80vh', overflowY: 'auto', padding: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0 }}>{detailMedicine.name}</h2>
                <p style={{ margin: '4px 0 0', color: 'var(--steel)', fontSize: 13 }}>
                  {[detailMedicine.generic_name, detailMedicine.dosage_form, detailMedicine.strength].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
              <span className={`status-pill ${stockStateOf(detailMedicine).cls}`}>{stockStateOf(detailMedicine).label}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
              <div className="card" style={{ padding: '12px 16px' }}>
                <div style={{ color: 'var(--steel)', fontSize: 11 }}>Total stock</div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{detailMedicine.total_stock ?? 0} {detailMedicine.unit}</div>
              </div>
              <div className="card" style={{ padding: '12px 16px' }}>
                <div style={{ color: 'var(--steel)', fontSize: 11 }}>Reorder level</div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{detailMedicine.reorder_level ?? 0}</div>
              </div>
              <div className="card" style={{ padding: '12px 16px' }}>
                <div style={{ color: 'var(--steel)', fontSize: 11 }}>Batches</div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{detailBatches.length}</div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <h3 style={{ margin: 0 }}>Batches</h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-secondary" onClick={handleBatchExport}>
                  <Download size={14} /> Export
                </button>
                {user.role === 'admin' && (
                  <button className="btn btn-secondary" onClick={handleRemoveDepleted}>
                    <Trash2 size={14} /> Remove depleted
                  </button>
                )}
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
                <StaggeredList staggerDelay={0.03}>
                  {detailBatches.map((b) => {
                    const pill = batchStatusPill(b);
                    const borderColorMap = { 'safe': 'var(--green)', 'warning': 'var(--gold)', 'critical': 'var(--red)' };
                    return (
                      <motion.div
                        key={b.id}
                        className="card"
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          padding: '14px',
                          borderTop: `4px solid ${borderColorMap[pill.cls]}`
                        }}
                        whileHover={{ y: -2, boxShadow: 'var(--shadow-md)' }}
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
                          {user.role === 'admin' && (
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
                      </motion.div>
                    );
                  })}
                </StaggeredList>
              </div>
            )}
          </div>
        )}
      </AnimatedModal>

      {/* QR code modal */}
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

      <AnimatedModal isOpen={showCsvImport} onClose={() => setShowCsvImport(false)}>
        <CsvImport
          onClose={() => setShowCsvImport(false)}
          onImportComplete={handleCsvImportComplete}
          entityType="medicines"
        />
      </AnimatedModal>
    </motion.div>
  );
}
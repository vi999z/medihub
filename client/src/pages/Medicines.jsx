import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Plus, Pencil, Trash2, RefreshCw, Download, Search, X,
  ChevronDown, ChevronRight, LayoutGrid, List, ArrowUpDown, FileWarning, Upload
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

export default function Medicines() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [medicines, setMedicines] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const prefersReducedMotion = useReducedMotion();

  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('q') || '';
  const [activeCategory, setActiveCategory] = useState('All');
  const [stockFilter, setStockFilter] = useState('all');
  const [prescriptionOnly, setPrescriptionOnly] = useState(false);
  const [sortBy, setSortBy] = useState('name-asc');
  const [grouped, setGrouped] = useState(true);
  const [collapsed, setCollapsed] = useState({});

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  }

  function handleCsvImportComplete(result) {
    api.invalidateCache('/medicines');
    fetchMedicines();
    addToast(`Imported ${result.created} medicines successfully`, 'success');
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

  useEffect(() => { fetchMedicines(); }, []);

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

  const groups = useMemo(() => {
    if (!grouped) return [['All results', visibleMedicines]];
    const map = new Map();
    visibleMedicines.forEach((medicine) => {
      const category = categoryOf(medicine);
      if (!map.has(category)) map.set(category, []);
      map.get(category).push(medicine);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [visibleMedicines, grouped]);

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

  function toggleGroup(category) {
    setCollapsed((prev) => ({ ...prev, [category]: !prev[category] }));
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
      addToast('Medicine deleted', 'success');
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to delete medicine', 'error');
    }
  }

  async function handleRefresh() {
    setLoading(true);
    api.invalidateCache('/medicines');
    await fetchMedicines();
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
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
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
        <form onSubmit={handleSubmit} className="card" style={{ padding: 20, marginBottom: 20, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
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

      <div className="card" style={{ padding: 16 }}>
        <div className="filter-bar">
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
          <button type="button" className="btn btn-secondary" onClick={() => setGrouped((prev) => !prev)} title="Toggle grouping by category">
            {grouped ? <List size={15} /> : <LayoutGrid size={15} />} {grouped ? 'Flat list' : 'Group by category'}
          </button>
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

        {error && (
          <div className="empty-state">
            <strong>Unable to load medicines</strong>
            <p style={{ margin: '6px 0 0' }}>{error}</p>
            <button className="btn btn-secondary" style={{ marginTop: 10 }} onClick={fetchMedicines}>Retry</button>
          </div>
        )}

        {!loading && !error && visibleMedicines.length === 0 && (
          <div className="empty-state">
            <FileWarning size={18} style={{ marginBottom: 6 }} />
            <div>No medicines match the current filters.</div>
            {filtersActive && (
              <button type="button" className="btn btn-secondary" style={{ marginTop: 10 }} onClick={clearFilters}>Clear filters</button>
            )}
          </div>
        )}

        {loading && (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Strength</th>
                <th>Stock</th>
                <th>Status</th>
                <th>Nearest expiry</th>
                {user.role === 'admin' && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4].map((i) => (
                <tr key={i}>
                  <td><Skeleton height={16} /></td>
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
        )}

        {!loading && !error && groups.map(([category, items]) => {
          if (!items.length) return null;
          const isCollapsed = grouped && collapsed[category];
          return (
            <div key={category} className="medicine-group">
              {grouped ? (
                <button type="button" className="group-header" onClick={() => toggleGroup(category)} aria-expanded={!isCollapsed}>
                  {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  <span className="group-title">{category}</span>
                  <span className="stamp">{items.length}</span>
                </button>
              ) : (
                <div className="group-header static">
                  <ArrowUpDown size={14} />
                  <span className="group-title">{SORT_OPTIONS.find((option) => option.value === sortBy)?.label}</span>
                  <span className="stamp">{items.length}</span>
                </div>
              )}
              {!isCollapsed && (
                <div className="table-scroll">
                  <table className="data-table sticky-head">
                    <thead>
                      <tr>
                        <th>Name</th>
                        {!grouped && <th>Category</th>}
                        <th>Strength</th>
                        <th>Stock</th>
                        <th>Status</th>
                        <th>Nearest expiry</th>
                        {user.role === 'admin' && <th>Actions</th>}
                      </tr>
                    </thead>
                    <StaggeredList staggerDelay={0.03}>
                      <tbody>
                        {items.map((m) => {
                          const state = stockStateOf(m);
                          const expiry = expiryLabel(m);
                          return (
                            <tr key={m.id}>
                              <td>
                                <div style={{ fontWeight: 600 }}>{m.name}</div>
                                <div style={{ fontSize: 11.5, color: 'var(--steel)' }}>
                                  {[m.generic_name, m.dosage_form].filter(Boolean).join(' · ') || '—'}
                                  {m.requires_prescription ? ' · Rx' : ''}
                                </div>
                              </td>
                              {!grouped && <td><span className="stamp">{categoryOf(m)}</span></td>}
                              <td><span className="stamp">{m.strength || '—'}</span></td>
                              <td>
                                <div style={{ fontWeight: 600 }}>{m.total_stock ?? 0} {m.unit}</div>
                                <div style={{ fontSize: 11.5, color: 'var(--steel)' }}>reorder at {m.reorder_level}</div>
                              </td>
                              <td><span className={`status-pill ${state.cls}`}>{state.label}</span></td>
                              <td>{expiry ? <span className={`status-pill ${expiry.cls}`}>{expiry.label}</span> : <span className="stamp">—</span>}</td>
                              {user.role === 'admin' && (
                                <td>
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    <button className="btn-icon" onClick={() => openEdit(m)} title="Edit medicine"><Pencil size={14} /></button>
                                    <button className="btn-icon" onClick={() => handleDelete(m.id)} title="Delete medicine"><Trash2 size={14} /></button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </StaggeredList>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

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

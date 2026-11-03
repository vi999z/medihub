import { useState } from 'react';
import { Plus, Pencil, MapPin, Power } from 'lucide-react';
import api from '../api/axios';
import { useToast } from '../context/ToastContext';
import { useDialog } from '../context/DialogContext';
import useBranches from '../hooks/useBranches';
import PageHeader from '../components/PageHeader';
import { validateBranchForm, trimFields, MAX_LENGTH } from '../utils/validation';
import { errorMessage } from '../utils/errors';

const emptyForm = { name: '', address: '' };

export default function Branches() {
  const { addToast } = useToast();
  const { confirm } = useDialog();
  const { all, loaded, reload } = useBranches();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setFormError('');
  }

  function openEdit(branch) {
    setEditingId(branch.id);
    setForm({ name: branch.name, address: branch.address || '' });
    setFormError('');
    setShowForm(true);
  }

  async function refresh() {
    api.invalidateCache('/branches');
    api.invalidateCache('/medicines');
    await reload();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (saving) return;
    const problem = validateBranchForm(form);
    if (problem) { setFormError(problem); return; }
    setSaving(true);
    try {
      const payload = trimFields(form);
      if (editingId) {
        await api.put(`/branches/${editingId}`, payload);
        addToast('Branch updated', 'success');
      } else {
        await api.post('/branches', payload);
        addToast('Branch added', 'success');
      }
      resetForm();
      await refresh();
    } catch (err) {
      setFormError(errorMessage(err, 'Failed to save branch'));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(branch) {
    if (branch.is_active && !(await confirm({
      title: 'Deactivate branch',
      message: `${branch.name} will no longer be offered for new medicines or stock. Its existing records are kept.`,
      confirmLabel: 'Deactivate',
      danger: true,
    }))) return;
    try {
      await api.patch(`/branches/${branch.id}/status`, { is_active: !branch.is_active });
      addToast(`${branch.name} ${branch.is_active ? 'deactivated' : 'activated'}`, 'success');
      await refresh();
    } catch (err) {
      addToast(errorMessage(err, 'Could not change the branch'), 'error');
    }
  }

  return (
    <div className="flat-dashboard">
      <PageHeader title="Branches" description="The pharmacy branches. Every medicine and batch belongs to one branch." />
      <div className="page-actions-only">
        <div className="page-header-actions">
          <button type="button" className="flat-btn-primary" onClick={() => (showForm ? resetForm() : setShowForm(true))}>
            <Plus size={15} /> {showForm ? 'Close form' : 'Add branch'}
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} noValidate className="flat-card" style={{ padding: 16, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(250px, 100%), 1fr))' }}>
          <div className="field"><label>Branch name</label><input value={form.name} maxLength={MAX_LENGTH.branchName} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
          <div className="field"><label>Address</label><input value={form.address} maxLength={MAX_LENGTH.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10 }}>
            <button type="submit" className="flat-btn-primary" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Update branch' : 'Save branch'}</button>
            <button type="button" className="flat-action-btn" onClick={resetForm}>Cancel</button>
          </div>
          {formError && <p className="error-text" role="alert" style={{ gridColumn: '1 / -1', margin: 0 }}>{formError}</p>}
        </form>
      )}

      <div className="flat-card">
        <div className="flat-table-header"><span className="flat-table-title">Branches</span></div>
        <div style={{ padding: 16 }}>
          {!loaded && <div className="flat-empty">Loading…</div>}
          {loaded && all.length === 0 && <div className="flat-empty">No branches yet. Add your first one above.</div>}
          <div className="flat-card-grid">
            {all.map((b) => (
              <div key={b.id} className={`flat-card flat-item-card flat-item-card--${b.is_active ? 'green' : 'red'}`} style={{ cursor: 'default' }}>
                <div className="flat-item-card__top">
                  <div className="flat-item-icon"><MapPin size={22} /></div>
                  <span className={`flat-status-label ${b.is_active ? 'green' : 'red'}`}>{b.is_active ? 'Active' : 'Inactive'}</span>
                </div>
                <div className="flat-med-name">{b.name}</div>
                <div className="flat-med-meta">{b.address || 'No address listed'}</div>
                <div className="flat-item-row"><span>Medicines</span><strong>{b.medicine_count}</strong></div>
                <div className="flat-item-card__actions">
                  <button type="button" className="flat-action-btn" onClick={() => openEdit(b)}><Pencil size={13} /> Edit</button>
                  <button type="button" className="flat-action-btn" onClick={() => toggleActive(b)}>
                    <Power size={13} /> {b.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

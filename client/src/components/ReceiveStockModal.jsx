import { useEffect, useState } from 'react';
import { Package, X } from 'lucide-react';
import AnimatedModal from './AnimatedModal';
import { validateBatchForm, trimFields, MAX_LENGTH } from '../utils/validation';
import { localDateKey } from '../utils/date';
import useBranches from '../hooks/useBranches';

const emptyForm = {
  medicine_id: '',
  supplier_id: '',
  batch_number: '',
  quantity_received: '',
  quantity_remaining: '',
  expiry_date: '',
  manufacture_date: '',
  cost_price: '',
  selling_price: '',
  status: 'active',
  unlinked: false,
  pending_name: '',
  pending_strength: '',
  pending_dosage_form: '',
  pending_barcode: ''
};

// Single shared "create or edit a batch" form — previously duplicated three
// ways (this modal, an inline form in Medicines.jsx's medicine detail view,
// and Batches.jsx's own inline form), each with its own state and its own
// (inconsistent) validation. `lockedMedicine` keeps the medicine-detail
// use case's UX (medicine implied, not pickable); `editingBatch` switches
// this from "receive new stock" to "edit an existing batch".
// `prefill` (from a scanned QR code with details) fills the form in:
// { medicine_id, branch, unlinked, medicine: {...}, batch: {...}, warnings: [] }.
export default function ReceiveStockModal({ isOpen, onClose, medicines, suppliers, lockedMedicine, editingBatch, initialBatchNumber = '', prefill = null, onSubmit, error, setError }) {
  const [form, setForm] = useState(emptyForm);
  const [localError, setLocalError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const isEditing = Boolean(editingBatch);
  const { names: branchNames } = useBranches();
  const [branch, setBranch] = useState('');

  // The branch of the medicine in play (when editing, or when the medicine is fixed).
  const fixedMedicine = lockedMedicine || (editingBatch && medicines?.find((m) => m.id === editingBatch.medicine_id));
  const activeBranch = fixedMedicine?.branch || branch || branchNames[0] || '';
  const branchMedicines = (medicines || []).filter((m) => (m.branch || 'QMC') === activeBranch);
  const canChooseLink = !lockedMedicine && !isEditing;

  useEffect(() => {
    if (!isOpen) return;
    setSubmitting(false);
    setLocalError('');
    if (editingBatch) {
      const unlinkedBatch = editingBatch.linked === false || editingBatch.medicine_id === null;
      setBranch(unlinkedBatch ? editingBatch.branch || '' : '');
      setForm({
        unlinked: unlinkedBatch,
        pending_name: editingBatch.pending_name || '',
        pending_strength: editingBatch.pending_strength || '',
        pending_dosage_form: editingBatch.pending_dosage_form || '',
        pending_barcode: editingBatch.pending_barcode || '',
        medicine_id: editingBatch.medicine_id || lockedMedicine?.id || '',
        supplier_id: editingBatch.supplier_id || '',
        batch_number: editingBatch.batch_number || '',
        quantity_received: editingBatch.quantity_received ?? '',
        quantity_remaining: editingBatch.quantity_remaining ?? '',
        expiry_date: editingBatch.expiry_date ? String(editingBatch.expiry_date).slice(0, 10) : '',
        manufacture_date: editingBatch.manufacture_date ? String(editingBatch.manufacture_date).slice(0, 10) : '',
        cost_price: editingBatch.cost_price ?? '',
        selling_price: editingBatch.selling_price ?? '',
        status: editingBatch.status || 'active'
      });
    } else if (prefill && !lockedMedicine) {
      const b = prefill.batch || {};
      const m = prefill.medicine || {};
      const supplier = (suppliers || []).find((x) => b.supplier_name && x.name.toLowerCase() === b.supplier_name.toLowerCase());
      const num = (v) => (v === null || v === undefined ? '' : v);
      setBranch(prefill.branch || '');
      setForm({
        ...emptyForm,
        medicine_id: prefill.medicine_id || '',
        unlinked: Boolean(prefill.unlinked),
        pending_name: m.name || '',
        pending_strength: m.strength || '',
        pending_dosage_form: m.dosage_form || '',
        pending_barcode: m.barcode || '',
        supplier_id: supplier ? supplier.id : '',
        batch_number: b.batch_number || '',
        quantity_received: num(b.quantity_received),
        expiry_date: b.expiry_date || '',
        manufacture_date: b.manufacture_date || '',
        cost_price: num(b.cost_price),
        selling_price: num(b.selling_price)
      });
    } else {
      setForm({ ...emptyForm, medicine_id: lockedMedicine?.id || '', batch_number: initialBatchNumber });
      setBranch('');
    }
  }, [isOpen, editingBatch, lockedMedicine, initialBatchNumber, prefill, suppliers]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function validate() {
    return validateBatchForm({ ...form, pending_branch: activeBranch }, { isEditing, needsMedicine: !lockedMedicine });
  }

  // Linked batches send a medicine; unlinked ones send what is known about it.
  function buildPayload() {
    const data = trimFields(form);
    if (data.unlinked) {
      return { ...data, medicine_id: null, pending_branch: activeBranch };
    }
    const linked = { ...data };
    ['unlinked', 'pending_name', 'pending_strength', 'pending_dosage_form', 'pending_barcode'].forEach((key) => delete linked[key]);
    return linked;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setLocalError('');
    setError?.('');
    const validationError = validate();
    if (validationError) {
      setLocalError(validationError);
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(buildPayload());
      onClose();
    } catch {
      // The parent displays the API error while keeping the form values intact.
    } finally {
      setSubmitting(false);
    }
  }

  const displayError = localError || error;

  return (
    <AnimatedModal isOpen={isOpen} onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate className="card" style={{ padding: 24, border: 'none', boxShadow: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Package size={20} /> {isEditing ? 'Edit batch' : 'Receive stock'}
            </h2>
            <p style={{ margin: '6px 0 0', color: 'var(--steel)', fontSize: 13 }}>
              {lockedMedicine ? lockedMedicine.name : isEditing && form.unlinked ? 'This batch is not connected to a medicine yet.' : isEditing ? 'Update this batch’s details.' : 'Add one new batch to your inventory.'}
            </p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        {prefill?.warnings?.length > 0 && !isEditing && (
          <ul className="error-text" role="status" style={{ margin: '0 0 12px', paddingLeft: 18, fontSize: 13 }}>
            {prefill.warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        )}
        {prefill && !isEditing && !lockedMedicine && (
          <p style={{ margin: '0 0 12px', color: 'var(--steel)', fontSize: 13 }}>Filled in from the scanned code. Check each field, then save.</p>
        )}
        {canChooseLink && (
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 12, fontSize: 13.5 }}>
            <input type="checkbox" checked={form.unlinked} onChange={(event) => update('unlinked', event.target.checked)} style={{ marginTop: 3 }} />
            <span>
              <strong>Not connected to a medicine yet</strong>
              <span style={{ display: 'block', color: 'var(--steel)' }}>
                Use this when the medicine is not in the catalog. The batch is kept with the details you enter and can be linked to a medicine later from Batches. It is not counted in any medicine stock until then.
              </span>
            </span>
          </label>
        )}

        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(210px, 100%), 1fr))' }}>
          {!lockedMedicine && (
            <>
              <div className="field">
                <label>Branch</label>
                {isEditing && !form.unlinked ? (
                  <input value={activeBranch} disabled aria-label="Branch" />
                ) : (
                  <select
                    value={activeBranch}
                    onChange={(event) => { setBranch(event.target.value); update('medicine_id', ''); }}
                    aria-label="Branch"
                  >
                    {branchNames.map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                )}
              </div>
              {form.unlinked ? (
                <>
                  <div className="field">
                    <label>Medicine name</label>
                    <input value={form.pending_name} maxLength={MAX_LENGTH.medicineName} onChange={(event) => update('pending_name', event.target.value)} required />
                  </div>
                  <div className="field">
                    <label>Strength <span style={{ color: 'var(--steel)', fontWeight: 400 }}>(optional)</span></label>
                    <input value={form.pending_strength} maxLength={MAX_LENGTH.strength} onChange={(event) => update('pending_strength', event.target.value)} />
                  </div>
                  <div className="field">
                    <label>Dosage form <span style={{ color: 'var(--steel)', fontWeight: 400 }}>(optional)</span></label>
                    <input value={form.pending_dosage_form} maxLength={MAX_LENGTH.dosageForm} onChange={(event) => update('pending_dosage_form', event.target.value)} />
                  </div>
                  <div className="field">
                    <label>Barcode <span style={{ color: 'var(--steel)', fontWeight: 400 }}>(optional)</span></label>
                    <input value={form.pending_barcode} maxLength={MAX_LENGTH.barcode} onChange={(event) => update('pending_barcode', event.target.value)} />
                  </div>
                </>
              ) : (
                <div className="field">
                  <label>Medicine</label>
                  <select value={form.medicine_id} onChange={(event) => update('medicine_id', event.target.value)} required disabled={isEditing}>
                    <option value="">{branchMedicines.length ? 'Choose a medicine' : 'No medicines in this branch yet'}</option>
                    {branchMedicines.map((medicine) => (
                      <option key={medicine.id} value={medicine.id}>
                        {medicine.name}{medicine.strength ? ` · ${medicine.strength}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}
          <div className="field">
            <label>Batch number</label>
            <input value={form.batch_number} maxLength={MAX_LENGTH.batchNumber} onChange={(event) => update('batch_number', event.target.value)} required autoFocus={!isEditing} />
          </div>
          <div className="field">
            <label>Quantity received</label>
            <input type="number" inputMode="numeric" min="1" step="1" value={form.quantity_received} onChange={(event) => update('quantity_received', event.target.value)} required />
          </div>
          {isEditing && (
            <div className="field">
              <label>Quantity remaining</label>
              <input type="number" inputMode="numeric" min="0" max={form.quantity_received || undefined} step="1" value={form.quantity_remaining} onChange={(event) => update('quantity_remaining', event.target.value)} required />
            </div>
          )}
          <div className="field">
            <label>Expiry date</label>
            <input type="date" min={isEditing ? undefined : localDateKey()} value={form.expiry_date} onChange={(event) => update('expiry_date', event.target.value)} required />
          </div>
          <div className="field">
            <label>Manufacture date <span style={{ color: 'var(--steel)', fontWeight: 400 }}>(optional)</span></label>
            <input type="date" max={localDateKey()} value={form.manufacture_date} onChange={(event) => update('manufacture_date', event.target.value)} />
          </div>
          <div className="field">
            <label>Supplier <span style={{ color: 'var(--steel)', fontWeight: 400 }}>(optional)</span></label>
            <select value={form.supplier_id} onChange={(event) => update('supplier_id', event.target.value)}>
              <option value="">No supplier</option>
              {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Cost price <span style={{ color: 'var(--steel)', fontWeight: 400 }}>(optional)</span></label>
            <input type="number" inputMode="decimal" min="0" step="0.01" value={form.cost_price} onChange={(event) => update('cost_price', event.target.value)} />
          </div>
          <div className="field">
            <label>Selling price <span style={{ color: 'var(--steel)', fontWeight: 400 }}>(optional)</span></label>
            <input type="number" inputMode="decimal" min="0" step="0.01" value={form.selling_price} onChange={(event) => update('selling_price', event.target.value)} />
          </div>
          {isEditing && (
            <div className="field">
              <label>Status</label>
              <select value={form.status} onChange={(event) => update('status', event.target.value)}>
                <option value="active">Active</option>
                <option value="recalled">Recalled</option>
                <option value="depleted">Depleted</option>
                <option value="expired">Expired</option>
              </select>
            </div>
          )}
        </div>

        {displayError && <p className="error-text" role="alert" style={{ marginBottom: 0 }}>{displayError}</p>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" className="flat-action-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="flat-btn-primary" disabled={submitting}>
            {submitting ? 'Saving...' : isEditing ? 'Update batch' : 'Receive stock'}
          </button>
        </div>
      </form>
    </AnimatedModal>
  );
}

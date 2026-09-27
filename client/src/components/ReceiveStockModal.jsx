import { useEffect, useState } from 'react';
import { Package, X } from 'lucide-react';
import AnimatedModal from './AnimatedModal';
import { isValidCode, isPositiveInteger, isNonNegativeNumber } from '../utils/validation';

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
  status: 'active'
};

// Single shared "create or edit a batch" form — previously duplicated three
// ways (this modal, an inline form in Medicines.jsx's medicine detail view,
// and Batches.jsx's own inline form), each with its own state and its own
// (inconsistent) validation. `lockedMedicine` keeps the medicine-detail
// use case's UX (medicine implied, not pickable); `editingBatch` switches
// this from "receive new stock" to "edit an existing batch".
export default function ReceiveStockModal({ isOpen, onClose, medicines, suppliers, lockedMedicine, editingBatch, onSubmit, error, setError }) {
  const [form, setForm] = useState(emptyForm);
  const [localError, setLocalError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const isEditing = Boolean(editingBatch);

  useEffect(() => {
    if (!isOpen) return;
    setSubmitting(false);
    setLocalError('');
    if (editingBatch) {
      setForm({
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
    } else {
      setForm({ ...emptyForm, medicine_id: lockedMedicine?.id || '' });
    }
  }, [isOpen, editingBatch, lockedMedicine]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function validate() {
    if (!lockedMedicine && !form.medicine_id) return 'Select a medicine';
    if (!isValidCode(form.batch_number)) return 'Batch number can only contain letters, numbers, - and _';
    if (!isPositiveInteger(form.quantity_received)) return 'Quantity received must be a whole number greater than 0';
    if (isEditing) {
      if (!isNonNegativeNumber(form.quantity_remaining)) return 'Quantity remaining must be a number of 0 or more';
      if (Number(form.quantity_remaining) > Number(form.quantity_received)) return 'Quantity remaining cannot exceed quantity received';
    }
    if (form.cost_price !== '' && !isNonNegativeNumber(form.cost_price)) return 'Cost price must be a number of 0 or more';
    if (form.selling_price !== '' && !isNonNegativeNumber(form.selling_price)) return 'Selling price must be a number of 0 or more';
    if (!form.expiry_date) return 'Expiry date is required';
    if (form.manufacture_date && form.manufacture_date > form.expiry_date) return 'Manufacture date must be before the expiry date';
    return '';
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
    setSubmitting(true);
    try {
      await onSubmit(form);
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
      <form onSubmit={handleSubmit} className="card" style={{ padding: 24, border: 'none', boxShadow: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Package size={20} /> {isEditing ? 'Edit batch' : 'Receive stock'}
            </h2>
            <p style={{ margin: '6px 0 0', color: 'var(--steel)', fontSize: 13 }}>
              {lockedMedicine ? lockedMedicine.name : isEditing ? 'Update this batch’s details.' : 'Add one new batch to your inventory.'}
            </p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
          {!lockedMedicine && (
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Medicine</label>
              <select value={form.medicine_id} onChange={(event) => update('medicine_id', event.target.value)} required>
                <option value="">Choose a medicine</option>
                {medicines.map((medicine) => (
                  <option key={medicine.id} value={medicine.id}>
                    {medicine.name}{medicine.strength ? ` · ${medicine.strength}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="field">
            <label>Batch number</label>
            <input value={form.batch_number} onChange={(event) => update('batch_number', event.target.value)} required autoFocus={!isEditing} />
          </div>
          <div className="field">
            <label>Quantity received</label>
            <input type="number" min="1" value={form.quantity_received} onChange={(event) => update('quantity_received', event.target.value)} required />
          </div>
          {isEditing && (
            <div className="field">
              <label>Quantity remaining</label>
              <input type="number" min="0" value={form.quantity_remaining} onChange={(event) => update('quantity_remaining', event.target.value)} required />
            </div>
          )}
          <div className="field">
            <label>Expiry date</label>
            <input type="date" value={form.expiry_date} onChange={(event) => update('expiry_date', event.target.value)} required />
          </div>
          <div className="field">
            <label>Manufacture date <span style={{ color: 'var(--steel)', fontWeight: 400 }}>(optional)</span></label>
            <input type="date" value={form.manufacture_date} onChange={(event) => update('manufacture_date', event.target.value)} />
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
            <input type="number" min="0" step="0.01" value={form.cost_price} onChange={(event) => update('cost_price', event.target.value)} />
          </div>
          <div className="field">
            <label>Selling price <span style={{ color: 'var(--steel)', fontWeight: 400 }}>(optional)</span></label>
            <input type="number" min="0" step="0.01" value={form.selling_price} onChange={(event) => update('selling_price', event.target.value)} />
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

        {displayError && <p className="error-text" style={{ marginBottom: 0 }}>{displayError}</p>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving...' : isEditing ? 'Update batch' : 'Receive stock'}
          </button>
        </div>
      </form>
    </AnimatedModal>
  );
}

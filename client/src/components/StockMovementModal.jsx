import { useEffect, useState } from 'react';
import { ArrowLeftRight, X } from 'lucide-react';
import AnimatedModal from './AnimatedModal';
import { validateMovementForm, trimFields, MAX_LENGTH } from '../utils/validation';

const emptyForm = { batch_id: '', transaction_type: 'sale', direction: 'increase', quantity: '', reason: '' };
const types = [
  { value: 'sale', label: 'Sale or dispense' },
  { value: 'disposal', label: 'Dispose stock' },
  { value: 'return', label: 'Return stock' },
  { value: 'adjustment', label: 'Adjust quantity' }
];

// Single shared "record a stock transaction" form. When `medicine` is given
// (opened from a medicine's detail view), it's scoped to that medicine's
// batches. When omitted (opened from the Transactions page), `batches` is
// the full list and each option is labeled with its medicine name.
export default function StockMovementModal({ isOpen, onClose, medicine, batches, onSubmit, error }) {
  const [form, setForm] = useState(emptyForm);
  const [localError, setLocalError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setForm({ ...emptyForm, batch_id: batches[0]?.id || '' });
      setSubmitting(false);
      setLocalError('');
    }
  }, [isOpen, batches]);

  async function handleSubmit(event) {
    event.preventDefault();
    setLocalError('');
    const validationError = validateMovementForm(form);
    if (validationError) {
      setLocalError(validationError);
      return;
    }
    const batch = batches.find((b) => String(b.id) === String(form.batch_id));
    if (form.transaction_type === 'sale' && ['expired', 'recalled'].includes(batch?.status)) {
      setLocalError(`This batch is ${batch.status} and cannot be sold. Record a disposal instead.`);
      return;
    }
    if (batch) {
      // Same limits the server enforces: never below 0, never above what was received.
      const qty = Number(form.quantity);
      const remaining = Number(batch.quantity_remaining);
      const reduces = ['sale', 'disposal'].includes(form.transaction_type)
        || (form.transaction_type === 'adjustment' && form.direction === 'decrease');
      if (reduces && qty > remaining) {
        setLocalError(`Insufficient stock. Only ${remaining} remaining in this batch.`);
        return;
      }
      if (!reduces && batch.quantity_received != null && remaining + qty > Number(batch.quantity_received)) {
        setLocalError(`That would leave ${remaining + qty} in a batch that only received ${batch.quantity_received}.`);
        return;
      }
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(trimFields(form));
      onClose();
    } catch {
      // Keep the entered values available when the API rejects the movement.
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
              <ArrowLeftRight size={20} /> Record movement
            </h2>
            {medicine && <p style={{ margin: '6px 0 0', color: 'var(--steel)', fontSize: 13 }}>{medicine.name}</p>}
          </div>
          <button type="button" className="btn-icon" onClick={onClose} title="Close"><X size={18} /></button>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <div className="field">
            <label>Batch</label>
            <select value={form.batch_id} onChange={(event) => setForm({ ...form, batch_id: event.target.value })} required>
              <option value="">Choose a batch</option>
              {batches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {medicine ? '' : `${batch.medicine_name} — `}{batch.batch_number} ({batch.quantity_remaining} {medicine?.unit || ''} left{batch.status !== 'active' ? `, ${batch.status}` : ''})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>What happened?</label>
            <select value={form.transaction_type} onChange={(event) => setForm({ ...form, transaction_type: event.target.value })}>
              {types.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </div>
          {form.transaction_type === 'adjustment' && (
            <div className="field">
              <label>Adjust by</label>
              <select value={form.direction} onChange={(event) => setForm({ ...form, direction: event.target.value })}>
                <option value="increase">Adding stock (count found more)</option>
                <option value="decrease">Removing stock (count found less)</option>
              </select>
            </div>
          )}
          <div className="field">
            <label>Quantity</label>
            <input type="number" inputMode="numeric" min="1" step="1" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} required autoFocus />
          </div>
          <div className="field">
            <label>Reason <span style={{ color: 'var(--steel)', fontWeight: 400 }}>(optional)</span></label>
            <input value={form.reason} maxLength={MAX_LENGTH.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="e.g. damaged stock" />
          </div>
        </div>

        {displayError && <p className="error-text" role="alert">{displayError}</p>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" className="flat-action-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="flat-btn-primary" disabled={submitting || batches.length === 0}>
            {submitting ? 'Saving...' : 'Save movement'}
          </button>
        </div>
      </form>
    </AnimatedModal>
  );
}

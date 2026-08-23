import { useEffect, useState } from 'react';
import { ArrowLeftRight, X } from 'lucide-react';
import AnimatedModal from './AnimatedModal';

const emptyForm = { batch_id: '', transaction_type: 'sale', quantity: '', reason: '' };
const types = [
  { value: 'sale', label: 'Sale or dispense' },
  { value: 'disposal', label: 'Dispose stock' },
  { value: 'return', label: 'Return stock' },
  { value: 'adjustment', label: 'Adjust quantity' }
];

export default function StockMovementModal({ isOpen, onClose, medicine, batches, onSubmit, error }) {
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setForm({ ...emptyForm, batch_id: batches[0]?.id || '' });
      setSubmitting(false);
    }
  }, [isOpen, batches]);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit(form);
      onClose();
    } catch {
      // Keep the entered values available when the API rejects the movement.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AnimatedModal isOpen={isOpen} onClose={onClose}>
      <form onSubmit={handleSubmit} className="card" style={{ padding: 24, border: 'none', boxShadow: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <ArrowLeftRight size={20} /> Record movement
            </h2>
            <p style={{ margin: '6px 0 0', color: 'var(--steel)', fontSize: 13 }}>{medicine.name}</p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} title="Close"><X size={18} /></button>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <div className="field">
            <label>What happened?</label>
            <select value={form.transaction_type} onChange={(event) => setForm({ ...form, transaction_type: event.target.value })}>
              {types.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Batch</label>
            <select value={form.batch_id} onChange={(event) => setForm({ ...form, batch_id: event.target.value })} required>
              <option value="">Choose a batch</option>
              {batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.batch_number} ({batch.quantity_remaining} {medicine.unit} left{batch.status === 'depleted' ? ', depleted' : ''})</option>)}
            </select>
          </div>
          <div className="field">
            <label>Quantity</label>
            <input type="number" min="1" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} required autoFocus />
          </div>
          <div className="field">
            <label>Reason <span style={{ color: 'var(--steel)', fontWeight: 400 }}>(optional)</span></label>
            <input value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="e.g. damaged stock" />
          </div>
        </div>

        {error && <p className="error-text">{error}</p>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={submitting || batches.length === 0}>
            {submitting ? 'Saving...' : 'Save movement'}
          </button>
        </div>
      </form>
    </AnimatedModal>
  );
}

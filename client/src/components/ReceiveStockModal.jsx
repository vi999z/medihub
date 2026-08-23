import { useEffect, useState } from 'react';
import { Package, X } from 'lucide-react';
import AnimatedModal from './AnimatedModal';

const emptyForm = {
  medicine_id: '',
  supplier_id: '',
  batch_number: '',
  quantity_received: '',
  expiry_date: '',
  cost_price: '',
  selling_price: ''
};

export default function ReceiveStockModal({ isOpen, onClose, medicines, suppliers, initialMedicine, onSubmit, error }) {
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setForm({ ...emptyForm, medicine_id: initialMedicine?.id || '' });
      setSubmitting(false);
    }
  }, [isOpen, initialMedicine]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
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

  return (
    <AnimatedModal isOpen={isOpen} onClose={onClose}>
      <form onSubmit={handleSubmit} className="card" style={{ padding: 24, border: 'none', boxShadow: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Package size={20} /> Receive stock
            </h2>
            <p style={{ margin: '6px 0 0', color: 'var(--steel)', fontSize: 13 }}>
              Add one new batch to your inventory.
            </p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
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
          <div className="field">
            <label>Quantity received</label>
            <input type="number" min="1" value={form.quantity_received} onChange={(event) => update('quantity_received', event.target.value)} required autoFocus />
          </div>
          <div className="field">
            <label>Batch number</label>
            <input value={form.batch_number} onChange={(event) => update('batch_number', event.target.value)} required />
          </div>
          <div className="field">
            <label>Expiry date</label>
            <input type="date" value={form.expiry_date} onChange={(event) => update('expiry_date', event.target.value)} required />
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
        </div>

        {error && <p className="error-text" style={{ marginBottom: 0 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving...' : 'Receive stock'}
          </button>
        </div>
      </form>
    </AnimatedModal>
  );
}

import { daysUntil } from './date';

// One status rule for a batch, shared by the Batches page and the medicine
// detail view (they had drifted apart). `cls` is a flat palette colour:
// red → amber → orange → green as expiry gets further away.
export function batchStatus(batch) {
  if (batch.status === 'expired') return { cls: 'red', label: 'Expired' };
  if (batch.status === 'depleted') return { cls: 'orange', label: 'Depleted' };
  if (batch.status === 'recalled') return { cls: 'red', label: 'Recalled' };
  if (!batch.expiry_date) return { cls: 'green', label: 'Active' };
  const days = daysUntil(batch.expiry_date);
  if (days <= 3) return { cls: 'red', label: `${days}d left` };
  if (days <= 14) return { cls: 'amber', label: `${days}d left` };
  if (days <= 60) return { cls: 'orange', label: `${days}d left` };
  return { cls: 'green', label: 'Active' };
}

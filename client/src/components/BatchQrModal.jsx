import { X } from 'lucide-react';
import AnimatedModal from './AnimatedModal';
import QRCodeDisplay from './QRCode';

// Shared "show / download a batch's QR code" dialog — the Medicines and
// Batches pages each had their own copy.
export default function BatchQrModal({ batch, onClose }) {
  function download() {
    const canvas = document.querySelector('.qr-code-container canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `batch-${batch.batch_number}-qr.png`;
    link.href = canvas.toDataURL();
    link.click();
  }

  return (
    <AnimatedModal isOpen={Boolean(batch)} onClose={onClose} className="confirm-modal">
      {batch && (
        <div className="confirm-modal__body">
          <div className="tile-breakdown-modal__header">
            <h2 style={{ margin: 0, fontSize: 17 }}>Batch QR code</h2>
            <button type="button" className="btn-icon" onClick={onClose} title="Close QR code"><X size={18} /></button>
          </div>
          <div style={{ textAlign: 'center', margin: '16px 0' }}>
            <QRCodeDisplay value={batch.id.toString()} size={250} />
          </div>
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <div className="flat-med-name">{batch.medicine_name}</div>
            <div className="flat-med-meta">Batch {batch.batch_number} · ID {batch.id}</div>
          </div>
          <button type="button" className="flat-btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={download}>
            Download QR code
          </button>
        </div>
      )}
    </AnimatedModal>
  );
}

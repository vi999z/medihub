import { X } from 'lucide-react';
import AnimatedModal from './AnimatedModal';
import QRCodeDisplay from './QRCode';

// QR codes carry a prefix saying what they point to, so the scanner can tell a
// medicine from a batch: MEDIHUB:M:<id> and MEDIHUB:B:<id>.
const qrPayload = (kind, id) => `MEDIHUB:${kind === 'medicine' ? 'M' : 'B'}:${id}`;

// Shows and downloads a QR code for a medicine or a batch.
// `target` = { kind: 'medicine' | 'batch', id, title, subtitle } (null = closed).
export default function QrModal({ target, onClose }) {
  function download() {
    const canvas = document.querySelector('.qr-code-container canvas');
    if (!canvas || !target) return;
    const link = document.createElement('a');
    link.download = `${target.kind}-${target.id}-qr.png`;
    link.href = canvas.toDataURL();
    link.click();
  }

  return (
    <AnimatedModal isOpen={Boolean(target)} onClose={onClose} className="confirm-modal">
      {target && (
        <div className="confirm-modal__body">
          <div className="tile-breakdown-modal__header">
            <h2 style={{ margin: 0, fontSize: 17 }}>{target.kind === 'medicine' ? 'Medicine QR code' : 'Batch QR code'}</h2>
            <button type="button" className="btn-icon" onClick={onClose} title="Close QR code" aria-label="Close QR code"><X size={18} /></button>
          </div>
          <div style={{ textAlign: 'center', margin: '16px 0' }}>
            <QRCodeDisplay value={qrPayload(target.kind, target.id)} size={250} />
          </div>
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <div className="flat-med-name">{target.title}</div>
            {target.subtitle && <div className="flat-med-meta">{target.subtitle}</div>}
          </div>
          <button type="button" className="flat-btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={download}>
            Download QR code
          </button>
        </div>
      )}
    </AnimatedModal>
  );
}

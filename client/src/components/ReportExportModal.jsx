import { X } from 'lucide-react';
import AnimatedModal from './AnimatedModal';
import ReportPanel from './ReportPanel';

// The Export button on every page opens this: the same report form as the
// Reports page, opened on the report that fits the page. `onExportView`
// (optional) adds a button for the list currently on screen.
export default function ReportExportModal({ isOpen, onClose, onExportView, viewLabel = 'Download this list (CSV)', defaultReport = 'sales' }) {
  return (
    <AnimatedModal isOpen={isOpen} onClose={onClose} className="confirm-modal">
      <div className="confirm-modal__body">
        <div className="tile-breakdown-modal__header">
          <h2 style={{ margin: 0, fontSize: 17 }}>Export a report</h2>
          <button type="button" className="btn-icon" onClick={onClose} title="Close" aria-label="Close"><X size={18} /></button>
        </div>
        {isOpen && (
          <ReportPanel
            defaultReport={defaultReport}
            onDone={onClose}
            extraAction={onExportView && (
              <button type="button" className="flat-action-btn" onClick={() => { onExportView(); onClose(); }}>{viewLabel}</button>
            )}
          />
        )}
      </div>
    </AnimatedModal>
  );
}

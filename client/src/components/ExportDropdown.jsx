import { useEffect, useRef, useState } from 'react';
import { Download, ChevronDown } from 'lucide-react';

// Shared "Export ▾" menu — was copy-pasted (with drifting styles) across the
// Medicines, Batches, Transactions, Alerts and AI Insights pages.
// `options` is a list of { label, ... } entries, with `null` for a divider;
// the chosen entry is handed back to `onSelect` as-is.
export default function ExportDropdown({ options, onSelect, label = 'Export' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    function onClickOutside(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" className="flat-action-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Download size={15} /> {label} <ChevronDown size={13} />
      </button>
      {open && (
        <div className="flat-menu">
          {options.map((opt, idx) => opt === null ? (
            <hr key={idx} className="flat-menu__divider" />
          ) : (
            <button
              key={idx}
              type="button"
              className="flat-menu__item"
              onClick={() => { onSelect(opt); setOpen(false); }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

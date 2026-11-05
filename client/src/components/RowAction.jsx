// A table row's action button: icon-only on desktop, icon and label in the
// mobile list layout (see .row-action in theme.css).
export default function RowAction({ icon: Icon, label, onClick, primary = false }) {
  return (
    <button
      type="button"
      className={`${primary ? 'flat-btn-primary' : 'flat-action-btn'} row-action`}
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      <Icon size={14} />
      <span>{label}</span>
    </button>
  );
}

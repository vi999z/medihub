// Title and one-line purpose shown at the top of every page, so a first-time
// user can tell what a page is for. `legend` adds the colour key used by
// status labels and alerts.
const LEGEND = [
  { cls: 'red', label: 'Critical, expired or out of stock' },
  { cls: 'amber', label: 'Warning or low stock' },
  { cls: 'orange', label: 'Expiring soon' },
  { cls: 'green', label: 'Healthy or information' },
];

export default function PageHeader({ title, description, legend = false }) {
  return (
    <div className="page-header page-header--flat">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {legend && (
        <ul className="status-legend" aria-label="What the colours mean">
          {LEGEND.map((item) => (
            <li key={item.cls}><span className={`flat-status-label ${item.cls}`}>{item.label}</span></li>
          ))}
        </ul>
      )}
    </div>
  );
}

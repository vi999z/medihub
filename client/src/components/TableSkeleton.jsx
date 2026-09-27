// Shared loading placeholder for data tables — was duplicated almost
// identically across the AI Insights and Weather Restock tabs.
export default function TableSkeleton({ cols, rows = 4 }) {
  return (
    <tbody>
      {Array.from({ length: rows }).map((_, index) => (
        <tr key={index}>
          {Array.from({ length: cols }).map((__, colIndex) => (
            <td key={colIndex}>
              <div className="skeleton" style={{ height: 13, width: colIndex === cols - 1 ? '68%' : '100%' }} />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

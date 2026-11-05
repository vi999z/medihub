import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// First, last and the pages around the current one, with gaps between: 1 … 4 5 6 … 20
function visiblePages(page, pageCount) {
  const wanted = [...new Set([1, page - 1, page, page + 1, pageCount])]
    .filter((n) => n >= 1 && n <= pageCount)
    .sort((a, b) => a - b);
  const list = [];
  wanted.forEach((n, index) => {
    if (index > 0 && n - wanted[index - 1] > 1) list.push(`gap-${n}`);
    list.push(n);
  });
  return list;
}

// Footer for a paginated list inside a .flat-card. Takes the usePagination() result.
export default function Pagination({
  page, pageCount, pageSize, total, start, setPage, setPageSize,
  pageSizeOptions = [10, 25, 50, 100], itemLabel = 'items',
}) {
  const rootRef = useRef(null);
  if (total === 0) return null;

  // Back to the top of the list, otherwise the next page opens at its bottom.
  function goTo(next) {
    setPage(next);
    rootRef.current?.closest('.flat-card')?.scrollIntoView({ block: 'start' });
  }

  return (
    <nav className="pagination" ref={rootRef} aria-label={`${itemLabel} pages`}>
      <span className="pagination__summary">
        Showing {start + 1}–{Math.min(start + pageSize, total)} of {total} {itemLabel}
      </span>

      <label className="pagination__size">
        Per page
        <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
          {pageSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>

      <div className="pagination__nav">
        <button type="button" className="pagination__btn" onClick={() => goTo(page - 1)} disabled={page <= 1} aria-label="Previous page">
          <ChevronLeft size={16} />
        </button>
        <span className="pagination__pages">
          {visiblePages(page, pageCount).map((item) => (typeof item === 'string'
            ? <span key={item} className="pagination__gap" aria-hidden="true">…</span>
            : (
              <button
                key={item}
                type="button"
                className="pagination__btn"
                onClick={() => goTo(item)}
                aria-label={`Page ${item}`}
                aria-current={item === page ? 'page' : undefined}
              >
                {item}
              </button>
            )))}
        </span>
        <span className="pagination__compact">Page {page} of {pageCount}</span>
        <button type="button" className="pagination__btn" onClick={() => goTo(page + 1)} disabled={page >= pageCount} aria-label="Next page">
          <ChevronRight size={16} />
        </button>
      </div>
    </nav>
  );
}

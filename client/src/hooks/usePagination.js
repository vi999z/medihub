import { useMemo, useState } from 'react';

// Client-side pagination over an already-filtered list. Spread the result onto
// <Pagination /> and render `pageItems`.
//
// `resetKey` should change whenever the filters do, which sends the user back to
// page 1. Plain data refreshes (e.g. marking an alert as read) keep the current
// page; if the list shrinks past it, the last page is shown instead.
export default function usePagination(items, { pageSize: initialPageSize = 25, resetKey = '' } = {}) {
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  const [requested, setRequested] = useState({ page: 1, resetKey });

  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requested.resetKey === resetKey ? requested.page : 1, pageCount);
  const start = (page - 1) * pageSize;
  const pageItems = useMemo(() => items.slice(start, start + pageSize), [items, start, pageSize]);

  function setPage(next) {
    setRequested({ page: next, resetKey });
  }

  function setPageSize(next) {
    setPageSizeState(next);
    setRequested({ page: 1, resetKey });
  }

  return { page, pageCount, pageSize, pageItems, total, start, setPage, setPageSize };
}

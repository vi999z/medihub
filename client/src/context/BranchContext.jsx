import { createContext, useCallback, useContext, useMemo, useState } from 'react';

// The branch you are looking at ("all" or a branch name). It is shared by
// every page (Medicines, Batches, Transactions, Dashboard, Reports) and kept
// between visits, so picking QMC once means every list shows QMC.
const STORAGE_KEY = 'medihub_branch';
const BranchContext = createContext({ branch: 'all', setBranch: () => {} });

function readStored() {
  try { return localStorage.getItem(STORAGE_KEY) || 'all'; } catch { return 'all'; }
}

export function BranchProvider({ children }) {
  const [branch, setBranchState] = useState(readStored);

  const setBranch = useCallback((next) => {
    const value = next || 'all';
    setBranchState(value);
    try { localStorage.setItem(STORAGE_KEY, value); } catch { /* storage unavailable */ }
  }, []);

  const value = useMemo(() => ({ branch, setBranch }), [branch, setBranch]);
  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useBranchFilter() {
  return useContext(BranchContext);
}

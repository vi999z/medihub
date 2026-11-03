import { useCallback, useEffect, useState } from 'react';
import api from '../api/axios';

const FALLBACK = ['QMC', 'MT Carmel'];

// Branches come from the server (administrators can add more), so forms and
// filters never hard-code them. `names` are the active branches; `all` includes
// deactivated ones (for the Branches page).
export default function useBranches() {
  const [all, setAll] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      const res = await api.cachedGet('/branches');
      setAll(res.data || []);
    } catch {
      setAll([]); // the forms fall back to the two original branches
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const names = all.length ? all.filter((b) => b.is_active).map((b) => b.name) : FALLBACK;
  return { names, all, loaded, reload };
}

import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Plus, Pencil, Search, X } from 'lucide-react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import StaggeredList from '../components/StaggeredList';
import Skeleton from '../components/Skeleton';

export default function Users() {
  const { user: me } = useAuth();
  const { addToast } = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'pharmacist', is_active: true });
  const [error, setError] = useState('');
  const prefersReducedMotion = useReducedMotion();

  async function fetchAll() {
    try {
      const res = await api.cachedGet('/users');
      setUsers(res.data);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load accounts');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { fetchAll(); }, []);

  const visibleUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users;
    return users.filter((u) => [u.full_name, u.email, u.role].some((value) => String(value || '').toLowerCase().includes(term)));
  }, [users, search]);

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setForm({ full_name: '', email: '', password: '', role: 'pharmacist', is_active: true });
  }

  function openEdit(user) {
    setEditingId(user.id);
    setForm({ full_name: user.full_name, email: user.email, password: '', role: user.role, is_active: Boolean(user.is_active) });
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      if (editingId) {
        await api.put(`/users/${editingId}`, { full_name: form.full_name, email: form.email, role: form.role, is_active: form.is_active });
        addToast('Account updated', 'success');
      } else {
        await api.post('/users', form);
        addToast('Account created', 'success');
      }
      api.invalidateCache('/users');
      resetForm();
      await fetchAll();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to save account', 'error');
    }
  }

  async function toggleActive(u) {
    if (u.is_active && !window.confirm(`Deactivate ${u.full_name}'s account?`)) return;
    try {
      await api.patch(`/users/${u.id}/status`, { is_active: !u.is_active });
      api.invalidateCache('/users');
      await fetchAll();
      addToast(`${u.full_name} ${u.is_active ? 'deactivated' : 'reactivated'}`, 'success');
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to update account status', 'error');
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.4 }}
    >
      <div className="page-header">
        <div>
          <h1>Users</h1>
          <p>{loading ? 'Loading accounts…' : `${visibleUsers.length} of ${users.length} accounts shown`}</p>
        </div>
        <button className="btn btn-primary" onClick={() => showForm ? resetForm() : setShowForm(true)}><Plus size={15} /> {showForm ? 'Close form' : 'Add account'}</button>
      </div>

      {showForm && (
        <motion.form 
          onSubmit={handleSubmit} 
          className="card" 
          style={{ marginBottom: 20, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.3 }}
        >
          <div className="field"><label>Full name</label><input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required /></div>
          <div className="field"><label>Email</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
          {!editingId && (
            <div className="field"><label>Temporary password</label><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></div>
          )}
          <div className="field">
            <label>Role</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="pharmacist">Pharmacist</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {error && <p className="error-text" style={{ gridColumn: '1 / -1' }}>{error}</p>}
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10 }}>
            <button type="submit" className="btn btn-primary">{editingId ? 'Update account' : 'Create account'}</button>
            <button type="button" className="btn btn-secondary" onClick={resetForm}>Cancel</button>
          </div>
        </motion.form>
      )}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.5, delay: prefersReducedMotion ? 0 : 0.1 }}
      >
        <div className="filter-bar" style={{ padding: 16, margin: 0, marginBottom: 16, background: 'var(--surface-strong)', borderRadius: 'var(--radius)' }}>
          <div className="filter-search">
            <Search size={15} className="filter-search-icon" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, role…"
              aria-label="Search accounts"
            />
            {search && (
              <button type="button" className="btn-icon filter-search-clear" onClick={() => setSearch('')} title="Clear search">
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="empty-state">
            <strong>Unable to load accounts</strong>
            <p style={{ margin: '6px 0 0' }}>{error}</p>
            <button className="btn btn-secondary" style={{ marginTop: 10 }} onClick={fetchAll}>Retry</button>
          </div>
        )}

        {!loading && !error && visibleUsers.length === 0 && (
          <div className="empty-state compact-empty-state">No accounts match “{search}”.</div>
        )}

        {loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="card" style={{ minHeight: 210, padding: 16 }}>
                <Skeleton height={14} style={{ marginBottom: 14, width: '35%' }} />
                <Skeleton height={18} style={{ marginBottom: 10 }} />
                <Skeleton height={14} style={{ marginBottom: 8, width: '75%' }} />
                <Skeleton height={14} style={{ marginBottom: 18, width: '45%' }} />
                <Skeleton height={32} style={{ borderRadius: 999 }} />
              </div>
            ))}
          </div>
        )}

        {!loading && !error && visibleUsers.length > 0 && (
          <StaggeredList staggerDelay={0.03}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {visibleUsers.map((u) => (
                <motion.div key={u.id} className="card" style={{ padding: 16, borderTop: `4px solid ${u.is_active ? 'var(--green)' : 'var(--red)'}`, display: 'flex', flexDirection: 'column', minHeight: 205 }} whileHover={{ y: -4, boxShadow: 'var(--shadow-md)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span className="stamp">ID: {u.id}</span>
                    <span className={`status-pill ${u.is_active ? 'safe' : 'critical'}`} style={{ fontSize: 10, padding: '3px 8px' }}>{u.is_active ? 'Active' : 'Inactive'}</span>
                  </div>
                  <div style={{ flex: 1, marginBottom: 14 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{u.full_name}</div>
                    <div style={{ color: 'var(--steel)', fontSize: 12, marginBottom: 12, overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email}</div>
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}><div style={{ color: 'var(--steel)', fontSize: 11 }}>Role</div><div style={{ fontWeight: 600, textTransform: 'capitalize' }}>{u.role}</div></div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--gradient-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12 }}>{u.full_name.charAt(0).toUpperCase()}</div><span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)' }}>Account</span></div>
                    <div style={{ display: 'flex', gap: 6 }}><button className="btn-icon" onClick={() => openEdit(u)} title="Edit account"><Pencil size={14} /></button>{u.id !== me.id && <button className="btn-icon" onClick={() => toggleActive(u)} title={u.is_active ? 'Deactivate' : 'Reactivate'}>{u.is_active ? <X size={14} /> : <Plus size={14} />}</button>}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </StaggeredList>
        )}
      </motion.div>
    </motion.div>
  );
}
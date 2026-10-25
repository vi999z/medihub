import { useEffect, useMemo, useState } from 'react';
import { KeyRound, Plus, Pencil, Search, X, UserX, UserCheck } from 'lucide-react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useDialog } from '../context/DialogContext';
import { isValidName, isValidEmail } from '../utils/validation';

export default function Users() {
  const { user: me } = useAuth();
  const { addToast } = useToast();
  const { confirm, alert } = useDialog();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'pharmacist', is_active: true });
  const [error, setError] = useState('');

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
    if (!isValidName(form.full_name)) {
      addToast('Full name can only contain letters, numbers, spaces and . , \' & / ( ) -', 'error');
      return;
    }
    if (!isValidEmail(form.email)) {
      addToast('Enter a valid email address', 'error');
      return;
    }
    if (!editingId && form.password.length < 8) {
      addToast('Temporary password must be at least 8 characters', 'error');
      return;
    }
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
    if (u.is_active && !(await confirm({ title: 'Deactivate account', message: `Deactivate ${u.full_name}'s account?`, confirmLabel: 'Deactivate', danger: true }))) return;
    try {
      await api.patch(`/users/${u.id}/status`, { is_active: !u.is_active });
      api.invalidateCache('/users');
      await fetchAll();
      addToast(`${u.full_name} ${u.is_active ? 'deactivated' : 'reactivated'}`, 'success');
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to update account status', 'error');
    }
  }

  async function resetPassword(u) {
    if (!(await confirm({ title: 'Reset password', message: `Generate a new temporary password for ${u.full_name}?`, confirmLabel: 'Generate' }))) return;
    try {
      const res = await api.post(`/users/${u.id}/reset-password`);
      await alert({ title: 'Temporary password', message: `Temporary password for ${u.full_name}:\n\n${res.data.temporary_password}\n\nThis password will not be shown again.` });
      addToast('Temporary password generated', 'success');
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to reset password', 'error');
    }
  }

  return (
    <div className="flat-dashboard">
      <div className="page-actions-only">
        <div className="page-header-actions">
          <button type="button" className="flat-btn-primary" onClick={() => showForm ? resetForm() : setShowForm(true)}>
            <Plus size={15} /> {showForm ? 'Close form' : 'Add account'}
          </button>
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="flat-card"
          style={{ padding: 16, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(250px, 100%), 1fr))' }}
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
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10 }}>
            <button type="submit" className="flat-btn-primary">{editingId ? 'Update account' : 'Create account'}</button>
            <button type="button" className="flat-action-btn" onClick={resetForm}>Cancel</button>
          </div>
        </form>
      )}

      <div className="flat-card" style={{ padding: 16 }}>
        <div className="filter-bar" style={{ margin: 0, background: 'none', border: 'none', padding: 0 }}>
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
      </div>

      <div className="flat-card">
        <div className="flat-table-header">
          <span className="flat-table-title">Accounts</span>
          {search && (
            <button type="button" className="flat-table-link" onClick={() => setSearch('')}>Clear search</button>
          )}
        </div>
        <div style={{ padding: 16 }}>
          {error && (
            <div className="flat-empty">
              Unable to load accounts — {error}
              <div style={{ marginTop: 10 }}>
                <button type="button" className="flat-action-btn" onClick={fetchAll}>Retry</button>
              </div>
            </div>
          )}

          {!error && loading && (
            <div className="flat-card-grid">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flat-card flat-item-card">
                  <div className="flat-item-icon skeleton" style={{ border: 'none' }} />
                  <div className="skeleton" style={{ height: 16, width: '70%', margin: '4px 0' }} />
                  <div className="skeleton" style={{ height: 12, width: '50%' }} />
                </div>
              ))}
            </div>
          )}

          {!error && !loading && visibleUsers.length === 0 && (
            <div className="flat-empty">{users.length === 0 ? 'No accounts yet. Add your first one above.' : `No accounts match "${search}".`}</div>
          )}

          {!error && !loading && visibleUsers.length > 0 && (
            <div className="flat-card-grid">
              {visibleUsers.map((u) => (
                <div key={u.id} className={`flat-card flat-item-card flat-item-card--${u.is_active ? 'green' : 'red'}`} style={{ cursor: 'default' }}>
                  <div className="flat-item-card__top">
                    <div className="flat-item-icon" style={{ fontWeight: 700, fontSize: 18 }}>{(u.full_name || '?').charAt(0).toUpperCase()}</div>
                    <span className={`flat-status-label ${u.is_active ? 'green' : 'red'}`}>{u.is_active ? 'Active' : 'Inactive'}</span>
                  </div>
                  <div className="flat-med-name">{u.full_name}{u.id === me.id ? ' (you)' : ''}</div>
                  <div className="flat-med-meta" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email}</div>
                  <div className="flat-item-row">
                    <span>Role</span>
                    <strong style={{ textTransform: 'capitalize' }}>{u.role}</strong>
                  </div>
                  <div className="flat-item-row">
                    <span>Account ID</span>
                    <strong>{u.id}</strong>
                  </div>
                  <div className="flat-item-card__actions" style={{ flexWrap: 'wrap' }}>
                    <button type="button" className="flat-action-btn" onClick={() => openEdit(u)}>
                      <Pencil size={13} /> Edit
                    </button>
                    {u.id !== me.id && (
                      <>
                        <button type="button" className="flat-action-btn" onClick={() => resetPassword(u)} title="Generate temporary password">
                          <KeyRound size={13} /> Reset
                        </button>
                        <button type="button" className="flat-action-btn" onClick={() => toggleActive(u)}>
                          {u.is_active ? <><UserX size={13} /> Deactivate</> : <><UserCheck size={13} /> Reactivate</>}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

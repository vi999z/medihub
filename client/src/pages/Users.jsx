import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Search, X } from 'lucide-react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';

export default function Users() {
  const { user: me } = useAuth();
  const { addToast } = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'pharmacist', is_active: true });

  async function fetchAll() {
    try {
      const res = await api.cachedGet('/users');
      setUsers(res.data);
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
    <>
      <div className="page-header">
        <div>
          <h1>Users</h1>
          <p>{loading ? 'Loading accounts…' : `${visibleUsers.length} of ${users.length} accounts shown`}</p>
        </div>
        <button className="btn btn-primary" onClick={() => showForm ? resetForm() : setShowForm(true)}><Plus size={15} /> {showForm ? 'Close form' : 'Add account'}</button>
      </div>

      <Modal
        open={showForm}
        onClose={resetForm}
        icon={Plus}
        title={editingId ? 'Edit account' : 'Add account'}
        subtitle={editingId ? 'Update this user’s details.' : 'Create a new user account.'}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={resetForm}>Cancel</button>
            <button type="submit" form="user-form" className="btn btn-primary">{editingId ? 'Update account' : 'Create account'}</button>
          </>
        }
      >
        <form id="user-form" onSubmit={handleSubmit} className="form-grid">
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
        </form>
      </Modal>

      <div className="card" style={{ padding: 16 }}>
        <div className="filter-bar">
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

        {!loading && visibleUsers.length === 0 && (
          <div className="empty-state">No accounts match “{search}”.</div>
        )}

        <table className="data-table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {visibleUsers.map((u) => (
              <tr key={u.id}>
                <td style={{ fontWeight: 500 }}>{u.full_name}</td>
                <td>{u.email}</td>
                <td style={{ textTransform: 'capitalize' }}>{u.role}</td>
                <td><span className={`status-pill ${u.is_active ? 'safe' : 'critical'}`}>{u.is_active ? 'Active' : 'Inactive'}</span></td>
                <td>
                  {u.id !== me.id && (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <button className="btn-icon" onClick={() => openEdit(u)} title="Edit account"><Pencil size={14} /></button>
                      <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => toggleActive(u)}>
                        {u.is_active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function Users() {
  const { user: me } = useAuth();
  const { addToast } = useToast();
  const [users, setUsers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'pharmacist' });

  async function fetchAll() {
    const res = await api.cachedGet('/users');
    setUsers(res.data);
  }
  useEffect(() => { fetchAll(); }, []);

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setForm({ full_name: '', email: '', password: '', role: 'pharmacist' });
  }

  function openEdit(user) {
    setEditingId(user.id);
    setForm({ full_name: user.full_name, email: user.email, password: '', role: user.role });
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      if (editingId) {
        await api.put(`/users/${editingId}`, { full_name: form.full_name, email: form.email, role: form.role, is_active: true });
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

  async function handleDelete(u) {
    if (!window.confirm(`Deactivate ${u.full_name}'s account?`)) return;
    try {
      await api.delete(`/users/${u.id}`);
      api.invalidateCache('/users');
      await fetchAll();
      addToast('Account deactivated', 'success');
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to deactivate account', 'error');
    }
  }

  async function toggleActive(u) {
    await api.patch(`/users/${u.id}/status`, { is_active: !u.is_active });
    api.invalidateCache('/users');
    await fetchAll();
    addToast(`${u.full_name} ${u.is_active ? 'deactivated' : 'reactivated'}`, 'success');
  }

  return (
    <>
      <div className="page-header">
        <div><h1>Users</h1><p>{users.length} accounts</p></div>
        <button className="btn btn-primary" onClick={() => showForm ? resetForm() : setShowForm(true)}><Plus size={15} /> {showForm ? 'Close form' : 'Add account'}</button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card" style={{ padding: 20, marginBottom: 20, display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
          <div className="field"><label>Full name</label><input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required /></div>
          <div className="field"><label>Email</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
          <div className="field"><label>Temporary password</label><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></div>
          <div className="field">
            <label>Role</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="pharmacist">Pharmacist</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div style={{ gridColumn: 'span 2', display: 'flex', gap: 10 }}>
            <button type="submit" className="btn btn-primary">{editingId ? 'Update account' : 'Create account'}</button>
            <button type="button" className="btn btn-secondary" onClick={resetForm}>Cancel</button>
          </div>
        </form>
      )}

      <div className="card">
        <table className="data-table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td style={{ fontWeight: 500 }}>{u.full_name}</td>
                <td>{u.email}</td>
                <td style={{ textTransform: 'capitalize' }}>{u.role}</td>
                <td><span className={`status-pill ${u.is_active ? 'safe' : 'critical'}`}>{u.is_active ? 'Active' : 'Inactive'}</span></td>
                <td>
                  {u.id !== me.id && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn-icon" onClick={() => openEdit(u)} title="Edit account"><Pencil size={14} /></button>
                      <button className="btn-icon" onClick={() => handleDelete(u)} title="Deactivate account"><Trash2 size={14} /></button>
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
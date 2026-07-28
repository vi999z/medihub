import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function Users() {
  const { user: me } = useAuth();
  const { addToast } = useToast();
  const [users, setUsers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'pharmacist' });

  async function fetchAll() {
    const res = await api.get('/users');
    setUsers(res.data);
  }
  useEffect(() => { fetchAll(); }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      await api.post('/users', form);
      setForm({ full_name: '', email: '', password: '', role: 'pharmacist' });
      setShowForm(false);
      fetchAll();
      addToast('Account created', 'success');
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to create account', 'error');
    }
  }

  async function toggleActive(u) {
    await api.patch(`/users/${u.id}/status`, { is_active: !u.is_active });
    fetchAll();
    addToast(`${u.full_name} ${u.is_active ? 'deactivated' : 'reactivated'}`, 'success');
  }

  return (
    <>
      <div className="page-header">
        <div><h1>Users</h1><p>{users.length} accounts</p></div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}><Plus size={15} /> Add account</button>
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
            <button type="submit" className="btn btn-primary">Create account</button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
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
                    <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => toggleActive(u)}>
                      {u.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
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
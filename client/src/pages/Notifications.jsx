import { useEffect, useState } from 'react';
import { CheckCheck } from 'lucide-react';
import api from '../api/axios';

function severityPill(sev) {
  if (sev === 'critical') return 'critical';
  if (sev === 'warning') return 'warning';
  return 'safe';
}

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);

  async function fetchAll() {
    const res = await api.get('/notifications');
    setNotifications(res.data);
  }

  useEffect(() => { fetchAll(); }, []);

  async function markRead(id) {
    await api.patch(`/notifications/${id}/read`);
    fetchAll();
  }

  async function markAllRead() {
    await api.patch('/notifications/read-all');
    fetchAll();
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Alerts</h1>
          <p>{notifications.filter((n) => !n.is_read).length} unread</p>
        </div>
        <button className="btn btn-secondary" onClick={markAllRead}>
          <CheckCheck size={15} /> Mark all read
        </button>
      </div>

      <div className="card">
        {notifications.length === 0 && (
          <p style={{ padding: 20, color: 'var(--steel)', fontSize: 13 }}>No alerts yet.</p>
        )}
        {notifications.map((n) => (
          <div
            key={n.id}
            onClick={() => !n.is_read && markRead(n.id)}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '14px 20px', borderBottom: '1px solid var(--border)',
              opacity: n.is_read ? 0.55 : 1, cursor: n.is_read ? 'default' : 'pointer'
            }}
          >
            <div>
              <span className={`status-pill ${severityPill(n.severity)}`} style={{ marginRight: 10 }}>
                {n.type.replace(/_/g, ' ')}
              </span>
              <span style={{ fontSize: 13.5 }}>{n.message}</span>
            </div>
            <span className="stamp">{new Date(n.created_at).toLocaleDateString()}</span>
          </div>
        ))}
      </div>
    </>
  );
}
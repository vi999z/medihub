import { useEffect, useState } from 'react';
import api from '../api/axios';

export default function AuditLog() {
  const [logs, setLogs] = useState([]);

  useEffect(() => { api.get('/audit-logs').then((res) => setLogs(res.data)); }, []);

  return (
    <>
      <div className="page-header"><div><h1>Audit Log</h1><p>Most recent 100 system actions</p></div></div>
      <div className="card">
        <table className="data-table">
          <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Details</th></tr></thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td><span className="stamp">{new Date(l.created_at).toLocaleString()}</span></td>
                <td>{l.user_name || 'System'}</td>
                <td style={{ textTransform: 'capitalize' }}>{l.action.replace(/_/g, ' ')}</td>
                <td style={{ color: 'var(--steel)' }}>{l.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
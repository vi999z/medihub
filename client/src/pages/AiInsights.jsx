import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { RefreshCw, AlertCircle, CheckCircle2, Info, Download, ChevronDown } from 'lucide-react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

// ── AI Insights export dropdown ───────────────────────────────────────────────
function InsightsExportDropdown({ onExport }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    function onClickOutside(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const OPTIONS = [
    { label: 'Expiry risk (Excel)', key: 'risk', format: 'excel' },
    { label: 'Reorder suggestions (Excel)', key: 'reorder', format: 'excel' },
    { label: 'Anomalies (Excel)', key: 'anomalies', format: 'excel' },
    null,
    { label: 'Full AI Insights (PDF)', key: 'all', format: 'pdf' },
    { label: 'Full AI Insights (Word)', key: 'all', format: 'docx' },
  ];

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="btn btn-secondary" onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Download size={15} /> Export <ChevronDown size={13} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: 220,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 12, boxShadow: 'var(--shadow-xl)', zIndex: 50, padding: '6px 0'
        }}>
          {OPTIONS.map((opt, idx) => opt === null ? (
            <hr key={idx} style={{ margin: '4px 0', border: 'none', borderTop: '1px solid var(--border)' }} />
          ) : (
            <button
              key={idx}
              onClick={() => { onExport(opt.key, opt.format); setOpen(false); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink)', transition: 'background 0.12s ease' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-subtle)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >{opt.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function riskPill(score) {
  if (score >= 0.66) return 'critical';
  if (score >= 0.33) return 'warning';
  return 'safe';
}

function severityPill(severity) {
  if (severity === 'critical') return 'critical';
  if (severity === 'warning') return 'warning';
  return 'safe';
}

const TABS = [
  { key: 'risk', label: 'Expiry risk' },
  { key: 'reorder', label: 'Reorder suggestions' },
  { key: 'anomalies', label: 'Anomalies' },
];

function TableSkeleton({ cols }) {
  return (
    <tbody>
      {Array.from({ length: 4 }).map((_, index) => (
        <tr key={index}>
          {Array.from({ length: cols }).map((__, colIndex) => (
            <td key={colIndex}>
              <div className="skeleton" style={{ height: 13, width: colIndex === cols - 1 ? '68%' : '100%' }} />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

function TrainBanner({ trainMsg, trainStatus }) {
  if (!trainMsg) return null;

  const config = {
    success: { icon: CheckCircle2, color: 'var(--green)', bg: 'var(--green-tint)' },
    error: { icon: AlertCircle, color: 'var(--red)', bg: 'var(--red-tint)' },
    info: { icon: Info, color: 'var(--amber)', bg: 'var(--amber-tint)' },
  };
  const { icon: Icon, color, bg } = config[trainStatus] || config.info;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '12px 16px',
        marginBottom: 16,
        borderRadius: 12,
        background: bg,
        color,
        fontSize: 13,
        border: `1px solid ${color}33`,
      }}
    >
      <Icon size={16} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{trainMsg}</span>
    </div>
  );
}

export default function AiInsights() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [tab, setTab] = useState('risk');
  const [risk, setRisk] = useState([]);
  const [reorder, setReorder] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [training, setTraining] = useState(false);
  const [trainMsg, setTrainMsg] = useState('');
  const [trainStatus, setTrainStatus] = useState('info'); // 'success' | 'error' | 'info'
  const [error, setError] = useState('');
  const prefersReducedMotion = useReducedMotion();

  async function fetchAll() {
    setLoading(true);
    setError('');
    try {
      const [r, ro, a] = await Promise.all([
        api.get('/ai/expiry-risk'),
        api.get('/ai/reorder-suggestions'),
        api.get('/ai/anomalies'),
      ]);
      setRisk(r.data || []);
      setReorder(ro.data?.suggestions || ro.data || []);
      setAnomalies(a.data?.anomalies || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to load AI insights right now.');
      setRisk([]);
      setReorder([]);
      setAnomalies([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchAll(); }, []);

  async function handleTrain() {
    setTraining(true);
    setTrainMsg('');
    setTrainStatus('info');
    try {
      const res = await api.post('/ai/train');
      const data = res.data;

      if (data.trained) {
        setTrainStatus('success');
        setTrainMsg(
          `Model retrained successfully on ${data.samples} resolved batches ` +
          `(${data.expired_count} expired, ${data.depleted_count} depleted). ` +
          `Expiry risk scores now use the trained model instead of the heuristic fallback.`
        );
        // Refresh risk data so the new model's predictions are shown immediately
        try {
          const riskRes = await api.get('/ai/expiry-risk');
          setRisk(riskRes.data || []);
        } catch {
          // Risk refresh is best-effort — the banner already confirms success
        }
      } else {
        // Training was attempted but skipped — show the reason clearly
        setTrainStatus('info');
        setTrainMsg(data.reason || 'Training was skipped. The heuristic fallback is still in use.');
      }
    } catch (err) {
      setTrainStatus('error');
      const serverError = err.response?.data?.error || 'Training failed';
      const serverDetail = err.response?.data?.detail || err.message;
      setTrainMsg(`${serverError}: ${serverDetail}`);
    } finally {
      setTraining(false);
    }
  }

  async function handleExport(key, format) {
    try {
      const getSection = () => {
        if (key === 'risk') return { rows: risk.map(d => ({ medicine: d.medicine_name, batch: d.batch_number, days_left: d.days_left, qty: d.quantity_remaining, risk_pct: `${(d.risk_score * 100).toFixed(0)}%`, action: d.action })), title: 'Expiry Risk Report' };
        if (key === 'reorder') return { rows: reorder.map(r => ({ medicine: r.medicine_name, current_stock: r.current_stock, avg_daily_demand: r.avg_daily_demand, days_of_stock: r.days_of_stock_left, suggested_order: r.suggested_reorder_qty, action: r.action })), title: 'Reorder Suggestions Report' };
        if (key === 'anomalies') return { rows: anomalies.map(a => ({ medicine: a.medicine_name, batch: a.batch_number, type: a.transaction_type, qty: a.quantity, z_score: a.z_score, severity: a.severity, action: a.action })), title: 'Transaction Anomalies Report' };
        // 'all' — combine
        return {
          title: 'AI Insights Full Report',
          summary: { expiry_risk_items: risk.length, reorder_items: reorder.length, anomalies_detected: anomalies.length },
          rows: [
            ...risk.slice(0, 20).map(d => ({ section: 'Expiry Risk', medicine: d.medicine_name, batch: d.batch_number, days_left: d.days_left, risk_pct: `${(d.risk_score * 100).toFixed(0)}%`, action: d.action })),
            ...reorder.slice(0, 20).map(r => ({ section: 'Reorder', medicine: r.medicine_name, current_stock: r.current_stock, days_of_stock: r.days_of_stock_left, suggested_order: r.suggested_reorder_qty })),
            ...anomalies.slice(0, 20).map(a => ({ section: 'Anomaly', medicine: a.medicine_name, type: a.transaction_type, qty: a.quantity, severity: a.severity, action: a.action })),
          ],
          recommendations: [
            risk.length ? `${risk.length} batches flagged for expiry risk.` : 'No expiry risk items.',
            reorder.length ? `${reorder.length} medicines need reordering.` : 'All stock levels healthy.',
            anomalies.length ? `${anomalies.length} suspicious transactions detected.` : 'No anomalies found.',
          ],
        };
      };
      const reportData = getSection();
      const res = await api.post('/ai/report/export', { type: format, report: reportData }, { responseType: 'blob' });
      const ext = format === 'pdf' ? 'pdf' : format === 'docx' ? 'docx' : 'xlsx';
      const blob = new Blob([res.data], { type: res.headers['content-type'] || 'application/octet-stream' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ai_insights_${key}_${new Date().toISOString().slice(0, 10)}.${ext}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      addToast('AI Insights exported', 'success');
    } catch (err) {
      addToast('Export failed', 'error');
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
          <h1>AI Insights</h1>
          <p>Expiry risk, reorder timing, and transaction anomalies — computed from your real inventory data</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <InsightsExportDropdown onExport={handleExport} />
          {user.role === 'admin' && (
            <button className="btn btn-secondary" onClick={handleTrain} disabled={training}>
              <RefreshCw size={14} className={training ? 'spin' : ''} /> {training ? 'Training…' : 'Retrain model'}
            </button>
          )}
        </div>
      </div>

      <TrainBanner trainMsg={trainMsg} trainStatus={trainStatus} />

      <div className="card" style={{ marginBottom: 16, background: 'linear-gradient(135deg, #fefcf8 0%, #f8ebdc 100%)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>How these insights work</div>
        <p style={{ margin: '6px 0 0', color: 'var(--ink-soft)', fontSize: 13 }}>
          These recommendations are based on real stock movement, expiry dates, and recent transaction patterns. They are meant to highlight what needs attention now, why it matters, and what action to take next.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="btn"
            style={{
              background: 'none', borderRadius: 0, padding: '10px 4px', marginRight: 20,
              borderBottom: tab === t.key ? '2px solid var(--amber)' : '2px solid transparent',
              color: tab === t.key ? 'var(--ink)' : 'var(--steel)', fontWeight: 600
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'risk' && (
        <motion.div 
          className="card table-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.5, delay: prefersReducedMotion ? 0 : 0.1 }}
        >
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Medicine</th><th>Batch</th><th>Days left</th><th>Qty</th><th>Signal</th><th>Action</th></tr></thead>
              {loading ? <TableSkeleton cols={6} /> : (
                <tbody>
                    {risk.map((d) => (
                      <tr key={d.batch_id}>
                        <td style={{ fontWeight: 500 }}>{d.medicine_name}</td>
                        <td><span className="stamp">{d.batch_number}</span></td>
                        <td>{d.days_left}</td>
                        <td>{d.quantity_remaining}</td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <span className={`status-pill ${riskPill(d.risk_score)}`}>{(d.risk_score * 100).toFixed(0)}% risk</span>
                            <span style={{ fontSize: 12, color: 'var(--steel)' }}>{d.insight_label}</span>
                          </div>
                        </td>
                        <td style={{ maxWidth: 280 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <span style={{ fontSize: 12, color: 'var(--steel)' }}>{d.insight_message}</span>
                            <span className={`status-pill ${severityPill(d.insight_severity)}`} style={{ width: 'fit-content' }}>{d.action}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              )}
            </table>
          </div>
          {!loading && risk.length === 0 && !error && <p style={{ padding: 20, color: 'var(--steel)', fontSize: 13 }}>No active batches to score.</p>}
          {error && (
            <div className="empty-state" style={{ margin: 16 }}>
              <strong>Unable to load insights</strong>
              <p style={{ margin: '6px 0 0' }}>{error}</p>
              <button className="btn btn-secondary" onClick={fetchAll} style={{ marginTop: 10 }}>Retry</button>
            </div>
          )}
        </motion.div>
      )}

      {tab === 'reorder' && (
        <motion.div 
          className="card table-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.5, delay: prefersReducedMotion ? 0 : 0.1 }}
        >
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Medicine</th><th>Current stock</th><th>Avg demand/day</th><th>Days left</th><th>Signal</th><th>Suggested order</th></tr></thead>
              {loading ? <TableSkeleton cols={6} /> : (
                <tbody>
                    {reorder.map((r) => (
                      <tr key={r.medicine_id}>
                        <td style={{ fontWeight: 500 }}>{r.medicine_name}</td>
                        <td>{r.current_stock}</td>
                        <td>{r.avg_daily_demand}</td>
                        <td><span className={`status-pill ${r.days_of_stock_left <= 7 ? 'critical' : 'warning'}`}>{r.days_of_stock_left}d</span></td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <span className={`status-pill ${severityPill(r.insight_severity)}`}>{r.insight_label}</span>
                            <span style={{ fontSize: 12, color: 'var(--steel)' }}>{r.insight_message}</span>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <span className="stamp">{r.suggested_reorder_qty} units</span>
                            <span style={{ fontSize: 12, color: 'var(--steel)' }}>{r.action}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              )}
            </table>
          </div>
          {!loading && reorder.length === 0 && !error && <p style={{ padding: 20, color: 'var(--steel)', fontSize: 13 }}>No medicines need reordering soon.</p>}
          {error && (
            <div className="empty-state" style={{ margin: 16 }}>
              <strong>Unable to load insights</strong>
              <p style={{ margin: '6px 0 0' }}>{error}</p>
              <button className="btn btn-secondary" onClick={fetchAll} style={{ marginTop: 10 }}>Retry</button>
            </div>
          )}
        </motion.div>
      )}

      {tab === 'anomalies' && (
        <motion.div 
          className="card table-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.5, delay: prefersReducedMotion ? 0 : 0.1 }}
        >
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Medicine</th><th>Batch</th><th>Type</th><th>Qty</th><th>Signal</th><th>Action</th></tr></thead>
              {loading ? <TableSkeleton cols={6} /> : (
                <tbody>
                    {anomalies.map((a) => (
                      <tr key={a.transaction_id}>
                        <td style={{ fontWeight: 500 }}>{a.medicine_name}</td>
                        <td><span className="stamp">{a.batch_number}</span></td>
                        <td style={{ textTransform: 'capitalize' }}>{a.transaction_type}</td>
                        <td>{a.quantity}</td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <span className={`status-pill ${severityPill(a.severity)}`}>{a.insight_label}</span>
                            <span style={{ fontSize: 12, color: 'var(--steel)' }}>Z-score {a.z_score}σ vs typical {a.typical_magnitude}</span>
                          </div>
                        </td>
                        <td style={{ maxWidth: 280 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <span style={{ fontSize: 12, color: 'var(--steel)' }}>{a.insight_message}</span>
                            <span className={`status-pill ${severityPill(a.severity)}`} style={{ width: 'fit-content' }}>{a.action}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              )}
            </table>
          </div>
          {!loading && anomalies.length === 0 && !error && <p style={{ padding: 20, color: 'var(--steel)', fontSize: 13 }}>No anomalies detected in the last 30 days.</p>}
          {error && (
            <div className="empty-state" style={{ margin: 16 }}>
              <strong>Unable to load insights</strong>
              <p style={{ margin: '6px 0 0' }}>{error}</p>
              <button className="btn btn-secondary" onClick={fetchAll} style={{ marginTop: 10 }}>Retry</button>
            </div>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
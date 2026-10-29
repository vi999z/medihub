import { useEffect, useState } from 'react';
import { RefreshCw, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { downloadBlob } from '../../utils/downloadFile';
import TableSkeleton from '../../components/TableSkeleton';
import ExportDropdown from '../../components/ExportDropdown';

const EXPORT_OPTIONS = [
  { label: 'Expiry risk (Excel)', key: 'risk', format: 'excel' },
  { label: 'Reorder suggestions (Excel)', key: 'reorder', format: 'excel' },
  { label: 'Anomalies (Excel)', key: 'anomalies', format: 'excel' },
  null,
  { label: 'Full AI Insights (PDF)', key: 'all', format: 'pdf' },
  { label: 'Full AI Insights (Word)', key: 'all', format: 'docx' },
];

// Severity → flat-status-label colour, matching the Dashboard's table.
function riskPill(score) {
  if (score >= 0.66) return 'red';
  if (score >= 0.33) return 'amber';
  return 'green';
}

function severityPill(severity) {
  if (severity === 'critical') return 'red';
  if (severity === 'warning') return 'amber';
  return 'green';
}

const TABS = [
  { key: 'risk', label: 'Expiry risk' },
  { key: 'forecast', label: 'Demand forecast' },
  { key: 'reorder', label: 'Reorder suggestions' },
  { key: 'anomalies', label: 'Anomalies' },
];

const TREND_LABEL = { rising: 'Rising', falling: 'Falling', stable: 'Steady' };
const TREND_CLS = { rising: 'orange', falling: 'green', stable: 'green' };

// Tiny bar chart of the day-by-day forecast.
function ForecastBars({ values }) {
  const max = Math.max(1, ...values);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 28 }} aria-hidden="true">
      {values.map((v, i) => (
        <div key={i} style={{ width: 6, height: `${Math.max(2, (v / max) * 28)}px`, background: 'var(--flat-accent)', opacity: 0.75, borderRadius: 1 }} />
      ))}
    </div>
  );
}

function TrainBanner({ trainMsg, trainStatus }) {
  if (!trainMsg) return null;

  const config = {
    success: { icon: CheckCircle2, color: 'var(--flat-green)' },
    error: { icon: AlertCircle, color: 'var(--flat-red)' },
    info: { icon: Info, color: 'var(--flat-accent)' },
  };
  const { icon: Icon, color } = config[trainStatus] || config.info;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '12px 16px',
        borderRadius: 8,
        background: `color-mix(in srgb, ${color} 10%, white)`,
        color,
        fontSize: 13,
        border: `1px solid color-mix(in srgb, ${color} 40%, white)`,
      }}
    >
      <Icon size={16} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{trainMsg}</span>
    </div>
  );
}

export default function InsightsTab({ onBadgeChange }) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [tab, setTab] = useState('risk');
  const [risk, setRisk] = useState([]);
  const [reorder, setReorder] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [forecasts, setForecasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [training, setTraining] = useState(false);
  const [trainMsg, setTrainMsg] = useState('');
  const [trainStatus, setTrainStatus] = useState('info'); // 'success' | 'error' | 'info'
  const [error, setError] = useState('');

  async function fetchAll() {
    setLoading(true);
    setError('');
    try {
      const [r, ro, a, f] = await Promise.all([
        api.get('/ai/expiry-risk'),
        api.get('/ai/reorder-suggestions'),
        api.get('/ai/anomalies'),
        api.get('/ai/demand-forecast?days=14'),
      ]);
      setRisk(r.data || []);
      setReorder(ro.data?.suggestions || ro.data || []);
      setAnomalies(a.data?.anomalies || []);
      setForecasts(f.data?.forecasts || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to load AI insights right now.');
      setRisk([]);
      setReorder([]);
      setAnomalies([]);
      setForecasts([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchAll(); }, []);

  // Surface a "needs attention" count on the shared tab widget, so switching
  // tabs isn't the only way to see something here needs a look.
  useEffect(() => {
    const criticalRisk = risk.filter((d) => d.risk_score >= 0.66).length;
    const urgentReorder = reorder.filter((r) => r.days_of_stock_left <= 7).length;
    const criticalAnomalies = anomalies.filter((a) => a.severity === 'critical').length;
    onBadgeChange?.(criticalRisk + urgentReorder + criticalAnomalies);
  }, [risk, reorder, anomalies, onBadgeChange]);

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
      downloadBlob(blob, `ai_insights_${key}_${new Date().toISOString().slice(0, 10)}.${ext}`);
      addToast('AI Insights exported', 'success');
    } catch (err) {
      addToast('Export failed', 'error');
    }
  }

  return (
    <div className="flat-stack">
      <div className="page-actions-only">
        <div className="page-header-actions">
          <ExportDropdown options={EXPORT_OPTIONS} onSelect={({ key, format }) => handleExport(key, format)} />
          {user.role === 'admin' && (
            <button type="button" className="flat-action-btn" onClick={handleTrain} disabled={training}>
              <RefreshCw size={14} className={training ? 'spin' : ''} /> {training ? 'Training…' : 'Retrain model'}
            </button>
          )}
        </div>
      </div>

      <TrainBanner trainMsg={trainMsg} trainStatus={trainStatus} />

      <div className="flat-card flat-info-card">
        <div className="flat-info-card__title">How these insights work</div>
        <p>
          These recommendations are based on real stock movement, expiry dates, and recent transaction patterns. They are meant to highlight what needs attention now, why it matters, and what action to take next.
        </p>
      </div>

      <div className="ai-assistant-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`ai-assistant-tab${tab === t.key ? ' active' : ''}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'risk' && (
        <div className="flat-card flat-attention-card">
          <div className="flat-table-header">
            <span className="flat-table-title">Expiry risk</span>
            {!loading && !error && <span className="flat-med-meta">{risk.length} item{risk.length !== 1 ? 's' : ''}</span>}
          </div>
          <div className="flat-attention-scroll">
            <table className="flat-table">
              <thead><tr><th>Medicine</th><th>Batch</th><th>Days left</th><th>Qty</th><th>Signal</th><th>Action</th></tr></thead>
              {loading ? <TableSkeleton cols={6} /> : (
                <tbody>
                  {error && (
                    <tr><td colSpan={6} className="flat-empty">
                      Unable to load insights — {error}
                      <div style={{ marginTop: 10 }}>
                        <button type="button" className="flat-action-btn" onClick={fetchAll}>Retry</button>
                      </div>
                    </td></tr>
                  )}
                  {!error && risk.length === 0 && (
                    <tr><td colSpan={6} className="flat-empty">No active batches to score.</td></tr>
                  )}
                    {risk.map((d) => (
                      <tr key={d.batch_id}>
                        <td style={{ fontWeight: 500 }}>{d.medicine_name}</td>
                        <td><span className="stamp">{d.batch_number}</span></td>
                        <td>{d.days_left}</td>
                        <td>{d.quantity_remaining}</td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <span className={`flat-status-label ${riskPill(d.risk_score)}`}>{(d.risk_score * 100).toFixed(0)}% risk</span>
                            <span style={{ fontSize: 12, color: 'var(--steel)' }}>{d.insight_label}</span>
                          </div>
                        </td>
                        <td style={{ maxWidth: 280 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <span style={{ fontSize: 12, color: 'var(--steel)' }}>{d.insight_message}</span>
                            <span className={`flat-status-label ${severityPill(d.insight_severity)}`} style={{ width: 'fit-content' }}>{d.action}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              )}
            </table>
          </div>
        </div>
      )}

      {tab === 'forecast' && (
        <div className="flat-card flat-attention-card">
          <div className="flat-table-header">
            <span className="flat-table-title">Demand forecast — next 14 days</span>
            {!loading && !error && <span className="flat-med-meta">{forecasts.length} item{forecasts.length !== 1 ? 's' : ''}</span>}
          </div>
          <div className="flat-attention-scroll">
            <table className="flat-table">
              <thead><tr><th>Medicine</th><th>Avg demand/day</th><th>Projected (14 days)</th><th>Trend</th><th>In stock</th><th>Daily forecast</th></tr></thead>
              {loading ? <TableSkeleton cols={6} /> : (
                <tbody>
                  {error && (
                    <tr><td colSpan={6} className="flat-empty">
                      Unable to load insights — {error}
                      <div style={{ marginTop: 10 }}>
                        <button type="button" className="flat-action-btn" onClick={fetchAll}>Retry</button>
                      </div>
                    </td></tr>
                  )}
                  {!error && forecasts.length === 0 && (
                    <tr><td colSpan={6} className="flat-empty">No sales history yet — record some sales to see projected demand.</td></tr>
                  )}
                  {forecasts.map((f) => (
                    <tr key={f.medicine_id}>
                      <td style={{ fontWeight: 500 }}>{f.medicine_name}</td>
                      <td>{f.avg_daily_demand} {f.unit}</td>
                      <td><strong>{f.projected_demand} {f.unit}</strong></td>
                      <td><span className={`flat-status-label ${TREND_CLS[f.trend] || 'green'}`}>{TREND_LABEL[f.trend] || f.trend}</span></td>
                      <td>
                        {f.current_stock}
                        {f.days_of_stock_left != null && <div className="flat-med-meta">~{f.days_of_stock_left} days of stock</div>}
                      </td>
                      <td><ForecastBars values={f.forecast || []} /></td>
                    </tr>
                  ))}
                </tbody>
              )}
            </table>
          </div>
        </div>
      )}

      {tab === 'reorder' && (
        <div className="flat-card flat-attention-card">
          <div className="flat-table-header">
            <span className="flat-table-title">Reorder suggestions</span>
            {!loading && !error && <span className="flat-med-meta">{reorder.length} item{reorder.length !== 1 ? 's' : ''}</span>}
          </div>
          <div className="flat-attention-scroll">
            <table className="flat-table">
              <thead><tr><th>Medicine</th><th>Current stock</th><th>Avg demand/day</th><th>Days left</th><th>Signal</th><th>Suggested order</th></tr></thead>
              {loading ? <TableSkeleton cols={6} /> : (
                <tbody>
                  {error && (
                    <tr><td colSpan={6} className="flat-empty">
                      Unable to load insights — {error}
                      <div style={{ marginTop: 10 }}>
                        <button type="button" className="flat-action-btn" onClick={fetchAll}>Retry</button>
                      </div>
                    </td></tr>
                  )}
                  {!error && reorder.length === 0 && (
                    <tr><td colSpan={6} className="flat-empty">No medicines need reordering soon.</td></tr>
                  )}
                    {reorder.map((r) => (
                      <tr key={r.medicine_id}>
                        <td style={{ fontWeight: 500 }}>{r.medicine_name}</td>
                        <td>{r.current_stock}</td>
                        <td>{r.avg_daily_demand}</td>
                        <td><span className={`flat-status-label ${r.days_of_stock_left <= 7 ? 'red' : 'amber'}`}>{r.days_of_stock_left}d</span></td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <span className={`flat-status-label ${severityPill(r.insight_severity)}`}>{r.insight_label}</span>
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
        </div>
      )}

      {tab === 'anomalies' && (
        <div className="flat-card flat-attention-card">
          <div className="flat-table-header">
            <span className="flat-table-title">Anomalies</span>
            {!loading && !error && <span className="flat-med-meta">{anomalies.length} item{anomalies.length !== 1 ? 's' : ''}</span>}
          </div>
          <div className="flat-attention-scroll">
            <table className="flat-table">
              <thead><tr><th>Medicine</th><th>Batch</th><th>Type</th><th>Qty</th><th>Signal</th><th>Action</th></tr></thead>
              {loading ? <TableSkeleton cols={6} /> : (
                <tbody>
                  {error && (
                    <tr><td colSpan={6} className="flat-empty">
                      Unable to load insights — {error}
                      <div style={{ marginTop: 10 }}>
                        <button type="button" className="flat-action-btn" onClick={fetchAll}>Retry</button>
                      </div>
                    </td></tr>
                  )}
                  {!error && anomalies.length === 0 && (
                    <tr><td colSpan={6} className="flat-empty">No anomalies detected in the last 30 days.</td></tr>
                  )}
                    {anomalies.map((a) => (
                      <tr key={a.transaction_id}>
                        <td style={{ fontWeight: 500 }}>{a.medicine_name}</td>
                        <td><span className="stamp">{a.batch_number}</span></td>
                        <td style={{ textTransform: 'capitalize' }}>{a.transaction_type}</td>
                        <td>{a.quantity}</td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <span className={`flat-status-label ${severityPill(a.severity)}`}>{a.insight_label}</span>
                            <span style={{ fontSize: 12, color: 'var(--steel)' }}>Z-score {a.z_score}σ vs typical {a.typical_magnitude}</span>
                          </div>
                        </td>
                        <td style={{ maxWidth: 280 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <span style={{ fontSize: 12, color: 'var(--steel)' }}>{a.insight_message}</span>
                            <span className={`flat-status-label ${severityPill(a.severity)}`} style={{ width: 'fit-content' }}>{a.action}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

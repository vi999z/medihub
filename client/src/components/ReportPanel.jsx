import { useState } from 'react';
import { Download } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { useBranchFilter } from '../context/BranchContext';
import useBranches from '../hooks/useBranches';
import { errorMessage } from '../utils/errors';
import { localDateKey } from '../utils/date';
import {
  REPORT_GROUPS, REPORTS, FORMATS, BATCH_STATUSES, PERIODS, checkReportChoices, downloadReport,
} from '../utils/reportExport';

// The whole export screen in one small form: what, for which branch, for which
// dates (only when it matters), in which format, then Download. Filters that
// don't apply to the chosen report are not shown.
export default function ReportPanel({ defaultReport = 'sales', onDone, extraAction }) {
  const { addToast } = useToast();
  const { branch: sharedBranch } = useBranchFilter();
  const { names: branchNames } = useBranches();

  const [reportKey, setReportKey] = useState(defaultReport);
  const [branch, setBranch] = useState(sharedBranch);
  const [period, setPeriod] = useState('30d');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState('active');
  const [format, setFormat] = useState('excel');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  const report = REPORTS.find((r) => r.key === reportKey) || REPORTS[0];
  const today = localDateKey();

  async function handleDownload() {
    if (busy) return;
    const message = checkReportChoices(report, { period, from, to });
    setProblem(message);
    if (message) return;
    setBusy(true);
    try {
      await downloadReport({ report: report.key, format, branch, period, from, to, status });
      addToast('Report downloaded', 'success');
      onDone?.();
    } catch (err) {
      setProblem(errorMessage(err, 'The report could not be created. Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="report-panel">
      <div className="field">
        <label htmlFor="report-type">Report</label>
        <select id="report-type" value={reportKey} onChange={(e) => { setReportKey(e.target.value); setProblem(''); }}>
          {REPORT_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.reports.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </optgroup>
          ))}
        </select>
        <span className="flat-med-meta">{report.hint}</span>
      </div>

      {report.branch && (
        <div className="field">
          <label htmlFor="report-branch">Branch</label>
          <select id="report-branch" value={branch} onChange={(e) => setBranch(e.target.value)}>
            <option value="all">All branches</option>
            {branchNames.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>
      )}

      {report.status && (
        <div className="field">
          <label htmlFor="report-status">Batch status</label>
          <select id="report-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            {BATCH_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      )}

      {report.period && (
        <div className="field">
          <label htmlFor="report-period">Period</label>
          <select id="report-period" value={period} onChange={(e) => { setPeriod(e.target.value); setProblem(''); }}>
            {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          {period === 'custom' && (
            <div className="report-panel__dates">
              <input type="date" value={from} max={today} onChange={(e) => setFrom(e.target.value)} aria-label="Start date" />
              <span>to</span>
              <input type="date" value={to} max={today} onChange={(e) => setTo(e.target.value)} aria-label="End date" />
            </div>
          )}
        </div>
      )}

      <div className="field">
        <span className="report-panel__label" id="report-format-label">Format</span>
        <div className="report-panel__formats" role="radiogroup" aria-labelledby="report-format-label">
          {FORMATS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="radio"
              aria-checked={format === f.value}
              className={`chip${format === f.value ? ' active' : ''}`}
              onClick={() => setFormat(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {problem && <p className="error-text" role="alert" style={{ margin: 0 }}>{problem}</p>}

      <div className="report-panel__actions">
        {extraAction}
        <button type="button" className="flat-btn-primary" onClick={handleDownload} disabled={busy}>
          <Download size={15} /> {busy ? 'Preparing…' : 'Download'}
        </button>
      </div>
    </div>
  );
}

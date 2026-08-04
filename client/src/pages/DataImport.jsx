import { useRef, useState } from 'react';
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2,
  ArrowLeft, Table2, FileCheck2, Database, RefreshCw
} from 'lucide-react';
import { readFileAsText, IMPORT_SCHEMAS, detectColumnMapping } from '../utils/csvUtils';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';

const STEPS = [
  { key: 'upload', label: 'Upload' },
  { key: 'map', label: 'Map columns' },
  { key: 'preview', label: 'Preview' },
  { key: 'result', label: 'Result' }
];

/**
 * Filter import types by user role (mirrors server-side role checks).
 * Admin: all types. Pharmacist: batches + transactions.
 */
function getAllowedTypes(user) {
  if (user?.role === 'admin') return Object.keys(IMPORT_SCHEMAS);
  if (user?.role === 'pharmacist') return ['batches', 'transactions'];
  return [];
}

export default function DataImport() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const fileInputRef = useRef(null);

  const availableTypes = getAllowedTypes(user);
  const [selectedType, setSelectedType] = useState(availableTypes[0] || 'medicines');
  const schema = IMPORT_SCHEMAS[selectedType] || IMPORT_SCHEMAS.medicines;

  const [step, setStep] = useState('upload');
  const [fileName, setFileName] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({});
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  function reset() {
    setStep('upload');
    setFileName('');
    setFileContent('');
    setHeaders([]);
    setMapping({});
    setAnalysis(null);
    setError('');
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleTypeChange(type) {
    setSelectedType(type);
    reset();
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setResult(null);
    setFileName(file.name);
    try {
      const text = await readFileAsText(file);
      setFileContent(text);
      // Parse headers client-side for column mapping
      const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
      if (lines.length < 2) {
        setError('CSV must contain a header row and at least one data row');
        setFileName('');
        setFileContent('');
        return;
      }
      const parsedHeaders = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
      setHeaders(parsedHeaders);
      setMapping(detectColumnMapping(parsedHeaders, schema));
      setStep('map');
    } catch (err) {
      setError(err.message || 'Failed to read file');
      setFileName('');
      setFileContent('');
    }
  }

  function handleDownloadTemplate() {
    const blob = new Blob([schema.example], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selectedType}-template.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleAnalyze() {
    if (!fileContent) {
      setError('Please select a CSV file first.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/import/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('medihub_token')}`
        },
        body: JSON.stringify({ type: selectedType, csv: fileContent })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Analysis failed');
      }
      setAnalysis(data);
      setStep('preview');
    } catch (err) {
      setError(err.message || 'Analysis failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!fileContent) {
      setError('Please select a CSV file first.');
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/import/${selectedType}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('medihub_token')}`
        },
        body: JSON.stringify({ csv: fileContent })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Import failed');
      }
      setResult(data);
      setStep('result');
      addToast(`Imported ${data.imported} of ${data.total} ${schema.label.toLowerCase()}`, data.skipped > 0 ? 'info' : 'success');
      // Invalidate caches so all pages reflect the new data
      api.invalidateCache('/reports/summary');
      api.invalidateCache('/reports/expiring-soon');
      api.invalidateCache('/reports/low-stock');
      api.invalidateCache('/reports/sales-trend?days=30');
      api.invalidateCache('/medicines');
      api.invalidateCache('/batches');
      api.invalidateCache('/suppliers');
      api.invalidateCache('/transactions/recent');
    } catch (err) {
      setError(err.message || 'Import failed');
    } finally {
      setLoading(false);
    }
  }

  function updateMapping(fieldKey, csvHeader) {
    setMapping((prev) => {
      const next = { ...prev };
      if (csvHeader) {
        next[fieldKey] = csvHeader;
      } else {
        delete next[fieldKey];
      }
      return next;
    });
  }

  const mappedCount = Object.keys(mapping).length;
  const missingRequired = (schema.required || []).filter((f) => !mapping[f]);
  const stepIndex = STEPS.findIndex((s) => s.key === step);

  if (availableTypes.length === 0) {
    return (
      <div className="page-shell">
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <Database size={32} color="var(--steel)" style={{ marginBottom: 12 }} />
          <h3>No import access</h3>
          <p style={{ color: 'var(--steel)', fontSize: 13.5, margin: 0 }}>
            Your role does not have permission to import data.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1>Data Import</h1>
          <p>Bulk-import medicines, batches, transactions, and suppliers from CSV.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn btn-secondary" onClick={handleDownloadTemplate}>
            <FileSpreadsheet size={15} /> Download template
          </button>
          <button type="button" className="btn btn-primary" onClick={reset}>
            <RefreshCw size={15} /> Start over
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 24 }}>
        {/* Import type selector */}
        <div className="field">
          <label>What are you importing?</label>
          <select value={selectedType} onChange={(e) => handleTypeChange(e.target.value)}>
            {availableTypes.map((t) => (
              <option key={t} value={t}>{IMPORT_SCHEMAS[t]?.label || t}</option>
            ))}
          </select>
          <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 4 }}>
            {schema.description}
          </div>
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4, marginTop: 16 }}>
          {STEPS.map((s, i) => (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
              <div
                style={{
                  flex: 1,
                  height: 3,
                  borderRadius: 2,
                  background: i <= stepIndex ? 'var(--green)' : 'var(--border)',
                  transition: 'background 0.3s'
                }}
              />
              {i < STEPS.length - 1 && <div style={{ width: 4 }} />}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--steel)', fontWeight: 600, marginBottom: 20 }}>
          {STEPS.map((s, i) => (
            <span key={s.key} style={{ color: i <= stepIndex ? 'var(--green-deep)' : 'var(--steel)' }}>{s.label}</span>
          ))}
        </div>

        {/* STEP 1: Upload */}
        {step === 'upload' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: 'var(--steel)' }}>
                Required columns: <strong>{schema.required.join(', ')}</strong>
              </div>
            </div>

            <div
              className="csv-dropzone"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) {
                  const input = fileInputRef.current;
                  if (input) {
                    const dt = new DataTransfer();
                    dt.items.add(file);
                    input.files = dt.files;
                    handleFileChange({ target: { files: dt.files } });
                  }
                }
              }}
              style={{
                border: '2px dashed var(--border-strong)',
                borderRadius: 12,
                padding: '40px 20px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'border-color 0.2s, background 0.2s',
                background: fileName ? 'var(--green-tint)' : 'var(--surface-strong)'
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              {fileName ? (
                <>
                  <CheckCircle2 size={32} color="var(--green)" style={{ marginBottom: 8 }} />
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{fileName}</div>
                  <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 4 }}>Click to choose a different file</div>
                </>
              ) : (
                <>
                  <Upload size={32} color="var(--amber)" style={{ marginBottom: 8 }} />
                  <div style={{ fontWeight: 600, fontSize: 15 }}>Click to select or drag & drop a CSV file</div>
                  <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 4 }}>.csv files only</div>
                </>
              )}
            </div>
          </>
        )}

        {/* STEP 2: Column mapping */}
        {step === 'map' && (
          <>
            <div style={{ fontSize: 13, color: 'var(--steel)', marginBottom: 12 }}>
              Map your CSV columns to the {schema.label.toLowerCase()} fields. Auto-detected where possible.
            </div>

            {missingRequired.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--red-deep)', fontSize: 13, background: 'var(--red-tint)', padding: '10px 14px', borderRadius: 10, marginBottom: 12 }}>
                <AlertCircle size={16} /> Missing required columns: <strong>{missingRequired.join(', ')}</strong>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto', paddingRight: 4 }}>
              {Object.entries(schema.fields).map(([fieldKey, fieldDef]) => (
                <div key={fieldKey} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {fieldDef.label}
                    {fieldDef.required && <span style={{ color: 'var(--red)', marginLeft: 4 }}>*</span>}
                  </div>
                  <select
                    value={mapping[fieldKey] || ''}
                    onChange={(e) => updateMapping(fieldKey, e.target.value)}
                    style={{ fontSize: 13 }}
                  >
                    <option value="">— Not mapped —</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 10 }}>
              {mappedCount} of {Object.keys(schema.fields).length} columns mapped
            </div>
          </>
        )}

        {/* STEP 3: Preview & analysis */}
        {step === 'preview' && analysis && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 12 }}>
              <div style={{ background: 'var(--green-tint)', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green-deep)' }}>{analysis.valid}</div>
                <div style={{ fontSize: 11.5, color: 'var(--green-deep)', fontWeight: 600 }}>Valid rows</div>
              </div>
              <div style={{ background: 'var(--gold-tint)', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--gold-deep)' }}>{analysis.invalid}</div>
                <div style={{ fontSize: 11.5, color: 'var(--gold-deep)', fontWeight: 600 }}>Invalid rows</div>
              </div>
              <div style={{ background: 'var(--bg-subtle)', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{analysis.total}</div>
                <div style={{ fontSize: 11.5, color: 'var(--steel)', fontWeight: 600 }}>Total rows</div>
              </div>
            </div>

            {analysis.missingRequired?.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--red-deep)', fontSize: 13, background: 'var(--red-tint)', padding: '10px 14px', borderRadius: 10, marginBottom: 12 }}>
                <AlertCircle size={16} /> Missing required columns: <strong>{analysis.missingRequired.join(', ')}</strong>
              </div>
            )}

            {analysis.unknownColumns?.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--amber)', fontSize: 13, background: 'var(--amber-tint)', padding: '10px 14px', borderRadius: 10, marginBottom: 12 }}>
                <AlertCircle size={16} /> Unrecognized columns: <strong>{analysis.unknownColumns.join(', ')}</strong>
              </div>
            )}

            <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
              <table style={{ width: '100%', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-subtle)' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left', position: 'sticky', top: 0 }}>Line</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', position: 'sticky', top: 0 }}>Status</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', position: 'sticky', top: 0 }}>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.rows.slice(0, 50).map((row) => (
                    <tr key={row.line} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)', color: 'var(--steel)' }}>L{row.line}</td>
                      <td style={{ padding: '6px 10px' }}>
                        {row.valid
                          ? <span className="status-pill safe">Valid</span>
                          : <span className="status-pill critical">Error</span>}
                      </td>
                      <td style={{ padding: '6px 10px', color: row.valid ? 'var(--ink-soft)' : 'var(--red-deep)' }}>
                        {row.valid
                          ? Object.entries(row.data).filter(([, v]) => v !== null && v !== '').map(([k, v]) => `${k}: ${v}`).join(' · ').slice(0, 80)
                          : row.errors.join('; ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {analysis.rows.length > 50 && (
                <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--steel)', textAlign: 'center', borderTop: '1px solid var(--border)' }}>
                  Showing first 50 of {analysis.rows.length} rows
                </div>
              )}
            </div>
          </>
        )}

        {/* STEP 4: Result */}
        {step === 'result' && result && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 12 }}>
              <div style={{ background: 'var(--green-tint)', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green-deep)' }}>{result.imported}</div>
                <div style={{ fontSize: 11.5, color: 'var(--green-deep)', fontWeight: 600 }}>Imported</div>
              </div>
              <div style={{ background: 'var(--gold-tint)', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--gold-deep)' }}>{result.skipped}</div>
                <div style={{ fontSize: 11.5, color: 'var(--gold-deep)', fontWeight: 600 }}>Skipped</div>
              </div>
              <div style={{ background: 'var(--bg-subtle)', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{result.total}</div>
                <div style={{ fontSize: 11.5, color: 'var(--steel)', fontWeight: 600 }}>Total rows</div>
              </div>
            </div>

            {result.errors?.length > 0 && (
              <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
                <div style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--red-deep)', background: 'var(--red-tint)', borderBottom: '1px solid var(--border)' }}>
                  {result.errors.length} error{result.errors.length !== 1 ? 's' : ''} — rows not imported
                </div>
                {result.errors.map((err, idx) => (
                  <div key={idx} style={{ padding: '8px 14px', fontSize: 12.5, borderBottom: '1px solid var(--border)', display: 'flex', gap: 8 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--steel)', flexShrink: 0 }}>L{err.line}</span>
                    <span style={{ fontWeight: 600, flexShrink: 0 }}>{err.row}</span>
                    <span style={{ color: 'var(--red-deep)' }}>{err.error}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--red-deep)', fontSize: 13, background: 'var(--red-tint)', padding: '10px 14px', borderRadius: 10, marginTop: 12 }}>
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 20 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {stepIndex > 0 && step !== 'result' && (
              <button type="button" className="btn btn-secondary" onClick={() => setStep(STEPS[stepIndex - 1].key)}>
                <ArrowLeft size={14} /> Back
              </button>
            )}
            {step === 'map' && (
              <button type="button" className="btn btn-secondary" onClick={() => setStep('upload')}>
                <ArrowLeft size={14} /> Change file
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {step === 'upload' && (
              <button type="button" className="btn btn-primary" onClick={() => fileInputRef.current?.click()} disabled={loading}>
                <Upload size={15} /> Select CSV
              </button>
            )}
            {step === 'map' && (
              <button type="button" className="btn btn-primary" onClick={handleAnalyze} disabled={loading || missingRequired.length > 0}>
                {loading ? <Loader2 size={15} className="spin" /> : <Table2 size={15} />}
                {loading ? 'Analyzing…' : 'Analyze & preview'}
              </button>
            )}
            {step === 'preview' && (
              <button type="button" className="btn btn-primary" onClick={handleImport} disabled={loading || (analysis && analysis.valid === 0)}>
                {loading ? <Loader2 size={15} className="spin" /> : <FileCheck2 size={15} />}
                {loading ? 'Importing…' : `Import ${analysis?.valid || 0} rows`}
              </button>
            )}
            {step === 'result' && (
              <button type="button" className="btn btn-primary" onClick={reset}>
                <CheckCircle2 size={15} /> Import another file
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
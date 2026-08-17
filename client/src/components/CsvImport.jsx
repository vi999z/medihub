import { useState, useRef } from 'react';
import { Upload, X, Check, AlertTriangle, Download, FileText } from 'lucide-react';
import api from '../api/axios';

export default function CsvImport({ onClose, onImportComplete, entityType = 'medicines' }) {
  const [step, setStep] = useState('upload'); // upload, preview, complete
  const [file, setFile] = useState(null);
  const [validationResult, setValidationResult] = useState(null);
  const [importing, setImporting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef(null);

  const entityLabels = {
    medicines: 'Medicine',
    batches: 'Batch',
    suppliers: 'Supplier'
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (selectedFile) => {
    if (!selectedFile.name.endsWith('.csv')) {
      alert('Please select a CSV file');
      return;
    }
    setFile(selectedFile);
    validateFile(selectedFile);
  };

  const validateFile = async (selectedFile) => {
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await api.post(`/${entityType}/csv/validate`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setValidationResult(res.data);
      setStep('preview');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to validate CSV file');
      setFile(null);
    }
  };

  const handleCommit = async () => {
    setImporting(true);
    try {
      const res = await api.post(`/${entityType}/csv/commit`, {
        results: validationResult.results
      });
      setStep('complete');
      if (onImportComplete) {
        onImportComplete(res.data);
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to import data');
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const res = await api.get(`/${entityType}/csv/template`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${entityType}_template.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Failed to download template');
    }
  };

  const validRows = validationResult?.results?.filter(r => r.valid) || [];
  const invalidRows = validationResult?.results?.filter(r => !r.valid) || [];

  if (step === 'complete') {
    return (
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Check size={20} style={{ color: 'var(--success)' }} />
            Import Complete
          </h3>
          <button className="btn-icon" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
          <p style={{ fontSize: 16, marginBottom: 8 }}>
            <strong>{validationResult?.validRows || 0}</strong> {entityLabels[entityType]}(s) imported successfully
          </p>
          {invalidRows.length > 0 && (
            <p style={{ color: 'var(--danger)', fontSize: 14 }}>
              {invalidRows.length} row(s) skipped due to errors
            </p>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 20 }}>
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ margin: 0 }}>Import {entityLabels[entityType]}s from CSV</h3>
        <button className="btn-icon" onClick={onClose} title="Close">
          <X size={18} />
        </button>
      </div>

      {step === 'upload' && (
        <>
          <div style={{ marginBottom: 16 }}>
            <button 
              className="btn btn-secondary" 
              onClick={handleDownloadTemplate}
              style={{ fontSize: 13 }}
            >
              <Download size={14} style={{ marginRight: 6 }} />
              Download CSV Template
            </button>
          </div>

          <div
            className={`drop-zone ${dragActive ? 'active' : ''}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            style={{
              border: '2px dashed var(--border)',
              borderRadius: 8,
              padding: '40px 20px',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s',
              backgroundColor: dragActive ? 'var(--bg-hover)' : 'transparent'
            }}
            onClick={() => inputRef.current?.click()}
          >
            <Upload size={32} style={{ color: 'var(--steel)', marginBottom: 12 }} />
            <p style={{ margin: '0 0 8px 0', fontWeight: 500 }}>
              Drag and drop your CSV file here
            </p>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--steel)' }}>
              or click to browse
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".csv"
              onChange={handleChange}
              style={{ display: 'none' }}
            />
          </div>

          {file && (
            <div style={{ marginTop: 16, padding: 12, backgroundColor: 'var(--bg-subtle)', borderRadius: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileText size={16} style={{ color: 'var(--steel)' }} />
                <span style={{ flex: 1, fontSize: 14 }}>{file.name}</span>
                <button
                  className="btn-icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                  }}
                  title="Remove file"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {step === 'preview' && validationResult && (
        <>
          <div style={{ marginBottom: 16, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div className="stat-card accent-green" style={{ padding: 12, minWidth: 120 }}>
              <div className="value">{validationResult.validRows}</div>
              <div className="label">Valid rows</div>
            </div>
            <div className="stat-card accent-red" style={{ padding: 12, minWidth: 120 }}>
              <div className="value">{validationResult.invalidRows}</div>
              <div className="label">Invalid rows</div>
            </div>
            <div className="stat-card" style={{ padding: 12, minWidth: 120 }}>
              <div className="value">{validationResult.totalRows}</div>
              <div className="label">Total rows</div>
            </div>
          </div>

          {invalidRows.length > 0 && (
            <div style={{ marginBottom: 16, padding: 12, backgroundColor: 'var(--bg-error)', borderRadius: 6, border: '1px solid var(--error)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <AlertTriangle size={16} style={{ color: 'var(--error)' }} />
                <strong style={{ color: 'var(--error)' }}>Errors found</strong>
              </div>
              <p style={{ margin: 0, fontSize: 13 }}>
                {invalidRows.length} row(s) have errors and will not be imported. Review the details below.
              </p>
            </div>
          )}

          <div className="table-scroll" style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6, marginBottom: 16 }}>
            <table className="data-table" style={{ fontSize: 13 }}>
              <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--bg)' }}>
                <tr>
                  <th style={{ width: 60 }}>Row</th>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Errors</th>
                </tr>
              </thead>
              <tbody>
                {validationResult.results.map((row, idx) => (
                  <tr key={idx} style={{ backgroundColor: row.valid ? 'transparent' : 'var(--bg-error)' }}>
                    <td>{row.row}</td>
                    <td>{row.data.name || '—'}</td>
                    <td>
                      {row.valid ? (
                        <span className="status-pill safe">Valid</span>
                      ) : (
                        <span className="status-pill critical">Invalid</span>
                      )}
                    </td>
                    <td>
                      {row.errors.length > 0 ? (
                        <div style={{ fontSize: 12, color: 'var(--error)' }}>
                          {row.errors.join(', ')}
                        </div>
                      ) : row.warnings.length > 0 ? (
                        <div style={{ fontSize: 12, color: 'var(--warning)' }}>
                          {row.warnings.join(', ')}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--steel)' }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setStep('upload');
                setFile(null);
                setValidationResult(null);
              }}
            >
              Back
            </button>
            <button
              className="btn btn-primary"
              onClick={handleCommit}
              disabled={importing || validRows.length === 0}
            >
              {importing ? 'Importing...' : `Import ${validRows.length} ${entityLabels[entityType]}(s)`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

import { useRef, useState } from 'react';
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import Modal from './Modal';
import { readFileAsText } from '../utils/csvParse';
import { useToast } from '../context/ToastContext';

const TEMPLATES = {
  medicines: {
    title: 'Import medicines',
    subtitle: 'Upload a CSV file to bulk-add medicines to the catalog.',
    endpoint: '/import/medicines',
    required: ['name', 'unit'],
    headers: ['name', 'generic_name', 'category', 'dosage_form', 'strength', 'unit', 'reorder_level', 'requires_prescription'],
    example: 'name,generic_name,category,dosage_form,strength,unit,reorder_level,requires_prescription\nParacetamol,Acetaminophen,Analgesic,Tablet,500mg,box,10,No\nAmoxicillin,Amoxicillin,Antibiotic,Capsule,250mg,box,20,Yes'
  },
  batches: {
    title: 'Import batches',
    subtitle: 'Upload a CSV file to bulk-record stock batches. Medicines and suppliers must already exist.',
    endpoint: '/import/batches',
    required: ['medicine_name', 'batch_number', 'quantity_received', 'expiry_date'],
    headers: ['medicine_name', 'batch_number', 'supplier_name', 'quantity_received', 'cost_price', 'selling_price', 'manufacture_date', 'expiry_date'],
    example: 'medicine_name,batch_number,supplier_name,quantity_received,cost_price,selling_price,manufacture_date,expiry_date\nParacetamol,BATCH-001,MedSupply,100,5.00,12.00,2025-01-15,2027-01-15'
  },
  suppliers: {
    title: 'Import suppliers',
    subtitle: 'Upload a CSV file to bulk-add suppliers to your network.',
    endpoint: '/import/suppliers',
    required: ['name'],
    headers: ['name', 'contact_person', 'phone', 'email', 'address'],
    example: 'name,contact_person,phone,email,address\nMedSupply,John Doe,09171234567,john@medsupply.com,123 Main St'
  }
};

export default function CsvImportModal({ open, onClose, type, onImported }) {
  const { addToast } = useToast();
  const fileInputRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const config = TEMPLATES[type] || TEMPLATES.medicines;

  function reset() {
    setFileName('');
    setFileContent('');
    setError('');
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleClose() {
    reset();
    onClose();
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
    } catch (err) {
      setError(err.message || 'Failed to read file');
      setFileName('');
      setFileContent('');
    }
  }

  function handleDownloadTemplate() {
    const blob = new Blob([config.example], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${type}-template.csv`;
    link.click();
    URL.revokeObjectURL(url);
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
      const res = await fetch(`${import.meta.env.VITE_API_URL || '/api'}${config.endpoint}`, {
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
      addToast(`Imported ${data.imported} of ${data.total} records`, data.skipped > 0 ? 'info' : 'success');
      if (onImported) onImported();
    } catch (err) {
      setError(err.message || 'Import failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      icon={Upload}
      title={config.title}
      subtitle={config.subtitle}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={handleClose}>Close</button>
          <button type="button" className="btn btn-primary" onClick={handleImport} disabled={loading || !fileContent}>
            {loading ? <Loader2 size={15} className="spin" /> : <Upload size={15} />}
            {loading ? 'Importing…' : 'Import CSV'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Template download */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 13, color: 'var(--steel)' }}>
            Required columns: <strong>{config.required.join(', ')}</strong>
          </div>
          <button type="button" className="btn btn-secondary" onClick={handleDownloadTemplate} style={{ padding: '6px 12px', fontSize: 12 }}>
            <FileSpreadsheet size={14} /> Download template
          </button>
        </div>

        {/* File drop zone */}
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
            padding: '28px 20px',
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
              <CheckCircle2 size={28} color="var(--green)" style={{ marginBottom: 8 }} />
              <div style={{ fontWeight: 600, fontSize: 14 }}>{fileName}</div>
              <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 4 }}>Click to choose a different file</div>
            </>
          ) : (
            <>
              <Upload size={28} color="var(--amber)" style={{ marginBottom: 8 }} />
              <div style={{ fontWeight: 600, fontSize: 14 }}>Click to select or drag & drop a CSV file</div>
              <div style={{ fontSize: 12, color: 'var(--steel)', marginTop: 4 }}>.csv files only</div>
            </>
          )}
        </div>

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--red-deep)', fontSize: 13, background: 'var(--red-tint)', padding: '10px 14px', borderRadius: 10 }}>
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {/* Result summary */}
        {result && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
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
          </div>
        )}
      </div>
    </Modal>
  );
}
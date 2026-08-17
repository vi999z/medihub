import { useState, useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Camera, X, Search, Plus, RefreshCw, AlertCircle } from 'lucide-react';
import { useZxing } from 'react-zxing';
import api from '../api/axios';
import { useToast } from '../context/ToastContext';
import { daysUntil } from '../utils/date';

// Drug Database API (free tier: 100 req/day)
const DRUG_API_BASE = 'https://api.drug-database.com/v1';

async function lookupDrugByBarcode(code) {
  try {
    const response = await fetch(`${DRUG_API_BASE}/drugs/lookup?system=gtin&code=${code}`);
    if (!response.ok) return null;
    const data = await response.json();
    return data;
  } catch (err) {
    console.error('Drug lookup error:', err);
    return null;
  }
}

function statusPillFor(batch) {
  if (batch.status === 'expired') return { cls: 'critical', label: 'Expired' };
  if (batch.status === 'depleted') return { cls: 'warning', label: 'Depleted' };
  if (batch.status === 'recalled') return { cls: 'critical', label: 'Recalled' };
  const days = daysUntil(batch.expiry_date);
  if (days <= 7) return { cls: 'critical', label: `${days}d left` };
  if (days <= 30) return { cls: 'warning', label: `${days}d left` };
  return { cls: 'safe', label: 'Active' };
}

export default function Scanner() {
  const { addToast } = useToast();
  const [mode, setMode] = useState('lookup'); // 'lookup' | 'import'
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [batchData, setBatchData] = useState(null);
  const [drugData, setDrugData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const prefersReducedMotion = useReducedMotion();
  
  const videoRef = useRef(null);

  const { ref } = useZxing({
    paused: !isScanning,
    onDecodeResult: (result) => {
      if (!isScanning) return;
      handleScanSuccess(result.rawValue, result.format);
    },
    onDecodeError: (error) => {
      // Empty frames (no barcode found) trigger this continuously - ignore
      // Only log actual errors
      if (error && error.message && !error.message.includes('no barcode')) {
        console.debug('Decode error:', error);
      }
    },
    onError: (error) => {
      console.error('Camera/WASM error:', error);
      setError('Camera error: ' + (error?.message || 'Unable to access camera'));
      setIsScanning(false);
    },
    formats: ['qr_code', 'ean_13', 'upc_a', 'code_128', 'ean_8', 'upc_e'],
    constraints: {
      video: {
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    }
  });

  useEffect(() => {
    return () => {
      // Cleanup camera stream on unmount
      setIsScanning(false);
    };
  }, []);

  async function handleScanSuccess(code, format) {
    setIsScanning(false);
    setScanResult({ code, format });
    setLoading(true);
    setError('');

    try {
      if (mode === 'lookup') {
        // Try to find batch by ID (if QR code) or batch number
        let batch = null;
        
        // First try as batch ID (QR code)
        try {
          const res = await api.get(`/batches/${code}`);
          batch = res.data;
        } catch {
          // Not found by ID, try by batch number
          try {
            const res = await api.get('/batches');
            batch = res.data.find(b => b.batch_number === code);
          } catch {
            // Batch not found
          }
        }

        if (batch) {
          setBatchData(batch);
        } else {
          setError('No batch found for this code');
        }
      } else {
        // Import mode - try drug lookup
        const drug = await lookupDrugByBarcode(code);
        if (drug) {
          setDrugData(drug);
        } else {
          // No drug found, save code for manual entry
          setDrugData({ scannedCode: code, scannedFormat: format });
        }
      }
    } catch (err) {
      setError(err.message || 'Lookup failed');
    } finally {
      setLoading(false);
    }
  }

  function startScanning() {
    setScanResult(null);
    setBatchData(null);
    setDrugData(null);
    setError('');
    setIsScanning(true);
  }

  function resetScanner() {
    setScanResult(null);
    setBatchData(null);
    setDrugData(null);
    setError('');
    setIsScanning(false);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.4 }}
    >
      <div className="page-header">
        <div>
          <h1>Scanner</h1>
          <p>Scan QR codes or barcodes to look up batches or import new stock</p>
        </div>
      </div>

      <motion.div 
        className="card"
        style={{ padding: 20, marginBottom: 20 }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.5, delay: prefersReducedMotion ? 0 : 0.1 }}
      >
        {/* Mode Toggle */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, background: 'var(--bg-soft)', padding: 4, borderRadius: 12 }}>
          <button
            className={`btn ${mode === 'lookup' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1, borderRadius: 8 }}
            onClick={() => { setMode('lookup'); resetScanner(); }}
          >
            <Search size={16} style={{ marginRight: 8 }} />
            Lookup
          </button>
          <button
            className={`btn ${mode === 'import' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1, borderRadius: 8 }}
            onClick={() => { setMode('import'); resetScanner(); }}
          >
            <Plus size={16} style={{ marginRight: 8 }} />
            Import
          </button>
        </div>

        {/* Scanner View */}
        {!isScanning && !scanResult && !batchData && !drugData && (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <Camera size={64} style={{ color: 'var(--steel)', marginBottom: 16 }} />
            <p style={{ color: 'var(--steel)', marginBottom: 20 }}>
              {mode === 'lookup' 
                ? 'Scan a batch QR code or barcode to look up batch details'
                : 'Scan a product barcode to import new stock'}
            </p>
            <button className="btn btn-primary" onClick={startScanning}>
              <Camera size={18} style={{ marginRight: 8 }} />
              Start Scanning
            </button>
          </div>
        )}

        {/* Camera View */}
        {isScanning && (
          <div style={{ position: 'relative', aspectRatio: '4/3', background: '#000', borderRadius: 12, overflow: 'hidden' }}>
            <video
              ref={ref}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              muted
              playsInline
            />
            <div style={{
              position: 'absolute',
              inset: 0,
              border: '2px solid rgba(255,255,255,0.3)',
              borderRadius: 12,
              pointerEvents: 'none'
            }}>
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '70%',
                height: '40%',
                border: '2px solid var(--amber)',
                borderRadius: 8,
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)'
              }} />
            </div>
            <button
              className="btn btn-secondary"
              style={{ position: 'absolute', top: 12, right: 12, borderRadius: '50%', padding: 8 }}
              onClick={() => setIsScanning(false)}
            >
              <X size={20} />
            </button>
            <div style={{
              position: 'absolute',
              bottom: 12,
              left: 12,
              right: 12,
              background: 'rgba(0,0,0,0.7)',
              color: 'white',
              padding: '8px 12px',
              borderRadius: 8,
              fontSize: 13,
              textAlign: 'center'
            }}>
              Align code within frame
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <RefreshCw size={32} className="spin" style={{ color: 'var(--amber)', marginBottom: 16 }} />
            <p>Looking up code...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div style={{ textAlign: 'center', padding: 20, background: 'var(--red-tint)', borderRadius: 12, marginBottom: 20 }}>
            <AlertCircle size={24} style={{ color: 'var(--red)', marginBottom: 8 }} />
            <p style={{ color: 'var(--red)', margin: 0 }}>{error}</p>
            <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={resetScanner}>
              Try Again
            </button>
          </div>
        )}

        {/* Lookup Result */}
        {mode === 'lookup' && batchData && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ padding: 20 }}
          >
            <h3 style={{ margin: '0 0 16px' }}>Batch Found</h3>
            <div style={{ background: 'var(--bg-soft)', padding: 16, borderRadius: 12, marginBottom: 16 }}>
              <p style={{ fontWeight: 500, fontSize: 16, margin: '0 0 8px' }}>{batchData.medicine_name}</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 14 }}>
                <div><span style={{ color: 'var(--steel)' }}>Batch:</span> {batchData.batch_number}</div>
                <div><span style={{ color: 'var(--steel)' }}>Remaining:</span> {batchData.quantity_remaining}</div>
                <div><span style={{ color: 'var(--steel)' }}>Expiry:</span> {new Date(batchData.expiry_date).toLocaleDateString()}</div>
                <div>
                  <span style={{ color: 'var(--steel)' }}>Status:</span>{' '}
                  <span className={`status-pill ${statusPillFor(batchData).cls}`}>
                    {statusPillFor(batchData).label}
                  </span>
                </div>
                {batchData.supplier_name && (
                  <div style={{ gridColumn: 'span 2' }}>
                    <span style={{ color: 'var(--steel)' }}>Supplier:</span> {batchData.supplier_name}
                  </div>
                )}
              </div>
            </div>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={resetScanner}>
              Scan Another
            </button>
          </motion.div>
        )}

        {/* Import Result */}
        {mode === 'import' && drugData && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ padding: 20 }}
          >
            <h3 style={{ margin: '0 0 16px' }}>
              {drugData.scannedCode ? 'Code Captured' : 'Product Found'}
            </h3>
            
            {drugData.scannedCode ? (
              <div style={{ background: 'var(--bg-soft)', padding: 16, borderRadius: 12, marginBottom: 16 }}>
                <p style={{ color: 'var(--steel)', marginBottom: 8 }}>
                  No product data found in database. The scanned code has been saved for manual entry.
                </p>
                <div style={{ fontSize: 14 }}>
                  <div><span style={{ color: 'var(--steel)' }}>Code:</span> {drugData.scannedCode}</div>
                  <div><span style={{ color: 'var(--steel)' }}>Format:</span> {drugData.scannedFormat}</div>
                </div>
              </div>
            ) : (
              <div style={{ background: 'var(--bg-soft)', padding: 16, borderRadius: 12, marginBottom: 16 }}>
                <p style={{ fontWeight: 500, fontSize: 16, margin: '0 0 8px' }}>
                  {drugData.name || drugData.brand_name || 'Unknown Product'}
                </p>
                {drugData.strength && (
                  <p style={{ margin: '0 0 8px' }}>Strength: {drugData.strength}</p>
                )}
                {drugData.dosage_form && (
                  <p style={{ margin: '0 0 8px' }}>Form: {drugData.dosage_form}</p>
                )}
                {drugData.manufacturer && (
                  <p style={{ margin: 0, color: 'var(--steel)' }}>Manufacturer: {drugData.manufacturer}</p>
                )}
              </div>
            )}
            
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={resetScanner}>
                Scan Another
              </button>
              <button 
                className="btn btn-primary" 
                style={{ flex: 1 }}
                onClick={() => {
                  // Navigate to add medicine/batch form with pre-filled data
                  window.location.href = '/batches?add=true&code=' + encodeURIComponent(scanResult.code);
                }}
              >
                Add to Stock
              </button>
            </div>
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}

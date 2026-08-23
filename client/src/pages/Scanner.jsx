import { useState, useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Camera, X, Plus, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useZxing } from 'react-zxing';
import Skeleton from '../components/Skeleton';

export default function Scanner() {
  const navigate = useNavigate();
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
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

    setDrugData({ scannedCode: code, scannedFormat: format });
    setLoading(false);
  }

  function startScanning() {
    setScanResult(null);
    setDrugData(null);
    setError('');
    setIsScanning(true);
  }

  function resetScanner() {
    setScanResult(null);
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
          <p>Scan a QR code or barcode to add stock</p>
        </div>
      </div>

      <motion.div 
        className="card"
        style={{ padding: 20, marginBottom: 20 }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.5, delay: prefersReducedMotion ? 0 : 0.1 }}
      >
        {/* Scanner View */}
        {!isScanning && !scanResult && !drugData && (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <Camera size={64} style={{ color: 'var(--steel)', marginBottom: 16 }} />
            <p style={{ color: 'var(--steel)', marginBottom: 20 }}>
              Scan a product code to add it to stock
            </p>
            <button className="btn btn-primary" onClick={startScanning} whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}>
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
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
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
            <Skeleton height={32} width={32} radius={16} style={{ margin: '0 auto 16px' }} />
            <p style={{ color: 'var(--steel)' }}>Looking up code...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="empty-state">
            <AlertCircle size={16} style={{ marginBottom: 6 }} />
            <div>{error}</div>
            <button className="btn btn-secondary" style={{ marginTop: 10 }} onClick={resetScanner} whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}>
              Try Again
            </button>
          </div>
        )}

        {/* Scan Result */}
        {drugData && (
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
                  Code captured. Add the medicine and batch details to your inventory.
                </p>
                <div style={{ fontSize: 14 }}>
                  <div><span style={{ color: 'var(--steel)' }}>Code:</span> {drugData.scannedCode}</div>
                  <div><span style={{ color: 'var(--steel)' }}>Format:</span> {drugData.scannedFormat}</div>
                </div>
              </div>
            ) : null}
            
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={resetScanner} whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}>
                Scan Another
              </button>
              <button 
                className="btn btn-primary" 
                style={{ flex: 1 }}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  // Navigate to medicines page to add stock with pre-filled data
                  navigate(`/medicines?addBatch=true&code=${encodeURIComponent(scanResult.code)}`);
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

import { useState, useEffect, useRef } from 'react';
import { Camera, ImagePlus, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useZxing } from 'react-zxing';
import { readBarcodes } from 'zxing-wasm/reader';

export default function Scanner() {
  const navigate = useNavigate();
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [decoding, setDecoding] = useState(false);
  const [error, setError] = useState('');

  const photoInputRef = useRef(null);
  const barcodeFormats = ['QRCode', 'EAN13', 'UPCA', 'Code128', 'EAN8', 'UPCE'];

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

  function handleScanSuccess(code, format) {
    setIsScanning(false);
    setError('');
    setScanResult({ code, format });
  }

  async function handlePhotoSelect(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setIsScanning(false);
    setScanResult(null);
    setError('');
    setDecoding(true);

    try {
      const results = await readBarcodes(file, {
        formats: barcodeFormats,
        tryHarder: true,
        maxNumberOfSymbols: 1,
      });
      const result = results[0];
      if (!result?.text) throw new Error('No QR code or barcode was found in that photo');
      handleScanSuccess(result.text, result.format);
    } catch (decodeError) {
      setError(decodeError?.message || 'Could not read a code from that photo');
    } finally {
      setDecoding(false);
    }
  }

  function startScanning() {
    setScanResult(null);
    setError('');
    setIsScanning(true);
  }

  function resetScanner() {
    setScanResult(null);
    setError('');
    setIsScanning(false);
  }

  const idle = !isScanning && !scanResult && !decoding && !error;

  return (
    <div className="flat-dashboard">
      <div className="flat-card">
        <div className="flat-table-header">
          <span className="flat-table-title">{scanResult ? 'Code captured' : 'Scan a product code'}</span>
          {isScanning && (
            <button type="button" className="flat-table-link" onClick={() => setIsScanning(false)}>Stop camera</button>
          )}
        </div>

        <div style={{ padding: 16 }}>
          {idle && (
            <div className="flat-empty" style={{ padding: '32px 20px' }}>
              <Camera size={56} style={{ color: 'var(--flat-text-muted)', marginBottom: 12 }} />
              <p style={{ margin: '0 0 18px' }}>Scan a QR code or barcode to receive it into stock.</p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button type="button" className="flat-btn-primary" onClick={startScanning}>
                  <Camera size={16} /> Start scanning
                </button>
                <button type="button" className="flat-action-btn" onClick={() => photoInputRef.current?.click()}>
                  <ImagePlus size={16} /> Upload photo
                </button>
              </div>
            </div>
          )}
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoSelect}
            style={{ display: 'none' }}
          />

          {/* Camera View */}
          {isScanning && (
            <div style={{ position: 'relative', aspectRatio: '4/3', maxWidth: 720, margin: '0 auto', background: '#000', borderRadius: 8, overflow: 'hidden' }}>
              <video
                ref={ref}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                muted
                playsInline
              />
              <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '70%',
                  height: '40%',
                  border: '2px solid var(--flat-accent)',
                  borderRadius: 8,
                  boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)'
                }} />
              </div>
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

          {decoding && (
            <div className="flat-empty">
              <div className="skeleton" style={{ width: 32, height: 32, borderRadius: 16, margin: '0 auto 12px' }} />
              Reading photo…
            </div>
          )}

          {error && (
            <div className="flat-empty">
              <AlertCircle size={20} style={{ color: 'var(--flat-red)', marginBottom: 6 }} />
              <div>{error}</div>
              <div style={{ marginTop: 10 }}>
                <button type="button" className="flat-action-btn" onClick={resetScanner}>Try again</button>
              </div>
            </div>
          )}

          {scanResult && (
            <div style={{ maxWidth: 520, margin: '0 auto' }}>
              <p className="flat-med-meta" style={{ margin: '0 0 12px' }}>
                Add the medicine and batch details to your inventory. The code will be used as the batch number.
              </p>
              <div className="flat-item-row">
                <span>Code</span>
                <strong style={{ wordBreak: 'break-all', textAlign: 'right' }}>{scanResult.code}</strong>
              </div>
              <div className="flat-item-row" style={{ marginBottom: 16 }}>
                <span>Format</span>
                <strong>{scanResult.format}</strong>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="flat-action-btn" style={{ flex: 1, justifyContent: 'center' }} onClick={resetScanner}>
                  Scan another
                </button>
                <button
                  type="button"
                  className="flat-btn-primary"
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={() => navigate(`/medicines?addBatch=true&code=${encodeURIComponent(scanResult.code)}`)}
                >
                  Add to stock
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

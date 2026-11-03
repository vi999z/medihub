import { useState, useEffect, useRef } from 'react';
import { Camera, ImagePlus, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useZxing } from 'react-zxing';
import { readBarcodes } from 'zxing-wasm/reader';
import api from '../api/axios';
import PageHeader from '../components/PageHeader';
import useBranches from '../hooks/useBranches';
import { errorMessage } from '../utils/errors';
import { parseScan, describeInfo, stashScanPrefill } from '../utils/qrData';

const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

export default function Scanner() {
  const navigate = useNavigate();
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [decoding, setDecoding] = useState(false);
  // What the scanned code refers to: { state: 'checking' | 'found' | 'unknown' | 'error', match }
  const [lookup, setLookup] = useState(null);
  const [error, setError] = useState('');
  const { names: branchNames } = useBranches();

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

  // A code that carries details (a MEDIHUB detail QR or a GS1 pack code): find
  // the catalog medicine it is about, so Receive Stock can open already filled in.
  async function handleInfo(info) {
    try {
      const res = await api.cachedGet('/medicines');
      const wantBranch = info.medicine.branch;
      const inBranch = (m) => !wantBranch || same(m.branch, wantBranch);
      let matches = res.data.filter((m) => m.barcode && info.barcodeCandidates.includes(m.barcode) && inBranch(m));
      if (!matches.length && info.medicine.name) {
        matches = res.data.filter((m) => same(m.name, info.medicine.name) && (!info.medicine.strength || same(m.strength, info.medicine.strength)) && inBranch(m));
      }
      setLookup({ state: 'info', info, matches });
    } catch (err) {
      setLookup({ state: 'error', message: errorMessage(err, 'Could not check this code right now.') });
    }
  }

  // Hand the scanned details to the Medicines page and open the form there.
  function receiveFromCode(info, match, unlinked) {
    const branch = match?.branch || branchNames.find((n) => same(n, info.medicine.branch)) || '';
    stashScanPrefill({ medicine_id: match?.id || '', branch, unlinked, medicine: info.medicine, batch: info.batch, warnings: info.warnings });
    navigate('/medicines?addBatch=true');
  }

  function createMedicineFromCode(info) {
    stashScanPrefill({ medicine: info.medicine });
    navigate('/medicines?newMedicine=true');
  }

  async function handleScanSuccess(raw, format) {
    setIsScanning(false);
    setError('');
    const parsed = parseScan(raw);
    if (parsed.kind === 'info') {
      setScanResult({ code: raw, format, info: parsed });
      setLookup({ state: 'checking' });
      await handleInfo(parsed);
      return;
    }
    const code = parsed.code || raw;
    setScanResult({ code, format });
    setLookup({ state: 'checking' });
    try {
      const res = await api.get('/medicines/lookup', { params: { code } });
      setLookup({ state: 'found', match: res.data });
    } catch (err) {
      // 404 = a code nothing uses yet; anything else is a real problem.
      setLookup({ state: err.response?.status === 404 ? 'unknown' : 'error' });
    }
  }

  async function handlePhotoSelect(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setIsScanning(false);
    setScanResult(null);
    setLookup(null);
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
    setLookup(null);
    setError('');
    setIsScanning(true);
  }

  function resetScanner() {
    setScanResult(null);
    setLookup(null);
    setError('');
    setIsScanning(false);
  }

  const idle = !isScanning && !scanResult && !decoding && !error;

  return (
    <div className="flat-dashboard">
      <PageHeader title="Scanner" description="Scan a barcode or QR code with the camera or a photo to open a medicine, or to add new stock." />
      <div className="flat-card">
        <div className="flat-table-header">
          <span className="flat-table-title">{scanResult ? 'Code scanned' : 'Scan a product code'}</span>
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
              {scanResult.info ? (
                <>
                  <p className="flat-med-meta" style={{ margin: '0 0 8px' }}>
                    This code carries details ({scanResult.info.source === 'gs1' ? 'manufacturer pack code' : 'MEDIHUB QR'}). Here is what was read:
                  </p>
                  {describeInfo(scanResult.info).map(([label, value]) => (
                    <div key={label} className="flat-item-row">
                      <span>{label}</span>
                      <strong style={{ wordBreak: 'break-word', textAlign: 'right' }}>{value}</strong>
                    </div>
                  ))}
                  {scanResult.info.warnings.length > 0 && (
                    <ul className="error-text" role="status" style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13 }}>
                      {scanResult.info.warnings.map((w) => <li key={w}>{w}</li>)}
                    </ul>
                  )}
                  <div style={{ height: 12 }} />
                </>
              ) : (
                <>
                  <div className="flat-item-row">
                    <span>Code</span>
                    <strong style={{ wordBreak: 'break-all', textAlign: 'right' }}>{scanResult.code}</strong>
                  </div>
                  <div className="flat-item-row" style={{ marginBottom: 12 }}>
                    <span>Format</span>
                    <strong>{scanResult.format}</strong>
                  </div>
                </>
              )}

              {lookup?.state === 'checking' && <p className="flat-med-meta">Looking up this code…</p>}

              {lookup?.state === 'found' && (
                <div className="flat-card flat-item-card flat-item-card--green" style={{ cursor: 'default', marginBottom: 12 }}>
                  <span className="flat-status-label green">Found</span>
                  <div className="flat-med-name">{lookup.match.medicine_name || 'Medicine'}</div>
                  <div className="flat-med-meta">
                    {lookup.match.kind === 'batch' ? `This code belongs to batch ${lookup.match.batch_number || ''}` : 'This code belongs to this medicine'}
                    {lookup.match.branch ? ` · ${lookup.match.branch}` : ''}
                  </div>
                </div>
              )}
              {lookup?.state === 'unknown' && (
                <p className="flat-med-meta" style={{ margin: '0 0 12px' }}>
                  No medicine or batch uses this code yet. You can add it as a new medicine, or receive it as stock for an existing one.
                </p>
              )}
              {lookup?.state === 'info' && lookup.matches.length > 0 && (
                <div className="flat-card flat-item-card flat-item-card--green" style={{ cursor: 'default', marginBottom: 12 }}>
                  <span className="flat-status-label green">Found in the catalog</span>
                  {lookup.matches.map((m) => (
                    <div key={m.id} className="flat-med-meta">{m.name}{m.strength ? ` · ${m.strength}` : ''} · {m.branch}</div>
                  ))}
                </div>
              )}
              {lookup?.state === 'info' && lookup.matches.length === 0 && (
                <p className="flat-med-meta" style={{ margin: '0 0 12px' }}>
                  This medicine is not in the catalog{scanResult.info.medicine.branch ? ` of ${scanResult.info.medicine.branch}` : ''}. Receive it as an unlinked batch and link it later, or create the medicine first.
                </p>
              )}
              {lookup?.state === 'error' && (
                <p className="error-text" role="alert" style={{ margin: '0 0 12px' }}>{lookup.message || 'Could not check this code right now.'} You can still add it manually below.</p>
              )}

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" className="flat-action-btn" style={{ flex: '1 1 140px', justifyContent: 'center' }} onClick={resetScanner}>
                  Scan another
                </button>
                {lookup?.state === 'info' ? (
                  <>
                    {lookup.matches.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className="flat-btn-primary"
                        style={{ flex: '1 1 200px', justifyContent: 'center' }}
                        onClick={() => receiveFromCode(lookup.info, m, false)}
                      >
                        {lookup.matches.length > 1 ? `Receive into ${m.branch}` : 'Review and receive'}
                      </button>
                    ))}
                    {lookup.matches.length === 0 && (
                      <>
                        <button type="button" className="flat-btn-primary" style={{ flex: '1 1 200px', justifyContent: 'center' }} onClick={() => receiveFromCode(lookup.info, null, true)}>
                          Receive as unlinked batch
                        </button>
                        {lookup.info.medicine.name && (
                          <button type="button" className="flat-action-btn" style={{ flex: '1 1 200px', justifyContent: 'center' }} onClick={() => createMedicineFromCode(lookup.info)}>
                            Create medicine from the code
                          </button>
                        )}
                        <button type="button" className="flat-action-btn" style={{ flex: '1 1 200px', justifyContent: 'center' }} onClick={() => receiveFromCode(lookup.info, null, false)}>
                          Choose a medicine myself
                        </button>
                      </>
                    )}
                  </>
                ) : lookup?.state === 'found' ? (
                  <button
                    type="button"
                    className="flat-btn-primary"
                    style={{ flex: '1 1 180px', justifyContent: 'center' }}
                    onClick={() => navigate(`/medicines?open=${lookup.match.medicine_id}`)}
                  >
                    Open medicine record
                  </button>
                ) : lookup?.state !== 'checking' && (
                  <>
                    <button
                      type="button"
                      className="flat-btn-primary"
                      style={{ flex: '1 1 180px', justifyContent: 'center' }}
                      onClick={() => navigate(`/medicines?newMedicine=true&barcode=${encodeURIComponent(scanResult.code)}`)}
                    >
                      Add as new medicine
                    </button>
                    <button
                      type="button"
                      className="flat-action-btn"
                      style={{ flex: '1 1 180px', justifyContent: 'center' }}
                      onClick={() => navigate(`/medicines?addBatch=true&code=${encodeURIComponent(scanResult.code)}`)}
                    >
                      Receive as a batch
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

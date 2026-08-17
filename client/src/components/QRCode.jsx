import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

export default function QRCodeDisplay({ value, size = 200, className = '' }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!value || !canvasRef.current) return;

    QRCode.toCanvas(canvasRef.current, value, {
      width: size,
      margin: 1,
      color: {
        dark: '#1a1a1a',
        light: '#ffffff',
      },
    }).catch((err) => {
      console.error('QR code generation error:', err);
    });
  }, [value, size]);

  if (!value) return null;

  return (
    <div className={`qr-code-container ${className}`} style={{ display: 'inline-flex', justifyContent: 'center', alignItems: 'center' }}>
      <canvas ref={canvasRef} style={{ maxWidth: '100%', height: 'auto' }} />
    </div>
  );
}

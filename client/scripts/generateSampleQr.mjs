// Makes sample QR codes for testing the scanner's auto-fill.
//
//   cd client
//   node scripts/generateSampleQr.mjs
//
// Writes PNG files and a printable page to ../docs/sample-qr/. Open
// docs/sample-qr/index.html in a browser and scan the codes from the screen
// (or print the page). Scan them on the Scanner page, or upload the PNGs with
// "Upload photo". Each sample can be received once: batch numbers are unique,
// so delete the batch (or change the number) to scan it again.
import QRCode from 'qrcode';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'sample-qr');
mkdirSync(outDir, { recursive: true });

const SAMPLES = [
  {
    file: '1-known-medicine',
    title: '1. Delivery of a medicine already in the catalog',
    expect: 'Scanner finds Biogesic (QMC) by its barcode, then "Review and receive" opens Receive Stock with the batch number, quantity, dates, prices and supplier already filled in. Needs the demo data (barcode DEMO480100001).',
    text: JSON.stringify({
      app: 'MEDIHUB', medicine: 'Biogesic', strength: '500mg', form: 'Tablet', barcode: 'DEMO480100001', branch: 'QMC',
      batch: 'TESTQR-BIO-001', qty: 120, mfg: '2026-08-01', exp: '2028-02-28', cost: 38.5, price: 52, supplier: 'Supplier A (Demo)',
    }),
  },
  {
    file: '2-new-medicine',
    title: '2. Delivery of a medicine that is not in the catalog yet',
    expect: 'No catalog medicine matches, so the scanner offers: receive it as an unlinked batch (name, barcode and details kept on the batch), or create the medicine from the code first. Link it later from Batches.',
    text: JSON.stringify({
      app: 'MEDIHUB', medicine: 'Test Vitamin D3', strength: '1000IU', form: 'Softgel', category: 'Vitamins & Supplements', unit: 'bottle',
      barcode: 'TESTD3-0001', branch: 'MT Carmel', batch: 'TESTQR-D3-001', qty: 60, mfg: '2026-09-15', exp: '2028-05-31', cost: 150, price: 199,
    }),
  },
  {
    file: '3-gs1-pack-code',
    title: '3. A manufacturer GS1 pack code',
    expect: 'Reads the barcode (GTIN), expiry date, lot and quantity from the standard pack code, then asks which branch and medicine. The rest of the form is left for you to fill in.',
    text: '(01)04800100000011(17)281231(10)TESTQR-GS1-001(30)48',
  },
  {
    file: '4-invalid-details',
    title: '4. A code with a bad expiry date and quantity',
    expect: 'Shows warnings ("Expiry date ... is not a valid date") and leaves those fields blank instead of accepting them. Good for checking error handling.',
    text: JSON.stringify({ app: 'MEDIHUB', medicine: 'Test Paracetamol', batch: 'TESTQR-BAD-001', qty: -5, exp: '2028-02-30', price: 'abc', branch: 'QMC' }),
  },
];

const cards = [];
for (const sample of SAMPLES) {
  const png = join(outDir, `${sample.file}.png`);
  await QRCode.toFile(png, sample.text, { width: 420, margin: 2, errorCorrectionLevel: 'M' });
  const dataUrl = await QRCode.toDataURL(sample.text, { width: 420, margin: 2, errorCorrectionLevel: 'M' });
  const escape = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  cards.push(`<section><h2>${escape(sample.title)}</h2><img src="${dataUrl}" alt="${escape(sample.title)}" width="300" height="300"><p>${escape(sample.expect)}</p><details><summary>What the code says</summary><pre>${escape(sample.text)}</pre></details></section>`);
}

writeFileSync(join(outDir, 'index.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>MEDIHUB sample QR codes</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 980px; margin: 24px auto; padding: 0 16px; color: #1a1a1a; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
  section { border: 1px solid #ddd; border-radius: 10px; padding: 16px; break-inside: avoid; }
  h2 { font-size: 16px; margin: 0 0 10px; } p { font-size: 13.5px; line-height: 1.5; color: #444; }
  img { display: block; margin: 0 auto; } pre { white-space: pre-wrap; word-break: break-all; font-size: 12px; background: #f5f5f5; padding: 8px; border-radius: 6px; }
</style></head><body>
<h1>MEDIHUB sample QR codes</h1>
<p>Open <strong>Scanner</strong> in MEDIHUB and scan these from the screen, or print this page. You can also save the PNG files and use <em>Upload photo</em>. Each sample can be received once (batch numbers must be unique).</p>
<div class="grid">${cards.join('\n')}</div>
</body></html>
`);

console.log(`Wrote ${SAMPLES.length} QR codes and index.html to ${outDir}`);

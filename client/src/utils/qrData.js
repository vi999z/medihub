// Reads what a scanned code says. Three kinds of code are understood:
//
//  1. MEDIHUB reference codes   MEDIHUB:M:<id> (medicine) and MEDIHUB:B:<id> (batch)
//     -> kind 'code'; the server looks them up.
//  2. MEDIHUB detail codes      a JSON text with the medicine and batch details,
//     e.g. {"app":"MEDIHUB","medicine":"Biogesic","strength":"500mg","batch":"LOT-1",...}
//     -> kind 'info': the Receive Stock form can be filled in from it.
//  3. GS1 pack codes            what manufacturers print on packs, e.g.
//     (01)04800100000011(17)281231(10)LOT123 -> kind 'info' (barcode, expiry, lot).
//  Anything else (a plain EAN/UPC barcode, a batch number) is kind 'code'.

const MAX = { name: 150, strength: 50, form: 50, category: 80, unit: 30, barcode: 64, batch: 80, supplier: 150, branch: 60 };

const clean = (value, max) => (value === undefined || value === null ? '' : String(value).trim().slice(0, max));

function toNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function isRealDate(value) {
  const d = new Date(`${value}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// GS1 dates are YYMMDD; day "00" means the last day of that month.
function gs1Date(yymmdd) {
  if (!/^\d{6}$/.test(yymmdd)) return '';
  const year = 2000 + Number(yymmdd.slice(0, 2));
  const month = Number(yymmdd.slice(2, 4));
  let day = Number(yymmdd.slice(4, 6));
  if (month < 1 || month > 12) return '';
  if (day === 0) day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return isRealDate(iso) ? iso : '';
}

function emptyInfo(source) {
  return {
    kind: 'info',
    source,
    medicine: { name: '', strength: '', dosage_form: '', category: '', unit: '', barcode: '', branch: '' },
    batch: { batch_number: '', quantity_received: null, manufacture_date: '', expiry_date: '', cost_price: null, selling_price: null, supplier_name: '' },
    barcodeCandidates: [],
    warnings: [],
  };
}

// A date that is present but unreadable is reported instead of silently dropped.
function takeDate(info, field, value, label) {
  const v = clean(value, 10);
  if (!v) return;
  if (isRealDate(v)) info.batch[field] = v;
  else info.warnings.push(`${label} "${v}" is not a valid date (use YYYY-MM-DD), so it was left blank.`);
}

function parseMedihubJson(text) {
  let data;
  try { data = JSON.parse(text); } catch { return null; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  if (data.app !== undefined && String(data.app).toUpperCase() !== 'MEDIHUB') return null;

  const pick = (...keys) => keys.map((k) => data[k]).find((v) => v !== undefined && v !== null && v !== '');
  const info = emptyInfo('medihub');
  info.medicine.name = clean(pick('medicine', 'name'), MAX.name);
  info.medicine.strength = clean(pick('strength'), MAX.strength);
  info.medicine.dosage_form = clean(pick('form', 'dosage_form'), MAX.form);
  info.medicine.category = clean(pick('category'), MAX.category);
  info.medicine.unit = clean(pick('unit'), MAX.unit);
  info.medicine.barcode = clean(pick('barcode'), MAX.barcode);
  info.medicine.branch = clean(pick('branch'), MAX.branch);
  info.batch.batch_number = clean(pick('batch', 'lot', 'batch_number'), MAX.batch).toUpperCase();
  info.batch.quantity_received = (() => {
    const q = toNumber(pick('qty', 'quantity', 'quantity_received'));
    return q !== null && Number.isInteger(q) && q > 0 ? q : null;
  })();
  takeDate(info, 'manufacture_date', pick('mfg', 'manufacture_date'), 'Manufacture date');
  takeDate(info, 'expiry_date', pick('exp', 'expiry', 'expiry_date'), 'Expiry date');
  info.batch.cost_price = toNumber(pick('cost', 'cost_price'));
  info.batch.selling_price = toNumber(pick('price', 'selling_price'));
  info.batch.supplier_name = clean(pick('supplier'), MAX.supplier);
  if (info.medicine.barcode) info.barcodeCandidates = [info.medicine.barcode];

  const hasSomething = info.medicine.name || info.medicine.barcode || info.batch.batch_number || info.batch.expiry_date;
  return hasSomething ? info : null;
}

// ── GS1 ──
const GS1_FIXED = { '00': 18, '01': 14, '02': 14, '11': 6, '12': 6, '13': 6, '15': 6, '16': 6, '17': 6 };
const GS1_VARIABLE = new Set(['10', '21', '30', '37']);
const GS = '\u001d';

function gs1Pairs(text) {
  const pairs = [];
  if (text.startsWith('(')) {
    const re = /\((\d{2,4})\)([^(]*)/g;
    let m;
    while ((m = re.exec(text))) pairs.push([m[1], m[2]]);
    return pairs;
  }
  // Raw form: fixed-length fields run on; variable ones end at a group separator.
  let i = 0;
  const body = text.replace(/^\][A-Za-z]\d/, '');
  while (i < body.length) {
    const ai = body.slice(i, i + 2);
    if (GS1_FIXED[ai]) {
      pairs.push([ai, body.slice(i + 2, i + 2 + GS1_FIXED[ai])]);
      i += 2 + GS1_FIXED[ai];
    } else if (GS1_VARIABLE.has(ai)) {
      let end = body.indexOf(GS, i + 2);
      if (end === -1) end = body.length;
      pairs.push([ai, body.slice(i + 2, end)]);
      i = end + 1;
    } else {
      return null; // an element we don't understand: not safe to guess
    }
  }
  return pairs;
}

function parseGs1(text) {
  const looksGs1 = /^\(\d{2,4}\)/.test(text) || /^(\]\w\d)?01\d{14}.{2,}$/.test(text);
  if (!looksGs1) return null;
  const pairs = gs1Pairs(text);
  if (!pairs || !pairs.length) return null;

  const info = emptyInfo('gs1');
  for (const [ai, value] of pairs) {
    if (ai === '01' || ai === '02') {
      if (!/^\d{14}$/.test(value)) continue;
      // The same product's EAN-13 / UPC-A are its GTIN-14 without the leading zeros.
      const candidates = [value];
      if (value.startsWith('0')) candidates.push(value.slice(1));
      if (value.startsWith('00')) candidates.push(value.slice(2));
      info.barcodeCandidates = candidates;
      info.medicine.barcode = value.startsWith('0') ? value.slice(1) : value;
    } else if (ai === '10') {
      info.batch.batch_number = clean(value, MAX.batch).toUpperCase().replace(/[^A-Z0-9_-]/g, '-');
    } else if (ai === '17') {
      const d = gs1Date(value);
      if (d) info.batch.expiry_date = d; else info.warnings.push(`Expiry date "${value}" in the code is not valid, so it was left blank.`);
    } else if (ai === '11') {
      const d = gs1Date(value);
      if (d) info.batch.manufacture_date = d;
    } else if (ai === '30' || ai === '37') {
      const q = toNumber(value);
      if (q !== null && Number.isInteger(q) && q > 0) info.batch.quantity_received = q;
    }
  }
  const hasSomething = info.medicine.barcode || info.batch.batch_number || info.batch.expiry_date;
  return hasSomething ? info : null;
}

export function parseScan(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return { kind: 'code', code: '' };
  if (text.startsWith('{')) {
    const info = parseMedihubJson(text);
    if (info) return info;
  }
  const gs1 = parseGs1(text);
  if (gs1) return gs1;
  return { kind: 'code', code: text };
}

// A short list of what was read, for the confirmation card.
export function describeInfo(info) {
  const rows = [];
  const { medicine: m, batch: b } = info;
  if (m.name) rows.push(['Medicine', [m.name, m.strength, m.dosage_form].filter(Boolean).join(' · ')]);
  if (m.barcode) rows.push(['Barcode', m.barcode]);
  if (m.branch) rows.push(['Branch', m.branch]);
  if (b.batch_number) rows.push(['Batch number', b.batch_number]);
  if (b.quantity_received) rows.push(['Quantity', String(b.quantity_received)]);
  if (b.manufacture_date) rows.push(['Manufactured', b.manufacture_date]);
  if (b.expiry_date) rows.push(['Expires', b.expiry_date]);
  if (b.cost_price !== null) rows.push(['Cost price', String(b.cost_price)]);
  if (b.selling_price !== null) rows.push(['Selling price', String(b.selling_price)]);
  if (b.supplier_name) rows.push(['Supplier', b.supplier_name]);
  return rows;
}

// The Scanner hands what it read to the Medicines page through sessionStorage.
const PREFILL_KEY = 'medihub_scan_prefill';

export function stashScanPrefill(prefill) {
  try { sessionStorage.setItem(PREFILL_KEY, JSON.stringify(prefill)); } catch { /* storage blocked: the form just opens empty */ }
}

export function takeScanPrefill() {
  try {
    const raw = sessionStorage.getItem(PREFILL_KEY);
    sessionStorage.removeItem(PREFILL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

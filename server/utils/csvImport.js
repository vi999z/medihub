/**
 * CSV import helpers — validation & normalization for bulk data imports.
 */

const MEDICINE_HEADERS = [
  'name', 'generic_name', 'category', 'dosage_form', 'strength',
  'unit', 'reorder_level', 'requires_prescription'
];

const BATCH_HEADERS = [
  'medicine_name', 'batch_number', 'supplier_name', 'quantity_received',
  'cost_price', 'selling_price', 'manufacture_date', 'expiry_date'
];

const SUPPLIER_HEADERS = [
  'name', 'contact_person', 'phone', 'email', 'address'
];

function normalizeHeader(header) {
  return String(header || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

function parseBoolean(value) {
  if (value === undefined || value === null) return false;
  const str = String(value).trim().toLowerCase();
  return ['yes', 'true', '1', 'y', 'rx', 'prescription'].includes(str);
}

function parseNumber(value) {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  if (!str) return null;
  const num = Number(str.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(num) ? num : null;
}

function parseDate(value) {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  if (!str) return null;
  // Accept YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY, or M/D/YYYY
  const match = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    const [, y, m, d] = match;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  const slashMatch = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slashMatch) {
    const [, a, b, y] = slashMatch;
    // Assume MM/DD/YYYY if first part is 12 or less and second is 12 or less
    const month = Number(a) <= 12 ? Number(a) : Number(b);
    const day = Number(a) <= 12 ? Number(b) : Number(a);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  return null;
}

function validateRow(row, headers, requiredFields) {
  const errors = [];
  for (const field of requiredFields) {
    const value = row[field];
    if (value === undefined || value === null || String(value).trim() === '') {
      errors.push(`missing "${field}"`);
    }
  }
  return errors;
}

function buildRowObject(headers, values) {
  const row = {};
  headers.forEach((header, index) => {
    row[header] = (values[index] || '').trim();
  });
  return row;
}

function parseCsvText(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length < 2) {
    throw new Error('CSV must contain a header row and at least one data row');
  }

  // Parse CSV respecting quoted fields
  function parseLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (inQuotes) {
        if (char === '"') {
          if (line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += char;
        }
      } else if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  }

  const headerLine = parseLine(lines[0]);
  const headers = headerLine.map(normalizeHeader);

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    rows.push(buildRowObject(headers, values));
  }

  return { headers, rows };
}

module.exports = {
  MEDICINE_HEADERS,
  BATCH_HEADERS,
  SUPPLIER_HEADERS,
  normalizeHeader,
  parseBoolean,
  parseNumber,
  parseDate,
  validateRow,
  parseCsvText
};
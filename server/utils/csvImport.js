/**
 * Generic CSV import engine — schema-driven analysis & import.
 * Works with any entity defined in server/config/importSchemas.js.
 */

// ─── Type converters ───
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
    const month = Number(a) <= 12 ? Number(a) : Number(b);
    const day = Number(a) <= 12 ? Number(b) : Number(a);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  return null;
}

function convertValue(value, type) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  switch (type) {
    case 'number': return parseNumber(value);
    case 'boolean': return parseBoolean(value);
    case 'date': return parseDate(value);
    default: return String(value).trim();
  }
}

// ─── CSV parsing (respects quoted fields) ───
function parseCsvText(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length < 2) {
    throw new Error('CSV must contain a header row and at least one data row');
  }

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
  const headers = headerLine.map((h) => String(h || '').trim());

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = (values[index] || '').trim();
    });
    rows.push(row);
  }

  return { headers, rows };
}

// ─── Column mapping / fuzzy matching ───
function normalizeHeader(header) {
  return String(header || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

function fuzzyMatch(header, fieldKey) {
  const h = normalizeHeader(header);
  const f = normalizeHeader(fieldKey);
  if (h === f) return true;
  // "medicine name" → "medicine_name", "medicineName" → "medicine_name"
  if (h.replace(/_/g, '') === f.replace(/_/g, '')) return true;
  // "medicine" → "medicine_name" (prefix match)
  if (f.startsWith(h) && h.length >= 3) return true;
  // "name" → "medicine_name" (suffix match for common fields)
  if (h.endsWith('_name') && f === 'name') return true;
  return false;
}

/**
 * Auto-detect column mapping from CSV headers to schema fields.
 * Returns { fieldKey: csvHeader } for each matched field.
 */
function detectColumnMapping(headers, schema) {
  const mapping = {};
  const usedHeaders = new Set();

  // First pass: exact matches
  for (const [fieldKey, fieldDef] of Object.entries(schema.fields)) {
    const exact = headers.find((h) => normalizeHeader(h) === fieldKey && !usedHeaders.has(h));
    if (exact) {
      mapping[fieldKey] = exact;
      usedHeaders.add(exact);
    }
  }

  // Second pass: fuzzy matches for unmapped fields
  for (const [fieldKey, fieldDef] of Object.entries(schema.fields)) {
    if (mapping[fieldKey]) continue;
    const fuzzy = headers.find((h) => !usedHeaders.has(h) && fuzzyMatch(h, fieldKey));
    if (fuzzy) {
      mapping[fieldKey] = fuzzy;
      usedHeaders.add(fuzzy);
    }
  }

  return mapping;
}

/**
 * Build a normalized row object from a raw CSV row using the column mapping.
 */
function buildNormalizedRow(rawRow, mapping, schema) {
  const row = {};
  for (const [fieldKey, fieldDef] of Object.entries(schema.fields)) {
    const csvHeader = mapping[fieldKey];
    const rawValue = csvHeader ? rawRow[csvHeader] : undefined;
    const converted = convertValue(rawValue, fieldDef.type);
    row[fieldKey] = converted !== null ? converted : (fieldDef.default ?? null);
  }
  return row;
}

/**
 * Validate a normalized row against the schema.
 * Returns array of error strings (empty = valid).
 */
function validateRow(row, schema) {
  const errors = [];
  for (const fieldKey of schema.required || []) {
    const value = row[fieldKey];
    if (value === undefined || value === null || String(value).trim() === '') {
      errors.push(`missing "${fieldKey}"`);
    }
  }
  // Type-specific validation
  for (const [fieldKey, fieldDef] of Object.entries(schema.fields)) {
    const value = row[fieldKey];
    if (value === null || value === undefined || value === '') continue;
    if (fieldDef.type === 'number' && typeof value === 'number' && !Number.isFinite(value)) {
      errors.push(`invalid number for "${fieldKey}"`);
    }
    if (fieldDef.type === 'date' && typeof value === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      errors.push(`invalid date for "${fieldKey}"`);
    }
    if (fieldDef.options && !fieldDef.options.includes(value)) {
      errors.push(`"${fieldKey}" must be one of: ${fieldDef.options.join(', ')}`);
    }
  }
  return errors;
}

/**
 * Analyze a CSV without importing — returns preview data, column mapping, and per-row validation.
 */
async function analyzeCsv(csv, schema) {
  const { headers, rows } = parseCsvText(csv);
  const mapping = detectColumnMapping(headers, schema);

  // Check for missing required columns
  const missingRequired = (schema.required || []).filter((f) => !mapping[f]);
  const unknownColumns = headers.filter((h) => {
    const normalized = normalizeHeader(h);
    return !Object.keys(schema.fields).some((f) => normalizeHeader(f) === normalized);
  });

  // Load lookups for FK validation
  let lookups = {};
  if (schema.loadLookups) {
    lookups = await schema.loadLookups();
  }

  // Validate each row
  const previewRows = rows.map((rawRow, index) => {
    const normalized = buildNormalizedRow(rawRow, mapping, schema);
    const errors = validateRow(normalized, schema);
    if (schema.validateRow) {
      const extraErrors = schema.validateRow(normalized, lookups) || [];
      errors.push(...extraErrors);
    }
    return {
      line: index + 2,
      data: normalized,
      valid: errors.length === 0,
      errors
    };
  });

  const validCount = previewRows.filter((r) => r.valid).length;

  return {
    headers,
    mapping,
    missingRequired,
    unknownColumns,
    total: rows.length,
    valid: validCount,
    invalid: rows.length - validCount,
    rows: previewRows
  };
}

/**
 * Execute the import — writes data to the database.
 */
async function importCsv(csv, schema, userId, req) {
  const { headers, rows } = parseCsvText(csv);
  const mapping = detectColumnMapping(headers, schema);

  // Load lookups once
  let lookups = {};
  if (schema.loadLookups) {
    lookups = await schema.loadLookups();
  }

  const results = { total: rows.length, imported: 0, skipped: 0, errors: [] };
  const seenKeys = new Set();

  for (let i = 0; i < rows.length; i++) {
    const rawRow = rows[i];
    const lineNumber = i + 2;
    const normalized = buildNormalizedRow(rawRow, mapping, schema);

    // Required field validation
    const fieldErrors = validateRow(normalized, schema);
    if (fieldErrors.length) {
      results.skipped++;
      results.errors.push({ line: lineNumber, row: normalized[schema.uniqueKey] || `Row ${lineNumber}`, error: fieldErrors.join(', ') });
      continue;
    }

    // Schema-specific validation (FK lookups, business rules)
    if (schema.validateRow) {
      const extraErrors = schema.validateRow(normalized, lookups) || [];
      if (extraErrors.length) {
        results.skipped++;
        results.errors.push({ line: lineNumber, row: normalized[schema.uniqueKey] || `Row ${lineNumber}`, error: extraErrors.join(', ') });
        continue;
      }
    }

    // Deduplication
    if (schema.uniqueKey) {
      const key = String(normalized[schema.uniqueKey] || '').toLowerCase();
      if (seenKeys.has(key)) {
        results.skipped++;
        results.errors.push({ line: lineNumber, row: normalized[schema.uniqueKey], error: `duplicate "${schema.uniqueKey}" value` });
        continue;
      }
      seenKeys.add(key);
    }

    try {
      await schema.create(normalized, lookups, userId);
      results.imported++;
    } catch (err) {
      results.skipped++;
      results.errors.push({ line: lineNumber, row: normalized[schema.uniqueKey] || `Row ${lineNumber}`, error: err.message });
    }
  }

  return results;
}

module.exports = {
  parseCsvText,
  parseBoolean,
  parseNumber,
  parseDate,
  normalizeHeader,
  detectColumnMapping,
  buildNormalizedRow,
  validateRow,
  analyzeCsv,
  importCsv
};
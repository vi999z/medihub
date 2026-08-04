/**
 * Unified CSV utility module — the single source of truth for all CSV operations.
 *
 * Consolidates: parsing, type conversion, column mapping, validation,
 * analysis (preview), import execution, and CSV generation (export).
 *
 * Works with any entity defined in server/config/importSchemas.js.
 */

// ─── Type converters ───────────────────────────────────────────────────────

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

// ─── CSV parsing (respects quoted fields) ──────────────────────────────────

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

// ─── Column mapping / fuzzy matching ───────────────────────────────────────

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

// ─── Chunking helper (avoids MySQL max_allowed_packet for huge multi-row inserts) ──

function chunkArray(arr, size = 500) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

// ─── Combined import (medicines + suppliers + batches + optional transactions) ──

/**
 * Import ALL entities (medicines, suppliers, batches, optional transactions)
 * from ONE CSV file in a single go.
 *
 * Performance strategy:
 *  - ONE database transaction (single connection, no per-row autocommit)
 *  - Multi-row batched INSERTs
 *  - In-memory maps for dedup + FK resolution (no per-row SELECTs)
 *  - Supplier/medicine rows are inserted on-the-fly if they don't exist yet
 *
 * CSV columns (see `importSchemas.combined`):
 *  Medicine: name, generic_name, category, dosage_form, strength, unit, reorder_level, requires_prescription
 *  Supplier: supplier_name, contact_person, phone, email, address
 *  Batch:    batch_number, quantity_received, cost_price, selling_price, manufacture_date, expiry_date
 *  Transaction (ALL OPTIONAL): transaction_type, transaction_quantity, reason, transaction_date
 */
async function importCombinedCsv(csv, schema, userId, req, { pool }) {
  const { headers, rows } = parseCsvText(csv);
  const mapping = detectColumnMapping(headers, schema);
  const results = {
    total: rows.length,
    medicines: { imported: 0, skipped: 0, errors: [] },
    suppliers: { imported: 0, skipped: 0, errors: [] },
    batches: { imported: 0, skipped: 0, errors: [] },
    transactions: { imported: 0, skipped: 0, errors: [] },
    errors: []
  };

  // ── 1. Validate + normalize all rows first ──
  const batches = [];
  for (let i = 0; i < rows.length; i++) {
    const line = i + 2;
    const normalized = buildNormalizedRow(rows[i], mapping, schema);
    const fieldErrors = validateRow(normalized, schema);
    const extraErrors = schema.validateRow ? (await schema.validateRow(normalized) || []) : [];
    batches.push({ line, normalized, errors: [...fieldErrors, ...extraErrors] });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Existing lookups loaded once
    const [existingMedRows] = await conn.query('SELECT id, name FROM medicines');
    const [existingSupRows] = await conn.query('SELECT id, name FROM suppliers');
    const [existingBatchRows] = await conn.query('SELECT id, batch_number, quantity_remaining FROM batches');
    const medicineMap = new Map(existingMedRows.map((r) => [r.name.toLowerCase(), { id: r.id }]));
    const supplierMap = new Map(existingSupRows.map((r) => [r.name.toLowerCase(), { id: r.id }]));
    const batchIdByNumber = new Map(existingBatchRows.map((r) => [r.batch_number.toLowerCase(), r.id]));

    // ── 2. Pass 1: validate every row (skip invalid ones early) ──
    const validRows = [];
    for (const item of batches) {
      if (item.errors.length) {
        results.batches.skipped++;
        results.batches.errors.push({ line: item.line, row: item.normalized.batch_number, error: item.errors.join(', ') });
        continue;
      }
      validRows.push(item);
    }

    // ── 3. Medicines (dedupe by name, insert only new) ──
    const medicineByName = new Map(); // normalized name → { row, line }
    for (const item of validRows) {
      const key = String(item.normalized.name || '').toLowerCase();
      if (!key) continue;
      if (!medicineByName.has(key)) medicineByName.set(key, item);
    }

    const newMedicineRows = []; // { name, generic_name, category, ... }
    for (const [nameKey, item] of medicineByName) {
      if (medicineMap.has(nameKey)) continue; // already exists
      const r = item.normalized;
      const normalizedCategory = r.category && r.category.trim() ? r.category : 'Other';
      newMedicineRows.push([
        r.name,
        r.generic_name || null,
        normalizedCategory,
        r.dosage_form || null,
        r.strength || null,
        r.unit || 'box',
        r.reorder_level ?? 10,
        !!r.requires_prescription
      ]);
    }

    if (newMedicineRows.length) {
      // Dedup within the file itself
      const seenInFile = new Set();
      const deduped = [];
      for (const row of newMedicineRows) {
        const key = String(row[0]).toLowerCase();
        if (seenInFile.has(key)) continue;
        seenInFile.add(key);
        deduped.push(row);
      }
      // Multi-row batched INSERT IGNORE (chunked for very large files)
      let insertedCount = 0;
      for (const chunk of chunkArray(deduped)) {
        const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(',');
        const [insertResult] = await conn.query(
          `INSERT IGNORE INTO medicines (name, generic_name, category, dosage_form, strength, unit, reorder_level, requires_prescription)
           VALUES ${placeholders}`,
          chunk.flat()
        );
        insertedCount += insertResult.affectedRows;
      }
      results.medicines.imported = insertedCount;

      // Refresh map with new medicine IDs — select only the ones we just inserted
      const [freshRows] = await conn.query(
        `SELECT id, name FROM medicines WHERE name IN (${deduped.map(() => '?').join(',')})`,
        deduped.map((r) => r[0])
      );
      for (const fr of freshRows) medicineMap.set(fr.name.toLowerCase(), { id: fr.id });
      results.medicines.skipped = deduped.length - insertedCount;
    }

    // ── 4. Suppliers (dedupe by name, insert only new) ──
    const supplierByName = new Map();
    for (const item of validRows) {
      const r = item.normalized;
      const key = r.supplier_name ? String(r.supplier_name).toLowerCase() : '';
      if (!key) continue;
      if (!supplierByName.has(key)) supplierByName.set(key, item);
    }

    const newSupplierRows = [];
    for (const [nameKey, item] of supplierByName) {
      if (supplierMap.has(nameKey)) continue;
      const r = item.normalized;
      newSupplierRows.push([
        r.supplier_name,
        r.contact_person || null,
        r.phone || null,
        r.email || null,
        r.address || null
      ]);
    }

    if (newSupplierRows.length) {
      const seenInFile = new Set();
      const deduped = [];
      for (const row of newSupplierRows) {
        const key = String(row[0]).toLowerCase();
        if (seenInFile.has(key)) continue;
        seenInFile.add(key);
        deduped.push(row);
      }
      let insertedCount = 0;
      for (const chunk of chunkArray(deduped)) {
        const placeholders = chunk.map(() => '(?, ?, ?, ?, ?)').join(',');
        const [insertResult] = await conn.query(
          `INSERT IGNORE INTO suppliers (name, contact_person, phone, email, address)
           VALUES ${placeholders}`,
          chunk.flat()
        );
        insertedCount += insertResult.affectedRows;
      }
      results.suppliers.imported = insertedCount;
      results.suppliers.skipped = deduped.length - insertedCount;

      const [freshRows] = await conn.query(
        `SELECT id, name FROM suppliers WHERE name IN (${deduped.map(() => '?').join(',')})`,
        deduped.map((r) => r[0])
      );
      for (const fr of freshRows) supplierMap.set(fr.name.toLowerCase(), { id: fr.id });
    }

    // ── 5. Batches (dedupe by batch_number, insert only new) ──
    const batchByNumber = new Map();
    for (const item of validRows) {
      const key = String(item.normalized.batch_number || '').toLowerCase();
      if (batchByNumber.has(key)) {
        results.batches.skipped++;
        results.batches.errors.push({ line: item.line, row: item.normalized.batch_number, error: 'duplicate batch_number value' });
        continue;
      }
      batchByNumber.set(key, item);
    }

    const newBatchRows = [];
    for (const [batchKey, item] of batchByNumber) {
      if (batchIdByNumber.has(batchKey)) {
        results.batches.skipped++;
        results.batches.errors.push({ line: item.line, row: item.normalized.batch_number, error: 'batch already exists in database' });
        continue;
      }
      const r = item.normalized;
      const medicineId = medicineMap.get(String(r.name).toLowerCase())?.id ?? null;
      const supplierId = r.supplier_name ? supplierMap.get(String(r.supplier_name).toLowerCase())?.id ?? null : null;
      if (!medicineId) {
        results.batches.skipped++;
        results.batches.errors.push({ line: item.line, row: r.batch_number, error: `medicine "${r.name}" could not be created/found` });
        continue;
      }
      newBatchRows.push([
        medicineId,
        supplierId,
        r.batch_number,
        r.quantity_received,
        r.quantity_received,
        r.cost_price ?? null,
        r.selling_price ?? null,
        r.manufacture_date || null,
        r.expiry_date
      ]);
    }

    if (newBatchRows.length) {
      // Multi-row batched INSERT (chunked for very large files)
      let insertedCount = 0;
      for (const chunk of chunkArray(newBatchRows)) {
        const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
        const [insertResult] = await conn.query(
          `INSERT INTO batches
             (medicine_id, supplier_id, batch_number, quantity_received, quantity_remaining, cost_price, selling_price, manufacture_date, expiry_date)
           VALUES ${placeholders}`,
          chunk.flat()
        );
        insertedCount += insertResult.affectedRows;
      }
      results.batches.imported = insertedCount;

      const batchKeys = newBatchRows.map((r) => r[2].toLowerCase());
      const [freshBatchRows] = await conn.query(
        `SELECT id, batch_number, quantity_remaining FROM batches WHERE batch_number IN (${batchKeys.map(() => '?').join(',')})`,
        batchKeys
      );
      for (const fbr of freshBatchRows) {
        batchIdByNumber.set(fbr.batch_number.toLowerCase(), fbr.id);
      }
    }

    // ── 6. Transactions (OPTIONAL — only rows that have both type + quantity) ──
    // In-memory quantity tracking: locks each batch ONCE (first encounter),
    // then applies subsequent deltas to the in-memory value before one batched write.
    let txCount = 0;
    const txInserts = [];       // rows for batched stock_transactions INSERT
    const qtyMap = new Map();   // batchId → { newQty, originalStatus }
    for (const item of validRows) {
      const r = item.normalized;
      const txType = r.transaction_type;
      const txQty = r.transaction_quantity;
      if (!txType || txQty === null || txQty === undefined) continue; // optional — skip cleanly

      const batchKey = String(r.batch_number).toLowerCase();
      const batchId = batchIdByNumber.get(batchKey);
      if (!batchId) {
        results.transactions.skipped++;
        results.transactions.errors.push({ line: item.line, row: r.batch_number, error: `batch "${r.batch_number}" not found` });
        continue;
      }

      const isReduction = ['sale', 'disposal'].includes(txType);
      const delta = isReduction ? -Math.abs(txQty) : txQty;

      // First encounter: lock the batch row and read its current quantity + status.
      // Subsequent rows for the same batch use the in-memory tracked value.
      let current;
      if (qtyMap.has(batchId)) {
        current = qtyMap.get(batchId).newQty;
      } else {
        const [batchRow] = await conn.query(
          'SELECT quantity_remaining, status FROM batches WHERE id = ? FOR UPDATE',
          [batchId]
        );
        if (!batchRow.length) {
          results.transactions.skipped++;
          results.transactions.errors.push({ line: item.line, row: r.batch_number, error: 'batch not found' });
          continue;
        }
        current = batchRow[0].quantity_remaining;
        qtyMap.set(batchId, { newQty: current, originalStatus: batchRow[0].status || 'active' });
      }

      const newQty = current + delta;
      if (newQty < 0) {
        results.transactions.skipped++;
        results.transactions.errors.push({ line: item.line, row: r.batch_number, error: `Insufficient stock. Only ${current} remaining in this batch.` });
        continue;
      }

      qtyMap.set(batchId, { newQty, originalStatus: qtyMap.get(batchId).originalStatus });
      txInserts.push([batchId, userId, txType, delta, r.reason || null, r.transaction_date || null]);
      txCount++;
    }
    results.transactions.imported = txCount;

    // Apply all quantity updates in one pass — preserve original status unless depleted
    for (const [batchId, { newQty, originalStatus }] of qtyMap) {
      await conn.query('UPDATE batches SET quantity_remaining = ?, status = ? WHERE id = ?', [
        newQty,
        newQty === 0 ? 'depleted' : (originalStatus || 'active'),
        batchId
      ]);
    }

    // Insert all transactions with one multi-row INSERT (chunked)
    for (const chunk of chunkArray(txInserts)) {
      const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))').join(',');
      await conn.query(
        `INSERT INTO stock_transactions (batch_id, user_id, transaction_type, quantity, reason, created_at)
         VALUES ${placeholders}`,
        chunk.flat()
      );
    }

    await conn.commit();

    // Aggregate top-level counts
    results.imported = results.batches.imported;
    results.skipped = results.total - results.batches.imported;
    results.medicines.imported = results.medicines.imported || 0;
    results.suppliers.imported = results.suppliers.imported || 0;

    // Build combined error list with entity tags
    const allErrors = [];
    for (const e of results.batches.errors) allErrors.push({ line: e.line, row: e.row, error: `[batch] ${e.error}` });
    for (const e of results.medicines.errors) allErrors.push({ line: e.line, row: e.row, error: `[medicine] ${e.error}` });
    for (const e of results.suppliers.errors) allErrors.push({ line: e.line, row: e.row, error: `[supplier] ${e.error}` });
    for (const e of results.transactions.errors) allErrors.push({ line: e.line, row: e.row, error: `[transaction] ${e.error}` });
    results.errors = allErrors;

    return results;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ─── Analysis (preview without importing) ──────────────────────────────────

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
  const previewRows = [];
  for (let index = 0; index < rows.length; index++) {
    const normalized = buildNormalizedRow(rows[index], mapping, schema);
    const errors = validateRow(normalized, schema);
    if (schema.validateRow) {
      const extraErrors = await schema.validateRow(normalized, lookups) || [];
      errors.push(...extraErrors);
    }
    previewRows.push({
      line: index + 2,
      data: normalized,
      valid: errors.length === 0,
      errors
    });
  }

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

// ─── Import execution ──────────────────────────────────────────────────────

/**
 * Execute the import — writes data to the database.
 *
 * @param {string} csv - Raw CSV text
 * @param {object} schema - Schema definition (from importSchemas)
 * @param {number} userId - ID of the user performing the import
 * @param {object} req - Express request object (for audit logging / IP)
 * @returns {Promise<{total, imported, skipped, errors}>}
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
      const extraErrors = await schema.validateRow(normalized, lookups) || [];
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

module.exports = { analyzeCsv, importCsv, importCombinedCsv };

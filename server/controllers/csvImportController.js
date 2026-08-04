const { pool } = require('../config/db');
const medicineModel = require('../models/medicineModel');
const supplierModel = require('../models/supplierModel');
const batchModel = require('../models/batchModel');
const {
  parseCsvText, parseBoolean, parseNumber, parseDate, validateRow,
  MEDICINE_HEADERS, BATCH_HEADERS, SUPPLIER_HEADERS
} = require('../utils/csvImport');

async function logAudit(userId, action, details, req) {
  await pool.query(
    'INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)',
    [userId, action, details, req.ip]
  );
}

async function importMedicines(req, res) {
  const { csv } = req.body;
  if (!csv || typeof csv !== 'string') {
    return res.status(400).json({ error: 'CSV content is required' });
  }

  let parsed;
  try {
    parsed = parseCsvText(csv);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const { rows } = parsed;
  const results = { total: rows.length, imported: 0, skipped: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const lineNumber = i + 2; // +2 because line 1 is the header
    const fieldErrors = validateRow(row, MEDICINE_HEADERS, ['name', 'unit']);

    if (fieldErrors.length) {
      results.skipped++;
      results.errors.push({ line: lineNumber, row: row.name || `Row ${lineNumber}`, error: fieldErrors.join(', ') });
      continue;
    }

    try {
      await medicineModel.create({
        name: row.name,
        generic_name: row.generic_name || null,
        category: row.category || 'Other',
        dosage_form: row.dosage_form || null,
        strength: row.strength || null,
        unit: row.unit,
        reorder_level: parseNumber(row.reorder_level) ?? 10,
        requires_prescription: parseBoolean(row.requires_prescription)
      });
      results.imported++;
    } catch (err) {
      results.skipped++;
      results.errors.push({ line: lineNumber, row: row.name || `Row ${lineNumber}`, error: err.message });
    }
  }

  await logAudit(req.user.id, 'imported_medicines', `Imported ${results.imported} of ${results.total} medicines from CSV`, req);
  res.json(results);
}

async function importSuppliers(req, res) {
  const { csv } = req.body;
  if (!csv || typeof csv !== 'string') {
    return res.status(400).json({ error: 'CSV content is required' });
  }

  let parsed;
  try {
    parsed = parseCsvText(csv);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const { rows } = parsed;
  const results = { total: rows.length, imported: 0, skipped: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const lineNumber = i + 2;
    const fieldErrors = validateRow(row, SUPPLIER_HEADERS, ['name']);

    if (fieldErrors.length) {
      results.skipped++;
      results.errors.push({ line: lineNumber, row: row.name || `Row ${lineNumber}`, error: fieldErrors.join(', ') });
      continue;
    }

    try {
      await supplierModel.create({
        name: row.name,
        contact_person: row.contact_person || null,
        phone: row.phone || null,
        email: row.email || null,
        address: row.address || null
      });
      results.imported++;
    } catch (err) {
      results.skipped++;
      results.errors.push({ line: lineNumber, row: row.name || `Row ${lineNumber}`, error: err.message });
    }
  }

  await logAudit(req.user.id, 'imported_suppliers', `Imported ${results.imported} of ${results.total} suppliers from CSV`, req);
  res.json(results);
}

async function importBatches(req, res) {
  const { csv } = req.body;
  if (!csv || typeof csv !== 'string') {
    return res.status(400).json({ error: 'CSV content is required' });
  }

  let parsed;
  try {
    parsed = parseCsvText(csv);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const { rows } = parsed;
  const results = { total: rows.length, imported: 0, skipped: 0, errors: [] };

  // Load existing medicines and suppliers for lookup
  const [medicines] = await pool.query('SELECT id, name FROM medicines');
  const [suppliers] = await pool.query('SELECT id, name FROM suppliers');
  const medicineMap = new Map(medicines.map((m) => [m.name.toLowerCase(), m.id]));
  const supplierMap = new Map(suppliers.map((s) => [s.name.toLowerCase(), s.id]));

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const lineNumber = i + 2;
    const fieldErrors = validateRow(row, BATCH_HEADERS, ['medicine_name', 'batch_number', 'quantity_received', 'expiry_date']);

    if (fieldErrors.length) {
      results.skipped++;
      results.errors.push({ line: lineNumber, row: row.batch_number || `Row ${lineNumber}`, error: fieldErrors.join(', ') });
      continue;
    }

    const medicineId = medicineMap.get(row.medicine_name.toLowerCase());
    if (!medicineId) {
      results.skipped++;
      results.errors.push({ line: lineNumber, row: row.batch_number, error: `medicine "${row.medicine_name}" not found in catalog` });
      continue;
    }

    const expiryDate = parseDate(row.expiry_date);
    if (!expiryDate) {
      results.skipped++;
      results.errors.push({ line: lineNumber, row: row.batch_number, error: `invalid expiry_date "${row.expiry_date}"` });
      continue;
    }

    if (new Date(expiryDate) <= new Date()) {
      results.skipped++;
      results.errors.push({ line: lineNumber, row: row.batch_number, error: 'expiry_date must be in the future' });
      continue;
    }

    const supplierId = row.supplier_name ? supplierMap.get(row.supplier_name.toLowerCase()) : null;
    if (row.supplier_name && !supplierId) {
      results.skipped++;
      results.errors.push({ line: lineNumber, row: row.batch_number, error: `supplier "${row.supplier_name}" not found` });
      continue;
    }

    try {
      await batchModel.create({
        medicine_id: medicineId,
        supplier_id: supplierId,
        batch_number: row.batch_number,
        quantity_received: parseNumber(row.quantity_received),
        cost_price: parseNumber(row.cost_price),
        selling_price: parseNumber(row.selling_price),
        manufacture_date: parseDate(row.manufacture_date),
        expiry_date: expiryDate
      });
      results.imported++;
    } catch (err) {
      results.skipped++;
      results.errors.push({ line: lineNumber, row: row.batch_number, error: err.message });
    }
  }

  await logAudit(req.user.id, 'imported_batches', `Imported ${results.imported} of ${results.total} batches from CSV`, req);
  res.json(results);
}

module.exports = { importMedicines, importSuppliers, importBatches };
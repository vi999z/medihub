const medicineModel = require('../models/medicineModel');
const { pool } = require('../config/db');
const { logAudit } = require('../utils/auditLogger');
const { parse } = require('csv-parse');
const fs = require('fs');
const {
  createNearExpiryAlert,
  createExpiredAlert,
  createLowStockAlert
} = require('../utils/alertHelpers');

const MEDICINE_COLUMNS = ['name', 'generic_name', 'category', 'dosage_form', 'strength', 'unit', 'reorder_level', 'requires_prescription'];
const BATCH_COLUMNS = ['batch_number', 'quantity_received', 'cost_price', 'selling_price', 'manufacture_date', 'expiry_date', 'supplier_name'];

async function getAll(req, res) {
  const medicines = await medicineModel.getAll();
  res.json(medicines);
}

async function getOne(req, res) {
  const medicine = await medicineModel.getById(req.params.id);
  if (!medicine) return res.status(404).json({ error: 'Medicine not found' });
  res.json(medicine);
}

async function create(req, res) {
  const { name, unit } = req.body;
  if (!name || !unit) {
    return res.status(400).json({ error: 'name and unit are required' });
  }
  const id = await medicineModel.create(req.body);
  await logAudit(req.user.id, 'created_medicine', `Created medicine: ${name}`, req);
  res.status(201).json({ id, ...req.body });
}

async function update(req, res) {
  const existing = await medicineModel.getById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Medicine not found' });

  await medicineModel.update(req.params.id, req.body);
  await logAudit(req.user.id, 'updated_medicine', `Updated medicine id ${req.params.id}`, req);
  res.json({ id: req.params.id, ...req.body });
}

async function remove(req, res) {
  const existing = await medicineModel.getById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Medicine not found' });

  // Clean up all notifications referencing this medicine or its batches before CASCADE deletes them
  // low_stock & ai_reorder_suggestion reference medicine_id; near_expiry, expired & ai_risk_flag reference batch_id
  const [batchIds] = await pool.query('SELECT id FROM batches WHERE medicine_id = ?', [req.params.id]);
  const batchIdList = batchIds.map((b) => b.id);

  await pool.query('DELETE FROM notifications WHERE type IN (?, ?) AND reference_id = ?', ['low_stock', 'ai_reorder_suggestion', req.params.id]);
  if (batchIdList.length) {
    await pool.query('DELETE FROM notifications WHERE type IN (?, ?, ?) AND reference_id IN (?)', ['near_expiry', 'expired', 'ai_risk_flag', batchIdList]);
  }

  await medicineModel.remove(req.params.id);
  await logAudit(req.user.id, 'deleted_medicine', `Deleted medicine: ${existing.name}`, req);
  res.status(204).send();
}

function hasBatchData(row) {
  return BATCH_COLUMNS.some((col) => row[col] && String(row[col]).trim() !== '');
}

function normalizeBoolean(value) {
  return ['true', 'yes', '1'].includes(String(value).toLowerCase());
}

async function validateCsvImport(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const results = [];
  const requiredColumns = ['name', 'unit'];
  const optionalColumns = ['generic_name', 'category', 'dosage_form', 'strength', 'reorder_level', 'requires_prescription'];

  // Get existing medicine names for duplicate check
  const [existingMedicines] = await pool.query('SELECT name FROM medicines');
  const existingNames = new Set(existingMedicines.map(m => m.name.toLowerCase()));

  const parser = parse({
    columns: true,
    skip_empty_lines: true,
    trim: true
  });

  parser.on('data', (row) => {
    const rowNum = parser.info.lines;
    const errors = [];
    const warnings = [];

    // Check required fields
    requiredColumns.forEach(col => {
      if (!row[col] || row[col].trim() === '') {
        errors.push(`Missing required field: ${col}`);
      }
    });

    // Validate data types
    if (row.reorder_level && isNaN(Number(row.reorder_level))) {
      errors.push('reorder_level must be a number');
    }

    if (row.requires_prescription && !['true', 'false', 'yes', 'no', '1', '0'].includes(row.requires_prescription.toLowerCase())) {
      errors.push('requires_prescription must be true/false, yes/no, or 1/0');
    }

    // Check for duplicate names
    if (row.name && existingNames.has(row.name.toLowerCase())) {
      errors.push('Medicine name already exists');
    }

    // Validate category if provided
    if (row.category) {
      const normalizedCategory = medicineModel.normalizeCategory(row.category);
      if (!medicineModel.CATEGORY_OPTIONS.includes(normalizedCategory) && normalizedCategory !== row.category.trim()) {
        warnings.push(`Category will be normalized to: ${normalizedCategory}`);
      }
    }

    // Batch validation (only when batch data is present)
    const hasBatch = hasBatchData(row);
    if (hasBatch) {
      if (!row.batch_number || row.batch_number.trim() === '') {
        errors.push('Missing required field: batch_number');
      }
      if (!row.quantity_received || isNaN(Number(row.quantity_received)) || Number(row.quantity_received) <= 0) {
        errors.push('quantity_received must be a positive number');
      }
      if (!row.expiry_date) {
        errors.push('Missing required field: expiry_date');
      } else {
        const expiry = new Date(row.expiry_date);
        if (isNaN(expiry.getTime())) {
          errors.push('expiry_date must be a valid date (YYYY-MM-DD)');
        }
      }
      if (row.cost_price && isNaN(Number(row.cost_price))) {
        errors.push('cost_price must be a number');
      }
      if (row.selling_price && isNaN(Number(row.selling_price))) {
        errors.push('selling_price must be a number');
      }
      if (row.manufacture_date && isNaN(new Date(row.manufacture_date).getTime())) {
        errors.push('manufacture_date must be a valid date (YYYY-MM-DD)');
      }
    }

    results.push({
      row: rowNum,
      data: row,
      valid: errors.length === 0,
      errors,
      warnings,
      hasBatch
    });
  });

  parser.on('end', async () => {
    // Clean up uploaded file
    fs.unlink(req.file.path, (err) => {
      if (err) console.error('Error deleting temp file:', err);
    });

    res.json({
      totalRows: results.length,
      validRows: results.filter(r => r.valid).length,
      invalidRows: results.filter(r => !r.valid).length,
      results
    });
  });

  parser.on('error', (err) => {
    fs.unlink(req.file.path, () => {});
    res.status(400).json({ error: `CSV parsing error: ${err.message}` });
  });

  fs.createReadStream(req.file.path).pipe(parser);
}

async function resolveSupplierId(conn, supplierName) {
  if (!supplierName || String(supplierName).trim() === '') return null;
  const name = String(supplierName).trim();

  const [existing] = await conn.query('SELECT id FROM suppliers WHERE name = ?', [name]);
  if (existing.length) return existing[0].id;

  const [result] = await conn.query('INSERT INTO suppliers (name) VALUES (?)', [name]);
  return result.insertId;
}

async function commitCsvImport(req, res) {
  const { results } = req.body;

  if (!Array.isArray(results)) {
    return res.status(400).json({ error: 'Invalid results format' });
  }

  const validRows = results.filter(r => r.valid);
  const created = [];
  const failed = [];
  let batchesCreated = 0;
  let alertsCreated = 0;

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    for (const row of validRows) {
      try {
        const data = {
          name: row.data.name,
          generic_name: row.data.generic_name || '',
          category: row.data.category || 'Other',
          dosage_form: row.data.dosage_form || '',
          strength: row.data.strength || '',
          unit: row.data.unit,
          reorder_level: row.data.reorder_level ? Number(row.data.reorder_level) : 10,
          requires_prescription: normalizeBoolean(row.data.requires_prescription)
        };

        const [medicineResult] = await conn.query(
          `INSERT INTO medicines (name, generic_name, category, dosage_form, strength, unit, reorder_level, requires_prescription)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [data.name, data.generic_name, medicineModel.normalizeCategory(data.category), data.dosage_form, data.strength, data.unit, data.reorder_level, data.requires_prescription]
        );
        const medicineId = medicineResult.insertId;
        created.push({ id: medicineId, name: data.name });

        // Create batch if batch data is present
        if (row.hasBatch) {
          const supplierId = await resolveSupplierId(conn, row.data.supplier_name);
          const quantityReceived = Number(row.data.quantity_received);
          const expiryDate = row.data.expiry_date;
          const isExpired = new Date(expiryDate) < new Date(new Date().toDateString());

          const [batchResult] = await conn.query(
            `INSERT INTO batches
             (medicine_id, supplier_id, batch_number, quantity_received, quantity_remaining, cost_price, selling_price, manufacture_date, expiry_date, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              medicineId,
              supplierId,
              row.data.batch_number,
              quantityReceived,
              quantityReceived,
              row.data.cost_price ? Number(row.data.cost_price) : null,
              row.data.selling_price ? Number(row.data.selling_price) : null,
              row.data.manufacture_date || null,
              expiryDate,
              isExpired ? 'expired' : 'active'
            ]
          );
          const batchId = batchResult.insertId;
          batchesCreated++;

          // Generate alerts immediately
          const batchForAlert = {
            id: batchId,
            batch_number: row.data.batch_number,
            expiry_date: expiryDate,
            quantity_remaining: quantityReceived,
            medicine_name: data.name
          };

          if (isExpired) {
            if (await createExpiredAlert(batchForAlert)) alertsCreated++;
          } else {
            const alertType = await createNearExpiryAlert(batchForAlert);
            if (alertType) alertsCreated++;
          }

          // Low stock check for the medicine
          const medicineForAlert = {
            id: medicineId,
            name: data.name,
            reorder_level: data.reorder_level,
            total_remaining: quantityReceived
          };
          if (await createLowStockAlert(medicineForAlert)) alertsCreated++;
        }
      } catch (err) {
        failed.push({ name: row.data.name, error: err.message });
      }
    }

    await conn.commit();

    await logAudit(
      req.user.id,
      'csv_import_medicines',
      `CSV import: ${created.length} created, ${batchesCreated} batches, ${alertsCreated} alerts, ${failed.length} failed`,
      req
    );

    res.json({
      created: created.length,
      batchesCreated,
      alertsCreated,
      failed: failed.length,
      createdDetails: created,
      failedDetails: failed
    });
  } catch (err) {
    await conn.rollback();
    console.error('CSV import transaction failed:', err);
    res.status(500).json({ error: 'Failed to import data' });
  } finally {
    conn.release();
  }
}

async function downloadCsvTemplate(req, res) {
  const headers = [...MEDICINE_COLUMNS, ...BATCH_COLUMNS];
  const exampleRow = [
    'Paracetamol',
    'Acetaminophen',
    'Analgesic',
    'Tablet',
    '500mg',
    'tablet',
    '50',
    'false',
    'BATCH-001',
    '100',
    '5.00',
    '8.00',
    '2025-01-15',
    '2026-01-15',
    'MedSupply Co.'
  ];

  const csv = [
    headers.join(','),
    exampleRow.join(',')
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=medicines_template.csv');
  res.send(csv);
}

module.exports = { getAll, getOne, create, update, remove, validateCsvImport, commitCsvImport, downloadCsvTemplate };
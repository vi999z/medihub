const medicineModel = require('../models/medicineModel');
const { pool } = require('../config/db');
const { logAudit } = require('../utils/auditLogger');
const { validateMedicine, validateBatch, validateSupplier } = require('../utils/validators');
const { parse } = require('csv-parse');
const fs = require('fs');
const path = require('path');
const { UPLOADS_ROOT } = require('../config/uploadPaths');
const cloudinary = require('../config/cloudinary');
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

function parseMedicine(body) {
  return validateMedicine(body, {
    categoryOptions: medicineModel.CATEGORY_OPTIONS,
    branchOptions: medicineModel.BRANCH_OPTIONS,
  });
}

// The same product (name + strength + dosage form) can only be listed once
// per branch. `excludeId` skips the medicine being edited.
async function findDuplicate(medicine, excludeId = 0) {
  const [rows] = await pool.query(
    `SELECT id FROM medicines
     WHERE LOWER(name) = LOWER(?) AND LOWER(COALESCE(strength, '')) = LOWER(?)
       AND LOWER(COALESCE(dosage_form, '')) = LOWER(?) AND branch = ? AND id <> ?
     LIMIT 1`,
    [medicine.name, medicine.strength || '', medicine.dosage_form || '', medicine.branch, excludeId]
  );
  return rows[0];
}

const DUPLICATE_MEDICINE_ERROR = 'This medicine (same name, strength and dosage form) is already listed for this branch';

async function create(req, res) {
  const { value, error } = parseMedicine(req.body);
  if (error) return res.status(400).json({ error });
  if (await findDuplicate(value)) return res.status(409).json({ error: DUPLICATE_MEDICINE_ERROR });

  const id = await medicineModel.create(value);
  await logAudit(req.user.id, 'created_medicine', `Created medicine: ${value.name}`, req);
  res.status(201).json({ id, ...value });
}

async function update(req, res) {
  const existing = await medicineModel.getById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Medicine not found' });

  const { value, error } = parseMedicine(req.body);
  if (error) return res.status(400).json({ error });
  if (await findDuplicate(value, existing.id)) return res.status(409).json({ error: DUPLICATE_MEDICINE_ERROR });

  await medicineModel.update(req.params.id, value);
  await logAudit(req.user.id, 'updated_medicine', `Updated medicine: ${value.name}`, req);
  res.json({ id: Number(req.params.id), ...value });
}

async function remove(req, res) {
  const existing = await medicineModel.getById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Medicine not found' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Clean up all notifications referencing this medicine or its batches before CASCADE deletes them
    // low_stock & ai_reorder_suggestion reference medicine_id; near_expiry, expired & ai_risk_flag reference batch_id
    const [batchIds] = await conn.query('SELECT id FROM batches WHERE medicine_id = ?', [req.params.id]);
    const batchIdList = batchIds.map((b) => b.id);

    await conn.query('DELETE FROM notifications WHERE type IN (?, ?) AND reference_id = ?', ['low_stock', 'ai_reorder_suggestion', req.params.id]);
    if (batchIdList.length) {
      await conn.query('DELETE FROM notifications WHERE type IN (?, ?, ?) AND reference_id IN (?)', ['near_expiry', 'expired', 'ai_risk_flag', batchIdList]);
    }

    await conn.query('DELETE FROM medicines WHERE id = ?', [req.params.id]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  deleteOldImage(existing.image_url);
  await logAudit(req.user.id, 'deleted_medicine', `Deleted medicine: ${existing.name}`, req);
  res.status(204).send();
}

// Best-effort cleanup of a previously-uploaded photo when it's replaced or
// removed. Medicine photos now live on Cloudinary (see medicineRoutes.js) so
// they survive Render deploys/restarts; this also still handles the old
// local-disk path format for any medicine photographed before that change.
function deleteOldImage(imageUrl) {
  if (!imageUrl) return;
  if (imageUrl.startsWith('/uploads/medicines/')) {
    fs.unlink(path.join(UPLOADS_ROOT, imageUrl.replace(/^\/uploads\//, '')), () => {});
    return;
  }
  const match = imageUrl.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-zA-Z0-9]+)?$/);
  if (match) {
    cloudinary.uploader.destroy(match[1]).catch(() => {});
  }
}

async function uploadImage(req, res) {
  const existing = await medicineModel.getById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Medicine not found' });
  if (!req.file) return res.status(400).json({ error: 'No image file uploaded' });

  const imageUrl = req.file.path;
  await medicineModel.setImage(req.params.id, imageUrl);
  deleteOldImage(existing.image_url);
  await logAudit(req.user.id, 'updated_medicine_image', `Updated photo for medicine: ${existing.name}`, req);
  res.json({ id: req.params.id, image_url: imageUrl });
}

async function removeImage(req, res) {
  const existing = await medicineModel.getById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Medicine not found' });

  await medicineModel.setImage(req.params.id, null);
  deleteOldImage(existing.image_url);
  await logAudit(req.user.id, 'updated_medicine_image', `Removed photo for medicine: ${existing.name}`, req);
  res.json({ id: req.params.id, image_url: null });
}

function hasBatchData(row) {
  return BATCH_COLUMNS.some((col) => row[col] && String(row[col]).trim() !== '');
}

// Validates one CSV row with the same rules as the Add medicine / Receive
// stock forms. Used when previewing a file AND again when committing it, so
// the server never trusts the preview's "valid" flags sent back by the browser.
function checkCsvRow(row, existingNames) {
  const errors = [];
  const warnings = [];

  const medicine = parseMedicine(row);
  if (medicine.error) errors.push(medicine.error);
  if (row.requires_prescription && !['true', 'false', 'yes', 'no', '1', '0'].includes(String(row.requires_prescription).trim().toLowerCase())) {
    errors.push('requires_prescription must be true/false, yes/no, or 1/0');
  }
  if (row.name && existingNames.has(String(row.name).trim().toLowerCase())) {
    errors.push('Medicine name already exists');
  }
  if (medicine.value && row.category && !medicineModel.CATEGORY_OPTIONS.includes(medicine.value.category)) {
    warnings.push(`"${medicine.value.category}" is not a standard category`);
  }

  const hasBatch = hasBatchData(row);
  let batch = null;
  if (hasBatch) {
    batch = validateBatch(row, undefined, { withoutMedicine: true, allowPastExpiry: true });
    if (batch.error) errors.push(batch.error);
    else if (batch.value.status === 'expired') warnings.push('Batch is already expired and will be imported as expired');
    // New supplier names are created on import, so they get the same check
    // as the Add supplier form.
    if (row.supplier_name && String(row.supplier_name).trim()) {
      const supplier = validateSupplier({ name: row.supplier_name });
      if (supplier.error) errors.push(supplier.error);
    }
  }

  return { errors, warnings, hasBatch, medicine: medicine.value, batch: batch?.value };
}

async function validateCsvImport(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const results = [];

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
    const { errors, warnings, hasBatch } = checkCsvRow(row, existingNames);
    // Later rows with the same name in this file are duplicates too.
    if (row.name) existingNames.add(String(row.name).trim().toLowerCase());

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

  // Only rows the preview marked valid are imported, but each is re-checked
  // here — the flags come from the browser and can't be trusted.
  const rows = results.filter(r => r && r.valid);
  const [existingMedicines] = await pool.query('SELECT name FROM medicines');
  const existingNames = new Set(existingMedicines.map((m) => m.name.toLowerCase()));
  const created = [];
  const failed = [];
  let batchesCreated = 0;
  let alertsCreated = 0;

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    for (const row of rows) {
      try {
        const check = checkCsvRow(row.data || {}, existingNames);
        if (check.errors.length) {
          failed.push({ name: row.data?.name || `Row ${row.row}`, error: check.errors.join('; ') });
          continue;
        }
        const data = check.medicine;
        existingNames.add(data.name.toLowerCase());

        const [medicineResult] = await conn.query(
          `INSERT INTO medicines (name, generic_name, category, dosage_form, strength, unit, reorder_level, requires_prescription, branch)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [data.name, data.generic_name, data.category, data.dosage_form, data.strength, data.unit, data.reorder_level, data.requires_prescription, data.branch]
        );
        const medicineId = medicineResult.insertId;
        created.push({ id: medicineId, name: data.name });

        // Create batch if batch data is present
        if (check.hasBatch) {
          const b = check.batch;
          const supplierId = await resolveSupplierId(conn, row.data.supplier_name);
          const quantityReceived = b.quantity_received;
          const expiryDate = b.expiry_date;
          const isExpired = b.status === 'expired';

          const [batchResult] = await conn.query(
            `INSERT INTO batches
             (medicine_id, supplier_id, batch_number, quantity_received, quantity_remaining, cost_price, selling_price, manufacture_date, expiry_date, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [medicineId, supplierId, b.batch_number, quantityReceived, quantityReceived, b.cost_price, b.selling_price, b.manufacture_date, expiryDate, b.status]
          );
          const batchId = batchResult.insertId;
          batchesCreated++;
          await conn.query(
            "INSERT INTO stock_transactions (batch_id, user_id, transaction_type, quantity, reason) VALUES (?, ?, 'stock_in', ?, ?)",
            [batchId, req.user.id, quantityReceived, 'Stock received (CSV import)']
          );

          // Generate alerts immediately
          const batchForAlert = {
            id: batchId,
            batch_number: check.batch.batch_number,
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
    'Sample Supplier'
  ];

  const csv = [
    headers.join(','),
    exampleRow.join(',')
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=medicines_template.csv');
  res.send(csv);
}

module.exports = { getAll, getOne, create, update, remove, uploadImage, removeImage, validateCsvImport, commitCsvImport, downloadCsvTemplate };
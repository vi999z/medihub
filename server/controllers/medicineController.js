const medicineModel = require('../models/medicineModel');
const { pool } = require('../config/db');
const { parse } = require('csv-parse');
const fs = require('fs');

async function logAudit(userId, action, details, req) {
  await pool.query(
    'INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)',
    [userId, action, details, req.ip]
  );
}

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

    results.push({
      row: rowNum,
      data: row,
      valid: errors.length === 0,
      errors,
      warnings
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

async function commitCsvImport(req, res) {
  const { results } = req.body;
  
  if (!Array.isArray(results)) {
    return res.status(400).json({ error: 'Invalid results format' });
  }

  const validRows = results.filter(r => r.valid);
  const created = [];
  const failed = [];

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
        requires_prescription: ['true', 'yes', '1'].includes(String(row.data.requires_prescription).toLowerCase())
      };

      const id = await medicineModel.create(data);
      created.push({ id, name: data.name });
    } catch (err) {
      failed.push({ name: row.data.name, error: err.message });
    }
  }

  await logAudit(
    req.user.id,
    'csv_import_medicines',
    `CSV import: ${created.length} created, ${failed.length} failed`,
    req
  );

  res.json({
    created: created.length,
    failed: failed.length,
    createdDetails: created,
    failedDetails: failed
  });
}

async function downloadCsvTemplate(req, res) {
  const headers = ['name', 'generic_name', 'category', 'dosage_form', 'strength', 'unit', 'reorder_level', 'requires_prescription'];
  const exampleRow = [
    'Paracetamol',
    'Acetaminophen',
    'Analgesic',
    'Tablet',
    '500mg',
    'tablet',
    '50',
    'false'
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
const batchModel = require('../models/batchModel');
const medicineModel = require('../models/medicineModel');
const { pool } = require('../config/db');
const { logAudit } = require('../utils/auditLogger');
const { validateBatch } = require('../utils/validators');

async function getAll(req, res) {
  const batches = await batchModel.getAll();
  res.json(batches);
}

async function getOne(req, res) {
  const batch = await batchModel.getById(req.params.id);
  if (!batch) return res.status(404).json({ error: 'Batch not found' });
  res.json(batch);
}

async function getByMedicine(req, res) {
  const batches = await batchModel.getByMedicine(req.params.medicineId);
  res.json(batches);
}

// Shared checks that need the database: the medicine/supplier exist and the
// batch number isn't already used for this medicine.
async function checkReferences(value, excludeBatchId = 0) {
  const medicine = await medicineModel.getById(value.medicine_id);
  if (!medicine) return { status: 400, error: 'Select a medicine' };
  if (value.supplier_id) {
    const [suppliers] = await pool.query('SELECT id FROM suppliers WHERE id = ?', [value.supplier_id]);
    if (!suppliers.length) return { status: 400, error: 'Choose a valid supplier' };
  }
  const [dupes] = await pool.query(
    'SELECT id FROM batches WHERE medicine_id = ? AND LOWER(batch_number) = LOWER(?) AND id <> ? LIMIT 1',
    [value.medicine_id, value.batch_number, excludeBatchId]
  );
  if (dupes.length) return { status: 409, error: `Batch ${value.batch_number} already exists for ${medicine.name}` };
  return { medicine };
}

async function create(req, res) {
  const { value, error } = validateBatch(req.body);
  if (error) return res.status(400).json({ error });

  const refs = await checkReferences(value);
  if (refs.error) return res.status(refs.status).json({ error: refs.error });

  const id = await batchModel.create(value);
  await logAudit(req.user.id, 'created_batch', `Received batch ${value.batch_number} for ${refs.medicine.name} (qty: ${value.quantity_received})`, req);

  res.status(201).json({ id, ...value });
}

async function update(req, res) {
  const existing = await batchModel.getById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Batch not found' });

  const { value, error } = validateBatch(req.body, existing);
  if (error) return res.status(400).json({ error });

  const refs = await checkReferences(value, existing.id);
  if (refs.error) return res.status(refs.status).json({ error: refs.error });

  await batchModel.update(req.params.id, value);
  await logAudit(req.user.id, 'updated_batch', `Updated batch ${value.batch_number}`, req);
  res.json({ id: Number(req.params.id), ...existing, ...value });
}

async function remove(req, res) {
  const existing = await batchModel.getById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Batch not found' });

  await batchModel.remove(req.params.id);
  await logAudit(req.user.id, 'deleted_batch', `Deleted batch ${existing.batch_number}`, req);
  res.status(204).send();
}

async function removeDepleted(req, res) {
  const [rows] = await pool.query('SELECT id, batch_number FROM batches WHERE quantity_remaining <= 0');
  if (!rows.length) {
    return res.json({ message: 'No depleted batches to remove.' });
  }

  const ids = rows.map((r) => r.id);
  const [result] = await pool.query('DELETE FROM batches WHERE id IN (?)', [ids]);
  await logAudit(req.user.id, 'removed_depleted_batches', `Removed ${result.affectedRows} depleted batch(es)`, req);

  res.json({ message: `Removed ${result.affectedRows} depleted batch(es).` });
}

module.exports = { getAll, getOne, getByMedicine, create, update, remove, removeDepleted };
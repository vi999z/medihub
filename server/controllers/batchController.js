const batchModel = require('../models/batchModel');
const medicineModel = require('../models/medicineModel');
const branchModel = require('../models/branchModel');
const { pool } = require('../config/db');
const { logAudit } = require('../utils/auditLogger');
const { validateBatch } = require('../utils/validators');
const { refreshAlertsForBatch, refreshLowStockAlert } = require('../utils/alertHelpers');

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

// Shared checks that need the database. A linked batch needs an existing
// medicine; an unlinked one needs an active branch. Either way the supplier must
// exist and the batch number can't repeat (per medicine, or per pending name
// and branch while unlinked).
async function checkReferences(value, excludeBatchId = 0) {
  let label;
  let dupeSql;
  let dupeParams;
  if (value.medicine_id) {
    const medicine = await medicineModel.getById(value.medicine_id);
    if (!medicine) return { status: 400, error: 'Select a medicine', field: 'medicine_id' };
    label = medicine.name;
    dupeSql = 'SELECT id FROM batches WHERE medicine_id = ? AND LOWER(batch_number) = LOWER(?) AND id <> ? LIMIT 1';
    dupeParams = [value.medicine_id, value.batch_number, excludeBatchId];
  } else {
    const branches = await branchModel.activeNames();
    const branch = branches.find((n) => n.toLowerCase() === String(value.pending_branch).toLowerCase());
    // An unlinked batch may keep a branch that was deactivated since.
    if (!branch && !(excludeBatchId && value.pending_branch)) {
      return { status: 400, error: `Branch must be one of: ${branches.join(', ')}`, field: 'pending_branch' };
    }
    if (branch) value.pending_branch = branch;
    label = value.pending_name;
    dupeSql = 'SELECT id FROM batches WHERE medicine_id IS NULL AND LOWER(pending_name) = LOWER(?) AND pending_branch = ? AND LOWER(batch_number) = LOWER(?) AND id <> ? LIMIT 1';
    dupeParams = [value.pending_name, value.pending_branch, value.batch_number, excludeBatchId];
  }
  if (value.supplier_id) {
    const [suppliers] = await pool.query('SELECT id FROM suppliers WHERE id = ?', [value.supplier_id]);
    if (!suppliers.length) return { status: 400, error: 'Choose a valid supplier', field: 'supplier_id' };
  }
  const [dupes] = await pool.query(dupeSql, dupeParams);
  if (dupes.length) return { status: 409, error: `Batch ${value.batch_number} already exists for ${label}`, field: 'batch_number' };
  return { label };
}

async function create(req, res) {
  const { value, error, field } = validateBatch(req.body);
  if (error) return res.status(400).json({ error, field });

  const refs = await checkReferences(value);
  if (refs.error) return res.status(refs.status).json({ error: refs.error, field: refs.field });

  const id = await batchModel.create(value);
  // Receiving stock is a movement too, so it appears in the transaction history.
  await pool.query(
    "INSERT INTO stock_transactions (batch_id, user_id, transaction_type, quantity, reason) VALUES (?, ?, 'stock_in', ?, ?)",
    [id, req.user.id, value.quantity_received, 'Stock received']
  );
  await refreshAlertsForBatch(id);
  await logAudit(req.user.id, 'created_batch', `Received batch ${value.batch_number} for ${refs.label}${value.medicine_id ? '' : ' (not linked to a medicine yet)'} (qty: ${value.quantity_received})`, req);

  res.status(201).json({ id, ...value, linked: Boolean(value.medicine_id) });
}

async function update(req, res) {
  const existing = await batchModel.getById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Batch not found' });

  const { value, error, field } = validateBatch(req.body, existing);
  if (error) return res.status(400).json({ error, field });

  const refs = await checkReferences(value, existing.id);
  if (refs.error) return res.status(refs.status).json({ error: refs.error, field: refs.field });

  await batchModel.update(req.params.id, value);
  await refreshAlertsForBatch(existing.id);
  await logAudit(req.user.id, 'updated_batch', `Updated batch ${value.batch_number}`, req);
  res.json({ id: Number(req.params.id), ...existing, ...value });
}

// POST /api/batches/:id/link { medicine_id } — connect an unlinked batch to a
// catalog medicine. The medicine must be in the branch the batch was received for.
async function link(req, res) {
  const batch = await batchModel.getById(req.params.id);
  if (!batch) return res.status(404).json({ error: 'Batch not found' });
  if (batch.linked) return res.status(409).json({ error: 'This batch is already linked to a medicine' });

  const medicineId = Number(req.body.medicine_id);
  if (!Number.isInteger(medicineId) || medicineId <= 0) return res.status(400).json({ error: 'Choose a medicine to link', field: 'medicine_id' });
  const medicine = await medicineModel.getById(medicineId);
  if (!medicine) return res.status(404).json({ error: 'Medicine not found', field: 'medicine_id' });
  if (batch.pending_branch && batch.pending_branch !== medicine.branch) {
    return res.status(400).json({ error: `This batch was received for ${batch.pending_branch}, but ${medicine.name} belongs to ${medicine.branch}. Pick a ${batch.pending_branch} medicine.`, field: 'medicine_id' });
  }
  const [dupes] = await pool.query(
    'SELECT id FROM batches WHERE medicine_id = ? AND LOWER(batch_number) = LOWER(?) AND id <> ? LIMIT 1',
    [medicineId, batch.batch_number, batch.id]
  );
  if (dupes.length) return res.status(409).json({ error: `${medicine.name} already has a batch ${batch.batch_number}`, field: 'medicine_id' });

  if (!(await batchModel.link(batch.id, medicineId))) return res.status(409).json({ error: 'This batch was just linked by someone else' });
  await refreshAlertsForBatch(batch.id);
  await logAudit(req.user.id, 'linked_batch', `Linked batch ${batch.batch_number} (${batch.medicine_name}) to ${medicine.name}`, req);
  res.json({ id: batch.id, medicine_id: medicineId, linked: true });
}

async function remove(req, res) {
  const existing = await batchModel.getById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Batch not found' });

  await batchModel.remove(req.params.id);
  await refreshLowStockAlert(existing.medicine_id);
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

module.exports = { getAll, getOne, getByMedicine, create, update, link, remove, removeDepleted };
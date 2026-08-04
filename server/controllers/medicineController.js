const medicineModel = require('../models/medicineModel');
const { pool } = require('../config/db');

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

module.exports = { getAll, getOne, create, update, remove };
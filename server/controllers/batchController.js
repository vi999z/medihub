const batchModel = require('../models/batchModel');
const medicineModel = require('../models/medicineModel');
const { pool } = require('../config/db');

async function logAudit(userId, action, details, req) {
  await pool.query(
    'INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)',
    [userId, action, details, req.ip]
  );
}

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

async function create(req, res) {
  const { medicine_id, batch_number, quantity_received, expiry_date } = req.body;

  if (!medicine_id || !batch_number || !quantity_received || !expiry_date) {
    return res.status(400).json({ error: 'medicine_id, batch_number, quantity_received, and expiry_date are required' });
  }

  const medicine = await medicineModel.getById(medicine_id);
  if (!medicine) return res.status(404).json({ error: 'Medicine not found' });

  if (new Date(expiry_date) <= new Date()) {
    return res.status(400).json({ error: 'Expiry date must be in the future' });
  }

  const id = await batchModel.create(req.body);
  await logAudit(req.user.id, 'created_batch', `Received batch ${batch_number} for ${medicine.name} (qty: ${quantity_received})`, req);

  res.status(201).json({ id, ...req.body });
}

module.exports = { getAll, getOne, getByMedicine, create };
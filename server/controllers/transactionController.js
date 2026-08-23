const { pool } = require('../config/db');
const transactionModel = require('../models/transactionModel');
const batchModel = require('../models/batchModel');
const { logAudit } = require('../utils/auditLogger');

// POST /api/transactions
// transaction_type: 'sale' | 'adjustment' | 'disposal' | 'return' (stock_in handled separately via batch creation)
async function create(req, res) {
  const { batch_id, transaction_type, quantity, reason } = req.body;
  const numericQuantity = Number(quantity);

  if (!batch_id || !transaction_type || !quantity) {
    return res.status(400).json({ error: 'batch_id, transaction_type, and quantity are required' });
  }

  if (!Number.isInteger(numericQuantity) || numericQuantity <= 0) {
    return res.status(400).json({ error: 'quantity must be a positive whole number' });
  }

  const validTypes = ['sale', 'adjustment', 'disposal', 'return'];
  if (!validTypes.includes(transaction_type)) {
    return res.status(400).json({ error: `transaction_type must be one of: ${validTypes.join(', ')}` });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [batchRows] = await conn.query('SELECT * FROM batches WHERE id = ? FOR UPDATE', [batch_id]);
    const batch = batchRows[0];

    if (!batch) {
      await conn.rollback();
      return res.status(404).json({ error: 'Batch not found' });
    }

    // Sales, disposals reduce stock. Returns add stock back. Adjustments can go either way (quantity can be negative).
    const isReduction = ['sale', 'disposal'].includes(transaction_type);
    const delta = isReduction ? -numericQuantity : numericQuantity;
    const newQuantity = Number(batch.quantity_remaining) + delta;

    if (newQuantity < 0) {
      await conn.rollback();
      return res.status(400).json({ error: `Insufficient stock. Only ${batch.quantity_remaining} remaining in this batch.` });
    }

    if (newQuantity === 0) {
      await conn.query(
        'UPDATE batches SET quantity_remaining = ?, status = "depleted" WHERE id = ?',
        [newQuantity, batch_id]
      );
    } else if (transaction_type === 'return' && batch.status === 'depleted') {
      await conn.query(
        'UPDATE batches SET quantity_remaining = ?, status = "active" WHERE id = ?',
        [newQuantity, batch_id]
      );
    } else {
      await conn.query('UPDATE batches SET quantity_remaining = ? WHERE id = ?', [newQuantity, batch_id]);
    }

    const [result] = await conn.query(
      `INSERT INTO stock_transactions (batch_id, user_id, transaction_type, quantity, reason)
       VALUES (?, ?, ?, ?, ?)`,
      [batch_id, req.user.id, transaction_type, delta, reason || null]
    );

    await conn.commit();

    await logAudit(req.user.id, 'stock_transaction', `${transaction_type} of ${Math.abs(delta)} on batch ${batch.batch_number}`, req);

    res.status(201).json({ id: result.insertId, batch_id, transaction_type, quantity: delta, new_remaining: newQuantity });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Transaction failed' });
  } finally {
    conn.release();
  }
}

async function getByBatch(req, res) {
  const transactions = await transactionModel.getByBatch(req.params.batchId);
  res.json(transactions);
}

async function getByMedicine(req, res) {
  const transactions = await transactionModel.getByMedicine(req.params.medicineId);
  res.json(transactions);
}

async function getRecent(req, res) {
  const transactions = await transactionModel.getRecent(req.query.limit || 50);
  res.json(transactions);
}

module.exports = { create, getByBatch, getByMedicine, getRecent };
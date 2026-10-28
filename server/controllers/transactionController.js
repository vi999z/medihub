const { pool } = require('../config/db');
const transactionModel = require('../models/transactionModel');
const batchModel = require('../models/batchModel');
const { logAudit } = require('../utils/auditLogger');
const { validateTransaction } = require('../utils/validators');

// POST /api/transactions
// transaction_type: 'sale' | 'adjustment' | 'disposal' | 'return' (stock_in handled separately via batch creation)
async function create(req, res) {
  const { value, error } = validateTransaction(req.body);
  if (error) return res.status(400).json({ error });
  const { batch_id, transaction_type, quantity: numericQuantity, direction, reason } = value;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [batchRows] = await conn.query('SELECT * FROM batches WHERE id = ? FOR UPDATE', [batch_id]);
    const batch = batchRows[0];

    if (!batch) {
      await conn.rollback();
      return res.status(404).json({ error: 'Batch not found' });
    }

    // Expired or recalled stock must never be dispensed — only disposed of.
    if (transaction_type === 'sale' && ['expired', 'recalled'].includes(batch.status)) {
      await conn.rollback();
      return res.status(400).json({ error: `This batch is ${batch.status} and cannot be sold. Record a disposal instead.` });
    }

    // Sales and disposals reduce stock, returns add it back, and adjustments
    // go whichever way `direction` says (a recount can find more or less).
    const isReduction = ['sale', 'disposal'].includes(transaction_type)
      || (transaction_type === 'adjustment' && direction === 'decrease');
    const delta = isReduction ? -numericQuantity : numericQuantity;
    const newQuantity = Number(batch.quantity_remaining) + delta;

    if (newQuantity < 0) {
      await conn.rollback();
      return res.status(400).json({ error: `Insufficient stock. Only ${batch.quantity_remaining} remaining in this batch.` });
    }
    if (newQuantity > Number(batch.quantity_received)) {
      await conn.rollback();
      return res.status(400).json({ error: `That would leave ${newQuantity} in a batch that only received ${batch.quantity_received}.` });
    }

    if (newQuantity === 0) {
      await conn.query(
        "UPDATE batches SET quantity_remaining = ?, status = 'depleted' WHERE id = ?",
        [newQuantity, batch_id]
      );
    } else if (delta > 0 && batch.status === 'depleted') {
      await conn.query(
        "UPDATE batches SET quantity_remaining = ?, status = 'active' WHERE id = ?",
        [newQuantity, batch_id]
      );
    } else {
      await conn.query('UPDATE batches SET quantity_remaining = ? WHERE id = ?', [newQuantity, batch_id]);
    }

    const [result] = await conn.query(
      `INSERT INTO stock_transactions (batch_id, user_id, transaction_type, quantity, reason)
       VALUES (?, ?, ?, ?, ?)`,
      [batch_id, req.user.id, transaction_type, delta, reason]
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
  const { date } = req.query;
  if (date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
  }
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 1000);
  const transactions = await transactionModel.getRecent({ limit, date: date || null });
  res.json(transactions);
}

module.exports = { create, getByBatch, getByMedicine, getRecent };
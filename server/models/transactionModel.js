const { pool } = require('../config/db');
const { startOfLocalDay, addDays } = require('../utils/dates');

async function create({ batch_id, user_id, transaction_type, quantity, reason }) {
  const [result] = await pool.query(
    `INSERT INTO stock_transactions (batch_id, user_id, transaction_type, quantity, reason)
     VALUES (?, ?, ?, ?, ?)`,
    [batch_id, user_id, transaction_type, quantity, reason]
  );
  return result.insertId;
}

async function getByBatch(batchId) {
  const [rows] = await pool.query(
    'SELECT * FROM stock_transactions WHERE batch_id = ? ORDER BY created_at DESC',
    [batchId]
  );
  return rows;
}

async function getByMedicine(medicineId) {
  const [rows] = await pool.query(
    `SELECT st.*, b.batch_number, b.medicine_id
     FROM stock_transactions st
     JOIN batches b ON st.batch_id = b.id
     WHERE b.medicine_id = ?
     ORDER BY st.created_at DESC`,
    [medicineId]
  );
  return rows;
}

// Most recent movements, newest first. With `date` (YYYY-MM-DD), returns
// every movement on that calendar day in the pharmacy's timezone instead.
async function getRecent({ limit = 50, date = null } = {}) {
  const where = date ? 'WHERE st.created_at >= ? AND st.created_at < ?' : '';
  const params = date ? [startOfLocalDay(date), startOfLocalDay(addDays(date, 1))] : [];
  const [rows] = await pool.query(
    `SELECT st.*, b.batch_number, m.name AS medicine_name, u.full_name AS user_name
     FROM stock_transactions st
     JOIN batches b ON st.batch_id = b.id
     JOIN medicines m ON b.medicine_id = m.id
     JOIN users u ON st.user_id = u.id
     ${where}
     ORDER BY st.created_at DESC LIMIT ?`,
    [...params, limit]
  );
  return rows;
}

module.exports = { create, getByBatch, getByMedicine, getRecent };
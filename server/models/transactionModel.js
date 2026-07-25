const { pool } = require('../config/db');

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

async function getRecent(limit = 50) {
  const [rows] = await pool.query(
    `SELECT st.*, b.batch_number, m.name AS medicine_name, u.full_name AS user_name
     FROM stock_transactions st
     JOIN batches b ON st.batch_id = b.id
     JOIN medicines m ON b.medicine_id = m.id
     JOIN users u ON st.user_id = u.id
     ORDER BY st.created_at DESC LIMIT ?`,
    [limit]
  );
  return rows;
}

module.exports = { create, getByBatch, getByMedicine, getRecent };
const { pool } = require('../config/db');

async function clearTransactions(req, res) {
  await pool.query('DELETE FROM stock_transactions');
  res.json({ message: 'Transaction history cleared.' });
}

async function clearLogs(req, res) {
  await pool.query('DELETE FROM audit_logs');
  await pool.query('DELETE FROM notifications');
  res.json({ message: 'Logs and notifications cleared.' });
}

async function removeExpiredBatches(req, res) {
  const [result] = await pool.query('DELETE FROM batches WHERE status = ? OR expiry_date < CURDATE()', ['expired']);
  res.json({ message: `Removed ${result.affectedRows} expired batch(es).` });
}

async function resetSystem(req, res) {
  await pool.query('DELETE FROM stock_transactions');
  await pool.query('DELETE FROM audit_logs');
  await pool.query('DELETE FROM notifications');
  await pool.query('DELETE FROM batches WHERE status = ? OR expiry_date < CURDATE()', ['expired']);
  res.json({ message: 'Pharmacy system reset complete.' });
}

module.exports = { clearTransactions, clearLogs, removeExpiredBatches, resetSystem };

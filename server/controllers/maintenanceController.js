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
  // Get the IDs of expired batches so we can clean up their notifications too
  const [batches] = await pool.query('SELECT id FROM batches WHERE status = ? OR expiry_date < CURDATE()', ['expired']);
  if (batches.length) {
    const batchIdList = batches.map((b) => b.id);
    await pool.query('DELETE FROM notifications WHERE type IN (?, ?, ?) AND reference_id IN (?)', ['near_expiry', 'expired', 'ai_risk_flag', batchIdList]);
  }

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

async function wipeAllData(req, res) {
  await pool.query('DELETE FROM stock_transactions');
  await pool.query('DELETE FROM notifications');
  await pool.query('DELETE FROM batches');
  await pool.query('DELETE FROM medicines');
  await pool.query('DELETE FROM suppliers');
  await pool.query('DELETE FROM ai_models').catch(() => {}); // table only exists once a model has been trained
  res.json({ message: 'All medicines, suppliers, batches, transactions, notifications and AI training history cleared.' });
}

module.exports = { clearTransactions, clearLogs, removeExpiredBatches, resetSystem, wipeAllData };
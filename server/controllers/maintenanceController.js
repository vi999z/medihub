const { pool } = require('../config/db');

// audit_logs itself gets wiped by these operations, so the only durable
// record of who ran a destructive maintenance action is the server log.
function logDestructiveAction(req, action) {
  console.warn(`[MAINTENANCE] ${action} triggered by user ${req.user?.id ?? 'unknown'} (${req.user?.email ?? 'unknown'}) at ${new Date().toISOString()}`);
}

async function clearTransactions(req, res) {
  logDestructiveAction(req, 'clearTransactions');
  await pool.query('DELETE FROM stock_transactions');
  res.json({ message: 'Transaction history cleared.' });
}

async function clearLogs(req, res) {
  logDestructiveAction(req, 'clearLogs');
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
  logDestructiveAction(req, 'resetSystem');
  await pool.query('DELETE FROM stock_transactions');
  await pool.query('DELETE FROM audit_logs');
  await pool.query('DELETE FROM notifications');
  await pool.query('DELETE FROM batches WHERE status = ? OR expiry_date < CURDATE()', ['expired']);
  res.json({ message: 'Pharmacy system reset complete.' });
}

async function wipeAllData(req, res) {
  logDestructiveAction(req, 'wipeAllData');
  // Delete in dependency order — notifications first, then child tables, then parents.
  await pool.query('DELETE FROM notifications');
  await pool.query('DELETE FROM stock_transactions');
  await pool.query('DELETE FROM audit_logs').catch(() => {});
  await pool.query('DELETE FROM ai_conversations').catch(() => {}); // persisted AI chat history
  await pool.query('DELETE FROM batches');
  await pool.query('DELETE FROM medicines');
  await pool.query('DELETE FROM suppliers');
  await pool.query('DELETE FROM ai_models').catch(() => {});
  res.json({ message: 'All data wiped: medicines, suppliers, batches, transactions, notifications, AI conversations and training history cleared.' });
}

module.exports = { clearTransactions, clearLogs, removeExpiredBatches, resetSystem, wipeAllData };
const { pool } = require('../config/db');
const { logAudit } = require('../utils/auditLogger');

// Some of these actions wipe audit_logs itself, so each one is also written to
// the server log, and a fresh audit entry is added *after* the action runs —
// even "clear logs" leaves a record of who cleared them.
function logDestructiveAction(req, action) {
  console.warn(`[MAINTENANCE] ${action} triggered by user ${req.user?.id ?? 'unknown'} (${req.user?.email ?? 'unknown'}) at ${new Date().toISOString()}`);
}

async function clearTransactions(req, res) {
  logDestructiveAction(req, 'clearTransactions');
  await pool.query('DELETE FROM stock_transactions');
  await logAudit(req.user.id, 'maintenance_clear_transactions', 'Cleared all transaction history', req);
  res.json({ message: 'Transaction history cleared.' });
}

async function clearLogs(req, res) {
  logDestructiveAction(req, 'clearLogs');
  await pool.query('DELETE FROM audit_logs');
  await pool.query('DELETE FROM notifications');
  await logAudit(req.user.id, 'maintenance_clear_logs', 'Cleared audit logs and notifications', req);
  res.json({ message: 'Logs and notifications cleared.' });
}

async function removeExpiredBatches(req, res) {
  logDestructiveAction(req, 'removeExpiredBatches');
  // Get the IDs of expired batches so we can clean up their notifications too
  const [batches] = await pool.query('SELECT id FROM batches WHERE status = ? OR expiry_date < CURDATE()', ['expired']);
  if (batches.length) {
    const batchIdList = batches.map((b) => b.id);
    await pool.query('DELETE FROM notifications WHERE type IN (?, ?, ?) AND reference_id IN (?)', ['near_expiry', 'expired', 'ai_risk_flag', batchIdList]);
  }

  const [result] = await pool.query('DELETE FROM batches WHERE status = ? OR expiry_date < CURDATE()', ['expired']);
  await logAudit(req.user.id, 'maintenance_remove_expired', `Removed ${result.affectedRows} expired batch(es)`, req);
  res.json({ message: `Removed ${result.affectedRows} expired batch(es).` });
}

async function resetSystem(req, res) {
  logDestructiveAction(req, 'resetSystem');
  await pool.query('DELETE FROM stock_transactions');
  await pool.query('DELETE FROM audit_logs');
  await pool.query('DELETE FROM notifications');
  await pool.query('DELETE FROM batches WHERE status = ? OR expiry_date < CURDATE()', ['expired']);
  await logAudit(req.user.id, 'maintenance_reset', 'Reset the pharmacy system', req);
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
  await logAudit(req.user.id, 'maintenance_wipe', 'Wiped all data', req);
  res.json({ message: 'All data wiped: medicines, suppliers, batches, transactions, notifications, AI conversations and training history cleared.' });
}

module.exports = { clearTransactions, clearLogs, removeExpiredBatches, resetSystem, wipeAllData };
const { pool } = require('../config/db');
const { logAudit } = require('../utils/auditLogger');
const { clearAccountCache } = require('../middleware/auth');

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

// The audit log is never deleted (non-repudiation: every action stays on
// record). "Clear logs" therefore clears notifications only.
async function clearLogs(req, res) {
  logDestructiveAction(req, 'clearNotifications');
  const [result] = await pool.query('DELETE FROM notifications');
  await logAudit(req.user.id, 'maintenance_clear_notifications', `Cleared ${result.affectedRows} notification(s)`, req);
  res.json({ message: `Cleared ${result.affectedRows} notification(s). The audit log is kept.` });
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
  await pool.query('DELETE FROM notifications');
  await pool.query('DELETE FROM batches WHERE status = ? OR expiry_date < CURDATE()', ['expired']);
  await logAudit(req.user.id, 'maintenance_reset', 'Reset the pharmacy system', req);
  res.json({ message: 'Pharmacy system reset complete. The audit log is kept.' });
}

async function wipeAllData(req, res) {
  logDestructiveAction(req, 'wipeAllData');
  // Delete in dependency order — notifications first, then child tables, then parents.
  await pool.query('DELETE FROM notifications');
  await pool.query('DELETE FROM stock_transactions');
  await pool.query('DELETE FROM ai_conversations').catch(() => {}); // persisted AI chat history
  await pool.query('DELETE FROM batches');
  await pool.query('DELETE FROM medicines');
  await pool.query('DELETE FROM suppliers');
  await pool.query('DELETE FROM ai_models').catch(() => {});
  await logAudit(req.user.id, 'maintenance_wipe', 'Wiped all data', req);
  res.json({ message: 'All data wiped: medicines, suppliers, batches, transactions, notifications, AI conversations and training history cleared.' });
}

// ── Backup and restore ───────────────────────────────────────────────────
// A backup is one JSON file with every table. Restoring replaces the current
// data with the file's, all inside one transaction: a bad file changes nothing.
const BACKUP_VERSION = 1;
const BACKUP_TABLES = [
  'users', 'branches', 'suppliers', 'medicines', 'medicine_images', 'batches',
  'stock_transactions', 'notifications', 'audit_logs', 'ai_conversations', 'ai_models',
];
const BINARY_COLUMNS = { medicine_images: ['data'] };

async function tableColumns(table) {
  const [rows] = await pool.query(
    'SELECT column_name AS name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?',
    [table]
  );
  return rows.map((r) => r.name);
}

async function downloadBackup(req, res) {
  const tables = {};
  for (const table of BACKUP_TABLES) {
    if (!(await tableColumns(table)).length) continue; // table not created yet
    const [rows] = await pool.query(`SELECT * FROM \`${table}\``);
    const binary = BINARY_COLUMNS[table] || [];
    tables[table] = rows.map((row) => {
      for (const col of binary) if (Buffer.isBuffer(row[col])) row[col] = row[col].toString('base64');
      return row;
    });
  }
  const backup = { app: 'MEDIHUB', version: BACKUP_VERSION, exported_at: new Date().toISOString(), tables };
  const counts = Object.entries(tables).map(([t, r]) => `${t}: ${r.length}`).join(', ');
  await logAudit(req.user.id, 'maintenance_backup', `Downloaded a backup (${counts})`, req);
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
    .setHeader('Content-Disposition', `attachment; filename="medihub-backup-${stamp}.json"`)
    .send(JSON.stringify(backup));
}

// Checks a backup file before anything is deleted.
function checkBackup(backup) {
  if (!backup || backup.app !== 'MEDIHUB' || backup.version !== BACKUP_VERSION || typeof backup.tables !== 'object') {
    return 'This is not a MEDIHUB backup file.';
  }
  for (const table of Object.keys(backup.tables)) {
    if (!BACKUP_TABLES.includes(table) || !Array.isArray(backup.tables[table])) return `The backup contains an unexpected table: ${table}.`;
  }
  const users = backup.tables.users || [];
  if (!users.some((u) => u.role === 'admin' && u.is_active)) return 'The backup has no active administrator account, so restoring it would lock everyone out.';
  return null;
}

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

function restoreValue(table, column, value) {
  if (value === null || value === undefined) return null;
  if ((BINARY_COLUMNS[table] || []).includes(column)) return Buffer.from(value, 'base64');
  // Timestamps were exported as ISO strings; convert back so the driver
  // formats them in the database's timezone (DATE columns are plain strings).
  if (typeof value === 'string' && ISO_TIMESTAMP.test(value)) return new Date(value);
  return value;
}

async function restoreBackup(req, res) {
  const { backup, confirm } = req.body || {};
  if (confirm !== 'RESTORE') return res.status(400).json({ error: 'Type RESTORE to confirm.' });
  const problem = checkBackup(backup);
  if (problem) return res.status(400).json({ error: problem });
  logDestructiveAction(req, 'restoreBackup');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    const restored = [];
    for (const table of [...BACKUP_TABLES].reverse()) {
      if ((await tableColumns(table)).length) await conn.query(`DELETE FROM \`${table}\``);
    }
    for (const table of BACKUP_TABLES) {
      const rows = backup.tables[table];
      if (!rows || !rows.length) continue;
      const known = new Set(await tableColumns(table));
      const columns = Object.keys(rows[0]).filter((c) => known.has(c));
      if (!columns.length) continue;
      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200);
        await conn.query(
          `INSERT INTO \`${table}\` (${columns.map((c) => `\`${c}\``).join(', ')}) VALUES ?`,
          [chunk.map((row) => columns.map((c) => restoreValue(table, c, row[c])))]
        );
      }
      restored.push(`${table}: ${rows.length}`);
    }
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    await conn.commit();
    clearAccountCache();
    // A backup from before branches existed has none; this re-creates the
    // defaults (and any branch named by a restored medicine).
    await require('../config/migrations').runMigrations();
    const detail = `Restored a backup from ${backup.exported_at || 'an unknown date'} (${restored.join(', ')})`;
    // The restored users may not include the person who ran this; the entry then has no user.
    const [[stillThere]] = await pool.query('SELECT COUNT(*) AS n FROM users WHERE id = ?', [req.user.id]);
    await logAudit(stillThere.n ? req.user.id : null, 'maintenance_restore', detail, req);
    res.json({ message: `${detail}. You may need to log in again.` });
  } catch (err) {
    await conn.rollback();
    console.error('Restore failed — nothing was changed:', err);
    res.status(500).json({ error: `Restore failed and nothing was changed: ${err.message}` });
  } finally {
    await conn.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => {});
    conn.release();
  }
}

// Demo data (scripts/seedDemoData.js): 14 weeks of sample activity covering
// every status, for testing and demonstrations. Loading replaces any earlier
// demo data so dates line up with today; removing touches only demo rows.
let demoDataBusy = false;

async function runDemoTask(req, res, action, task) {
  if (demoDataBusy) return res.status(409).json({ error: 'Demo data is already being updated — try again in a moment.' });
  demoDataBusy = true;
  logDestructiveAction(req, action);
  try {
    const message = await task();
    await logAudit(req.user.id, `maintenance_${action}`, message, req);
    res.json({ message });
  } catch (err) {
    console.error(`${action} failed:`, err);
    res.status(500).json({ error: err.message || 'Demo data update failed' });
  } finally {
    demoDataBusy = false;
  }
}

async function loadDemoData(req, res) {
  const { loadFreshDemoData } = require('../scripts/seedDemoData');
  await runDemoTask(req, res, 'load_demo_data', loadFreshDemoData);
}

async function removeDemoData(req, res) {
  const { resetDemoData } = require('../scripts/seedDemoData');
  await runDemoTask(req, res, 'remove_demo_data', resetDemoData);
}

module.exports = { clearTransactions, clearLogs, removeExpiredBatches, resetSystem, wipeAllData, loadDemoData, removeDemoData, downloadBackup, restoreBackup, checkBackup };
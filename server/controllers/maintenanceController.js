const { pool } = require('../config/db');

const WIPE_CONFIRMATION = 'WIPE';

// Child rows first so foreign keys stay satisfied while the wipe runs.
const WIPE_TABLES = ['stock_transactions', 'batches', 'medicines', 'suppliers', 'notifications', 'ai_models'];

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

async function tableExists(conn, table) {
  const [rows] = await conn.query(
    'SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
    [table]
  );
  return rows[0].total > 0;
}

async function wipeAllData(req, res) {
  if (req.body?.confirm !== WIPE_CONFIRMATION) {
    return res.status(400).json({ error: `Send { "confirm": "${WIPE_CONFIRMATION}" } to confirm this irreversible wipe.` });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const deleted = {};
    for (const table of WIPE_TABLES) {
      if (!(await tableExists(conn, table))) continue;
      const [result] = await conn.query('DELETE FROM ??', [table]);
      deleted[table] = result.affectedRows;
    }

    await conn.query(
      'INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)',
      [req.user.id, 'wiped_all_data', `Wiped all records: ${JSON.stringify(deleted)}`, req.ip]
    );

    await conn.commit();
    res.json({ message: 'All medicines, suppliers, batches, transactions and AI training history cleared.', deleted });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Wipe failed — no records were deleted.' });
  } finally {
    conn.release();
  }
}

module.exports = { clearTransactions, clearLogs, removeExpiredBatches, resetSystem, wipeAllData };

const { pool } = require('../config/db');

async function getAll({ unreadOnly = false, limit = 100 } = {}) {
  const query = unreadOnly
    ? 'SELECT * FROM notifications WHERE is_read = FALSE ORDER BY created_at DESC LIMIT ?'
    : 'SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?';
  const [rows] = await pool.query(query, [limit]);
  return rows;
}

async function markRead(id) {
  await pool.query('UPDATE notifications SET is_read = TRUE WHERE id = ?', [id]);
}

async function markAllRead() {
  await pool.query('UPDATE notifications SET is_read = TRUE WHERE is_read = FALSE');
}

module.exports = { getAll, markRead, markAllRead };
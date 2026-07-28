const { pool } = require('../config/db');

async function getRecent(limit = 100) {
  const [rows] = await pool.query(
    `SELECT a.*, u.full_name AS user_name FROM audit_logs a
     LEFT JOIN users u ON a.user_id = u.id
     ORDER BY a.created_at DESC LIMIT ?`,
    [limit]
  );
  return rows;
}

module.exports = { getRecent };
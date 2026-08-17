const { pool } = require('../config/db');

async function logAudit(userId, action, details, req) {
  try {
    await pool.query(
      'INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)',
      [userId, action, details, req.ip]
    );
  } catch (err) {
    console.error('Failed to log audit entry:', err.message);
  }
}

module.exports = { logAudit };

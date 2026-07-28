const userModel = require('../models/userModel');
const { pool } = require('../config/db');

async function getAll(req, res) {
  res.json(await userModel.getAllUsers());
}

async function setStatus(req, res) {
  const { is_active } = req.body;
  if (req.params.id == req.user.id) {
    return res.status(400).json({ error: "You can't change your own status" });
  }
  await userModel.setActive(req.params.id, !!is_active);
  await pool.query(
    'INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)',
    [req.user.id, 'changed_user_status', `Set user ${req.params.id} active=${!!is_active}`, req.ip]
  );
  res.json({ success: true });
}

module.exports = { getAll, setStatus };
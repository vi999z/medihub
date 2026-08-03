const userModel = require('../models/userModel');
const { pool } = require('../config/db');

async function getAll(req, res) {
  res.json(await userModel.getAllUsers());
}

async function update(req, res) {
  const existing = await userModel.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  const { full_name, email, role, is_active } = req.body;
  if (!full_name || !email || !role) {
    return res.status(400).json({ error: 'full_name, email, and role are required' });
  }

  if (!['admin', 'pharmacist'].includes(role)) {
    return res.status(400).json({ error: 'role must be admin or pharmacist' });
  }

  const emailOwner = await userModel.findByEmail(email);
  if (emailOwner && emailOwner.id !== Number(req.params.id)) {
    return res.status(409).json({ error: 'Email already in use' });
  }

  await userModel.updateUser(req.params.id, {
    full_name,
    email,
    role,
    is_active: is_active === undefined ? existing.is_active : !!is_active
  });

  await pool.query(
    'INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)',
    [req.user.id, 'updated_user', `Updated user ${req.params.id}`, req.ip]
  );

  res.json({ success: true, user: { ...existing, full_name, email, role, is_active: is_active === undefined ? existing.is_active : !!is_active } });
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

async function remove(req, res) {
  if (req.params.id == req.user.id) {
    return res.status(400).json({ error: "You can't delete your own account" });
  }

  await userModel.setActive(req.params.id, false);
  await pool.query(
    'INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)',
    [req.user.id, 'deleted_user', `Deactivated user ${req.params.id}`, req.ip]
  );
  res.json({ success: true });
}

module.exports = { getAll, update, setStatus, remove };
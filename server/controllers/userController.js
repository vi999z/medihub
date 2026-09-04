const bcrypt = require('bcrypt');
const crypto = require('crypto');
const userModel = require('../models/userModel');
const { pool } = require('../config/db');
const { logAudit } = require('../utils/auditLogger');

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

  await logAudit(req.user.id, 'updated_user', `Updated user ${req.params.id}`, req);

  res.json({ success: true, user: { ...existing, full_name, email, role, is_active: is_active === undefined ? existing.is_active : !!is_active } });
}

async function setStatus(req, res) {
  const { is_active } = req.body;
  if (req.params.id == req.user.id) {
    return res.status(400).json({ error: "You can't change your own status" });
  }
  await userModel.setActive(req.params.id, !!is_active);
  await logAudit(req.user.id, 'changed_user_status', `Set user ${req.params.id} active=${!!is_active}`, req);
  res.json({ success: true });
}

async function remove(req, res) {
  if (req.params.id == req.user.id) {
    return res.status(400).json({ error: "You can't delete your own account" });
  }

  await userModel.setActive(req.params.id, false);
  await logAudit(req.user.id, 'deleted_user', `Deactivated user ${req.params.id}`, req);
  res.json({ success: true });
}

async function resetPassword(req, res) {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: 'Invalid user id' });
  }
  if (userId === Number(req.user.id)) {
    return res.status(400).json({ error: "You can't reset your own password here" });
  }

  const existing = await userModel.findById(userId);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  const temporaryPassword = crypto.randomBytes(12).toString('base64url');
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);
  await userModel.updatePasswordHash(userId, passwordHash);

  await logAudit(req.user.id, 'reset_user_password', `Reset password for user ${userId}`, req);

  res.json({
    success: true,
    user: { id: existing.id, full_name: existing.full_name, email: existing.email },
    temporary_password: temporaryPassword,
    message: 'Temporary password generated. It will not be shown again.'
  });
}

module.exports = { getAll, update, setStatus, remove, resetPassword };
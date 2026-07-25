const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel');
const { pool } = require('../config/db');

async function logAudit(userId, action, details, req) {
  await pool.query(
    'INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)',
    [userId, action, details, req.ip]
  );
}

// POST /api/auth/login
async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = await userModel.findByEmail(email);
  if (!user || !user.is_active) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    await logAudit(user.id, 'failed_login', `Failed login attempt for ${email}`, req);
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { id: user.id, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );

  await logAudit(user.id, 'login', `${user.email} logged in`, req);

  res.json({
    token,
    user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role }
  });
}

// POST /api/auth/register  (admin-only — see route protection below)
async function register(req, res) {
  const { full_name, email, password, role } = req.body;

  if (!full_name || !email || !password || !role) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  if (!['admin', 'pharmacist'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  const existing = await userModel.findByEmail(email);
  if (existing) {
    return res.status(409).json({ error: 'Email already in use' });
  }

  const password_hash = await bcrypt.hash(password, 12);
  const newUserId = await userModel.createUser({ full_name, email, password_hash, role });

  await logAudit(req.user.id, 'created_user', `Created ${role} account for ${email}`, req);

  res.status(201).json({ id: newUserId, full_name, email, role });
}

// GET /api/auth/me
async function me(req, res) {
  const user = await userModel.findById(req.user.id);
  res.json(user);
}

module.exports = { login, register, me };
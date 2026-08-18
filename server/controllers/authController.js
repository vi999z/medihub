const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel');
const { pool } = require('../config/db');
const { logAudit } = require('../utils/auditLogger');

// Converts JWT_EXPIRES_IN strings like "7d", "24h", "3600" into milliseconds
// so we can give the cookie the same lifetime as the JWT itself.
function parseDurationMs(str) {
  const match = String(str || '7d').match(/^(\d+)([smhd]?)$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const n = parseInt(match[1], 10);
  return n * ({ s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]] || 1000);
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
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  await logAudit(user.id, 'login', `${user.email} logged in`, req);

  // Set the token as an HttpOnly, SameSite=Lax cookie.
  // Domain is intentionally omitted — the browser scopes it to the exact
  // request host (works correctly for both localhost and production domains).
  res.cookie('medihub_token', token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: parseDurationMs(process.env.JWT_EXPIRES_IN || '7d'),
    path: '/',
  });

  // No longer return the raw token in the body — the cookie carries it.
  res.json({
    user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role }
  });
}

// POST /api/auth/logout
async function logout(req, res) {
  // Clear the cookie by overwriting it with an already-expired one.
  res.clearCookie('medihub_token', {
    httpOnly: true,
    sameSite: 'Lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });

  if (req.user) {
    await logAudit(req.user.id, 'logout', `${req.user.email} logged out`, req).catch(() => {});
  }

  res.json({ ok: true });
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

module.exports = { login, register, me, logout };
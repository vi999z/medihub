const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel');
const { pool } = require('../config/db');
const { logAudit } = require('../utils/auditLogger');
const { validateUser } = require('../utils/validators');

// Converts JWT_EXPIRES_IN strings like "7d", "24h", "3600" into milliseconds
// so we can give the cookie the same lifetime as the JWT itself.
function parseDurationMs(str) {
  const match = String(str || '7d').match(/^(\d+)([smhd]?)$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const n = parseInt(match[1], 10);
  return n * ({ s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]] || 1000);
}

// Brute-force protection: after MAX_FAILED wrong passwords for one account the
// account is locked for LOCK_MS, whoever is trying. (Kept in memory: a server
// restart clears it, which is acceptable for a lock this short.)
const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000;
const failedLogins = new Map(); // email -> { count, lockedUntil }

function lockMinutesLeft(key) {
  const entry = failedLogins.get(key);
  if (!entry || !entry.lockedUntil || entry.lockedUntil <= Date.now()) return 0;
  return Math.ceil((entry.lockedUntil - Date.now()) / 60000);
}

function recordFailure(key) {
  const entry = failedLogins.get(key) || { count: 0, lockedUntil: 0 };
  // An expired lock starts a fresh count.
  if (entry.lockedUntil && entry.lockedUntil <= Date.now()) { entry.count = 0; entry.lockedUntil = 0; }
  entry.count += 1;
  if (entry.count >= MAX_FAILED) entry.lockedUntil = Date.now() + LOCK_MS;
  failedLogins.set(key, entry);
  return entry;
}

// POST /api/auth/login
async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const key = String(email).trim().toLowerCase();
  const minutes = lockMinutesLeft(key);
  if (minutes > 0) {
    return res.status(429).json({ error: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.` });
  }

  const user = await userModel.findByEmail(email);
  if (!user || !user.is_active) {
    recordFailure(key);
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    const entry = recordFailure(key);
    await logAudit(user.id, 'failed_login', `Failed login attempt for ${email}${entry.lockedUntil ? ' — account locked for 15 minutes' : ''}`, req);
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  failedLogins.delete(key);

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

  res.json({
    token,
    user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role }
  });
}

// POST /api/auth/logout
// No verifyToken on this route — logout must always succeed even when the
// token is expired or absent. We do a best-effort decode for the audit log;
// failure is silently ignored and the cookie is cleared either way.
async function logout(req, res) {
  const token = req.cookies?.medihub_token;
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      await logAudit(decoded.id, 'logout', `${decoded.email} logged out`, req).catch(() => {});
    } catch {
      // expired or invalid — skip audit log, still clear the cookie
    }
  }

  res.clearCookie('medihub_token', {
    httpOnly: true,
    sameSite: 'Lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });

  res.json({ ok: true });
}

// POST /api/auth/register  (admin-only — see route protection below)
async function register(req, res) {
  const { value, error, field } = validateUser(req.body, { isCreate: true });
  if (error) return res.status(400).json({ error, field });
  const { full_name, email, password, role } = value;

  const existing = await userModel.findByEmail(email);
  if (existing) {
    return res.status(409).json({ error: 'Email already in use', field: 'email' });
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
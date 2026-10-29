const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel');

async function verifyToken(req, res, next) {
  // Prefer the HttpOnly cookie set by /auth/login; fall back to the
  // Authorization: Bearer header so existing API clients keep working.
  const cookieToken = req.cookies?.medihub_token;
  const headerToken = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.split(' ')[1]
    : null;

  const token = cookieToken || headerToken;
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET); // { id, role, email }
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Re-check the account so deactivation and role changes apply immediately
  // instead of when the token expires (up to 7 days). The lookup is cached
  // briefly to save a database round trip on every request; account changes
  // clear the cache (see clearAccountCache), so they still take effect at once.
  const user = await getAccount(payload.id);
  if (!user || !user.is_active) {
    return res.status(401).json({ error: 'Account is inactive or no longer exists' });
  }
  req.user = { ...payload, role: user.role, email: user.email };
  next();
}

const ACCOUNT_CACHE_MS = 15000;
const accountCache = new Map(); // userId -> { user, expires }

async function getAccount(userId) {
  const key = Number(userId);
  const cached = accountCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.user;
  const user = await userModel.findById(key);
  accountCache.set(key, { user, expires: Date.now() + ACCOUNT_CACHE_MS });
  return user;
}

// Call after changing a user's role or active status (or with no id, all users).
function clearAccountCache(userId) {
  if (userId === undefined) accountCache.clear();
  else accountCache.delete(Number(userId));
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = { verifyToken, requireRole, clearAccountCache };
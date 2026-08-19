const express = require('express');
const router = express.Router();
const { login, register, me, logout } = require('../controllers/authController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.post('/login', login);
// logout must NOT require a valid token — the whole point is clearing an
// expired or missing session. The handler does its own best-effort decode
// for the audit log and always clears the cookie regardless.
router.post('/logout', logout);
router.post('/register', verifyToken, requireRole('admin'), register); // admin-only
router.get('/me', verifyToken, me);

module.exports = router;
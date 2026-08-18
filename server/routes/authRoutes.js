const express = require('express');
const router = express.Router();
const { login, register, me, logout } = require('../controllers/authController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.post('/login', login);
// logout: verifyToken is applied so the audit log can record who logged out,
// but the cookie is cleared regardless of whether the token is still valid.
router.post('/logout', verifyToken, logout);
router.post('/register', verifyToken, requireRole('admin'), register); // admin-only
router.get('/me', verifyToken, me);

module.exports = router;
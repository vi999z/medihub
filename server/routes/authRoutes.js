const express = require('express');
const router = express.Router();
const { login, register, me } = require('../controllers/authController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.post('/login', login);
router.post('/register', verifyToken, requireRole('admin'), register); // admin-only
router.get('/me', verifyToken, me);

module.exports = router;
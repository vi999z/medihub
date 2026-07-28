const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/userController');
const { register } = require('../controllers/authController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.use(verifyToken, requireRole('admin'));
router.get('/', ctrl.getAll);
router.post('/', register);
router.patch('/:id/status', ctrl.setStatus);

module.exports = router;
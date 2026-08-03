const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/userController');
const { register } = require('../controllers/authController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.use(verifyToken, requireRole('admin'));
router.get('/', ctrl.getAll);
router.post('/', register);
router.put('/:id', ctrl.update);
router.patch('/:id/status', ctrl.setStatus);
router.delete('/:id', ctrl.remove);

module.exports = router;
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/supplierController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.use(verifyToken);
router.get('/', ctrl.getAll);
router.post('/', requireRole('admin'), ctrl.create);
router.delete('/:id', requireRole('admin'), ctrl.remove);

module.exports = router;
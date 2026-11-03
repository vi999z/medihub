const express = require('express');
const router = express.Router();
const { numericIdParams } = require('../utils/idParams');
numericIdParams(router, 'id');
const ctrl = require('../controllers/supplierController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.use(verifyToken);
router.get('/', ctrl.getAll);
router.post('/', requireRole('admin', 'pharmacist'), ctrl.create);
router.put('/:id', requireRole('admin', 'pharmacist'), ctrl.update);
router.delete('/:id', requireRole('admin', 'pharmacist'), ctrl.remove);

module.exports = router;
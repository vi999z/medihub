const express = require('express');
const router = express.Router();
const { numericIdParams } = require('../utils/idParams');
numericIdParams(router, 'id');
const ctrl = require('../controllers/branchController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.use(verifyToken);

// Everyone signed in can list branches (filters and forms need them);
// only administrators can change them.
router.get('/', ctrl.getAll);
router.post('/', requireRole('admin'), ctrl.create);
router.put('/:id', requireRole('admin'), ctrl.update);
router.patch('/:id/status', requireRole('admin'), ctrl.setStatus);

module.exports = router;

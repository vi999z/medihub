const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/batchController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.use(verifyToken);

router.get('/', ctrl.getAll);
router.get('/medicine/:medicineId', ctrl.getByMedicine);
router.get('/:id', ctrl.getOne);
router.post('/', requireRole('admin', 'pharmacist'), ctrl.create); // both roles can receive stock
router.put('/:id', requireRole('admin', 'pharmacist'), ctrl.update);
// Must come before '/:id', or "depleted" is taken as a batch id.
router.delete('/depleted', requireRole('admin'), ctrl.removeDepleted);
router.delete('/:id', requireRole('admin', 'pharmacist'), ctrl.remove);

module.exports = router;
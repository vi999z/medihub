const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/batchController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.use(verifyToken);

router.get('/', ctrl.getAll);
router.get('/medicine/:medicineId', ctrl.getByMedicine);
router.get('/:id', ctrl.getOne);
router.post('/', requireRole('admin', 'pharmacist'), ctrl.create); // both roles can receive stock

module.exports = router;
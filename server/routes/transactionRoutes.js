const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/transactionController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.use(verifyToken);

router.post('/', requireRole('admin', 'pharmacist'), ctrl.create);
router.get('/recent', ctrl.getRecent);
router.get('/batch/:batchId', ctrl.getByBatch);
router.get('/medicine/:medicineId', ctrl.getByMedicine);

module.exports = router;
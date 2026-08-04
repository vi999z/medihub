const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/csvImportController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.use(verifyToken);

router.post('/medicines', requireRole('admin'), ctrl.importMedicines);
router.post('/suppliers', requireRole('admin'), ctrl.importSuppliers);
router.post('/batches', requireRole('admin', 'pharmacist'), ctrl.importBatches);

module.exports = router;
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/maintenanceController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.use(verifyToken);
router.use(requireRole('admin'));

router.delete('/transactions', ctrl.clearTransactions);
router.delete('/logs', ctrl.clearLogs);
router.delete('/expired-batches', ctrl.removeExpiredBatches);
router.delete('/reset', ctrl.resetSystem);
router.delete('/wipe', ctrl.wipeAllData);
router.get('/backup', ctrl.downloadBackup);
router.post('/restore', ctrl.restoreBackup);
router.post('/demo-data', ctrl.loadDemoData);
router.delete('/demo-data', ctrl.removeDemoData);

module.exports = router;

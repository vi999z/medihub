const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/aiController');
const exportCtrl = require('../controllers/exportController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.use(verifyToken);
router.get('/expiry-risk', ctrl.getExpiryRisk);
router.get('/reorder-suggestions', ctrl.getReorderSuggestionsHandler);
router.get('/anomalies', ctrl.getAnomalies);
router.post('/train', requireRole('admin'), ctrl.train);
router.post('/chat', ctrl.chat);

// Export endpoints
router.get('/report/export', exportCtrl.generateReportExport);
router.post('/report/export', exportCtrl.generateReportExport);
router.get('/export/types', (req, res) => res.json({ types: exportCtrl.getSupportedExportTypes() }));

module.exports = router;
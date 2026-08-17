const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/aiController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.use(verifyToken);
router.get('/expiry-risk', ctrl.getExpiryRisk);
router.get('/reorder-suggestions', ctrl.getReorderSuggestionsHandler);
router.get('/anomalies', ctrl.getAnomalies);
router.post('/train', requireRole('admin'), ctrl.train);
router.post('/chat', ctrl.chat);

module.exports = router;
const express = require('express');
const router = express.Router();
const ctrlEnhanced = require('../controllers/aiControllerEnhanced');
const { verifyToken, requireRole } = require('../middleware/auth');

router.use(verifyToken);

// ─── Enhanced Modern AI Endpoints ───
// Modern chat with conversation history and streaming support
router.post('/chat', ctrlEnhanced.chatModern);

// Pharmacy health report (executive summary)
router.get('/health-report', ctrlEnhanced.getPharmacyHealthReport);

// Enhanced analytics with AI explanations
router.get('/expiry-risk', ctrlEnhanced.getExpiryRiskEnhanced);
router.get('/anomalies', ctrlEnhanced.getAnomaliesEnhanced);
// AI-generated export formats
router.get('/report/export', require('../controllers/exportController').generateReportExport);
router.post('/report/export', require('../controllers/exportController').generateReportExport);
// Conversation management
router.post('/conversation/clear', ctrlEnhanced.clearConversation);
router.get('/conversation/info', ctrlEnhanced.getConversationInfo);

// ─── Traditional endpoints (backward compatible) ───
router.get('/reorder-suggestions', ctrlEnhanced.getReorderSuggestionsHandler);
router.post('/train', requireRole('admin'), ctrlEnhanced.train);

module.exports = router;

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/aiController');
const ctrlEnhanced = require('../controllers/aiControllerEnhanced');
const exportCtrl = require('../controllers/exportController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.use(verifyToken);

// Basic AI endpoints
router.get('/expiry-risk', ctrl.getExpiryRisk);
router.get('/reorder-suggestions', ctrl.getReorderSuggestionsHandler);
router.get('/anomalies', ctrl.getAnomalies);
router.post('/train', requireRole('admin'), ctrl.train);
router.post('/chat', ctrl.chat);

// Enhanced AI endpoints
router.get('/pharmacy-health', ctrlEnhanced.getPharmacyHealthReport);
router.post('/chat-modern', ctrlEnhanced.chatModern);
router.delete('/conversation', ctrlEnhanced.clearConversation);
router.get('/conversation', ctrlEnhanced.getConversationInfo);

// Generative AI endpoints
router.post('/generate-report', ctrlEnhanced.generateAIReport);
router.post('/generate-strategy', ctrlEnhanced.generateStrategy);
router.post('/forecast-demand', ctrlEnhanced.forecastDemand);
router.post('/analyze-efficiency', ctrlEnhanced.analyzeEfficiency);
router.get('/available-functions', ctrlEnhanced.getAvailableFunctions);
router.get('/available-models', ctrlEnhanced.getAvailableModels);
router.post('/set-preferred-model', ctrlEnhanced.setPreferredModel);

// File generation endpoints
router.post('/generate-file', ctrlEnhanced.generateDownloadableFile);
router.post('/auto-generate-file', ctrlEnhanced.autoGenerateFileFromChat);
router.post('/generate-report-download', ctrlEnhanced.generateReportWithDownload);

// Export endpoints
router.get('/report/export', exportCtrl.generateReportExport);
router.post('/report/export', exportCtrl.generateReportExport);
router.get('/export/types', (req, res) => res.json({ types: exportCtrl.getSupportedExportTypes() }));

module.exports = router;
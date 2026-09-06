const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/reportController');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);
router.get('/summary', ctrl.summary);
router.get('/expiring-soon', ctrl.expiringSoon);
router.get('/low-stock', ctrl.lowStock);
router.get('/sales-trend', ctrl.salesTrend);
router.get('/by-category', ctrl.byCategory);

// ── Export routes ───────────────────────────────────────────────────────────
// Export batches by status: ?status=expired|depleted|recalled|active&format=excel|pdf|docx
router.get('/export/batches', ctrl.batchesByStatus);
// Export wasted/disposed medicines: ?format=excel|pdf|docx
router.get('/export/wasted', ctrl.wastedMedicines);
// Export transactions: ?days=30&type=sale|disposal|adjustment&format=excel|pdf|docx
router.get('/export/transactions', ctrl.transactionsReport);
// Export alerts/notifications: ?severity=critical|warning&unread=true&format=excel|pdf|docx
router.get('/export/notifications', ctrl.notificationsReport);
// Export expiring soon: ?days=14&format=excel|pdf|docx
router.get('/export/expiring', ctrl.expiringSoonReport);
// Export low stock: ?format=excel|pdf|docx
router.get('/export/low-stock', ctrl.lowStockReport);
// Export inventory value: ?format=excel|pdf|docx
router.get('/export/inventory-value', ctrl.inventoryValueReport);

module.exports = router;

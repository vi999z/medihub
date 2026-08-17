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

module.exports = router;
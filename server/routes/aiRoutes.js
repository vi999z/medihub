const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/aiController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.use(verifyToken);
router.get('/expiry-risk', ctrl.getExpiryRisk);
router.post('/train', requireRole('admin'), ctrl.train);

module.exports = router;
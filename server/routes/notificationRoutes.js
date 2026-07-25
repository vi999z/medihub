const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/notificationController');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);
router.get('/', ctrl.getAll);
router.patch('/:id/read', ctrl.markRead);
router.patch('/read-all', ctrl.markAllRead);

module.exports = router;
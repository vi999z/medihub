const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/csvImportController');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

router.get('/schemas', ctrl.getSchemas);
router.post('/analyze', ctrl.analyze);
router.post('/:type', ctrl.importByType);

module.exports = router;
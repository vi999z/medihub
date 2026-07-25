const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/medicineController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.use(verifyToken); // all medicine routes require login

router.get('/', ctrl.getAll);                                   // pharmacist + admin
router.get('/:id', ctrl.getOne);                                // pharmacist + admin
router.post('/', requireRole('admin'), ctrl.create);             // admin only
router.put('/:id', requireRole('admin'), ctrl.update);           // admin only
router.delete('/:id', requireRole('admin'), ctrl.remove);        // admin only

module.exports = router;
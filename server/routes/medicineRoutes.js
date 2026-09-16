const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/medicineController');
const { verifyToken, requireRole } = require('../middleware/auth');
const multer = require('multer');
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const isCsv = file.mimetype === 'text/csv' || file.originalname.toLowerCase().endsWith('.csv');
    cb(isCsv ? null : new Error('Only CSV files are allowed'), isCsv);
  }
});

router.use(verifyToken); // all medicine routes require login

router.get('/', ctrl.getAll);                                   // pharmacist + admin
router.get('/csv/template', requireRole('admin'), ctrl.downloadCsvTemplate);
router.get('/:id', ctrl.getOne);                                // pharmacist + admin
router.post('/', requireRole('admin'), ctrl.create);             // admin only
router.put('/:id', requireRole('admin'), ctrl.update);           // admin only
router.delete('/:id', requireRole('admin'), ctrl.remove);        // admin only
router.post('/csv/validate', requireRole('admin'), upload.single('file'), ctrl.validateCsvImport);
router.post('/csv/commit', requireRole('admin'), ctrl.commitCsvImport);

module.exports = router;
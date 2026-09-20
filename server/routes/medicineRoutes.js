const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/medicineController');
const { verifyToken, requireRole } = require('../middleware/auth');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const isCsv = file.mimetype === 'text/csv' || file.originalname.toLowerCase().endsWith('.csv');
    cb(isCsv ? null : new Error('Only CSV files are allowed'), isCsv);
  }
});

// Medicine photos — kept in their own subfolder with real extensions (unlike
// the CSV upload above, these files persist and get served back over HTTP).
const IMAGE_DIR = path.join(__dirname, '..', 'uploads', 'medicines');
fs.mkdirSync(IMAGE_DIR, { recursive: true });
const imageUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, IMAGE_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `medicine-${req.params.id}-${Date.now()}${ext}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const isImage = /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype);
    cb(isImage ? null : new Error('Only JPEG, PNG, WEBP or GIF images are allowed'), isImage);
  }
});

router.use(verifyToken); // all medicine routes require login

router.get('/', ctrl.getAll);                                   // pharmacist + admin
router.get('/csv/template', requireRole('admin', 'pharmacist'), ctrl.downloadCsvTemplate);
router.get('/:id', ctrl.getOne);                                // pharmacist + admin
router.post('/', requireRole('admin', 'pharmacist'), ctrl.create);
router.put('/:id', requireRole('admin', 'pharmacist'), ctrl.update);
router.delete('/:id', requireRole('admin', 'pharmacist'), ctrl.remove);
router.post('/:id/image', requireRole('admin', 'pharmacist'), imageUpload.single('image'), ctrl.uploadImage);
router.delete('/:id/image', requireRole('admin', 'pharmacist'), ctrl.removeImage);
router.post('/csv/validate', requireRole('admin', 'pharmacist'), upload.single('file'), ctrl.validateCsvImport);
router.post('/csv/commit', requireRole('admin', 'pharmacist'), ctrl.commitCsvImport);

module.exports = router;
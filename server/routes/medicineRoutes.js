const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/medicineController');
const { verifyToken, requireRole } = require('../middleware/auth');
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const isCsv = file.mimetype === 'text/csv' || file.originalname.toLowerCase().endsWith('.csv');
    cb(isCsv ? null : new Error('Only CSV files are allowed'), isCsv);
  }
});

// Medicine photos — uploaded straight to Cloudinary instead of local disk,
// so they survive Render deploys/restarts (which wipe local, unmounted
// storage) without needing a paid persistent disk.
const imageUpload = multer({
  storage: new CloudinaryStorage({
    cloudinary,
    params: {
      folder: 'medihub/medicines',
      public_id: (req) => `medicine-${req.params.id}-${Date.now()}`,
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif']
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
// Fail clearly (instead of an opaque upload error) when photo storage isn't set up.
function requirePhotoStorage(req, res, next) {
  if (cloudinary.isCloudinaryConfigured()) return next();
  return res.status(503).json({ error: 'Photo storage is not configured on the server (CLOUDINARY_URL is missing). The medicine was saved without a photo.' });
}
router.post('/:id/image', requireRole('admin', 'pharmacist'), requirePhotoStorage, imageUpload.single('image'), ctrl.uploadImage);
router.delete('/:id/image', requireRole('admin', 'pharmacist'), ctrl.removeImage);
router.post('/csv/validate', requireRole('admin', 'pharmacist'), upload.single('file'), ctrl.validateCsvImport);
router.post('/csv/commit', requireRole('admin', 'pharmacist'), ctrl.commitCsvImport);

module.exports = router;
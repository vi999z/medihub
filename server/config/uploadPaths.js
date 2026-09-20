const path = require('path');

// Where persisted uploads (currently just medicine photos) live on disk.
// On Render this points at the mounted persistent disk (set via UPLOADS_DIR
// in render.yaml) so files survive deploys/restarts — Render's own app
// checkout directory is wiped on every deploy. Locally it falls back to
// server/uploads, which is gitignored.
const UPLOADS_ROOT = process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads');
const MEDICINE_IMAGE_DIR = path.join(UPLOADS_ROOT, 'medicines');

module.exports = { UPLOADS_ROOT, MEDICINE_IMAGE_DIR };

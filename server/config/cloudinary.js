const cloudinary = require('cloudinary').v2;

// The SDK auto-configures itself from the CLOUDINARY_URL env var
// (cloudinary://<api_key>:<api_secret>@<cloud_name>) — set this on Render
// (and locally in server/.env) from your Cloudinary dashboard.
// Medicine photos are stored here instead of local disk because Render's
// web services don't persist local files across deploys/restarts unless a
// paid disk is attached — Cloudinary's free tier avoids that entirely.
module.exports = cloudinary;

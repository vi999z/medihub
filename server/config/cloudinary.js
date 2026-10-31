const cloudinary = require('cloudinary').v2;

// The SDK auto-configures itself from the CLOUDINARY_URL env var
// (cloudinary://<api_key>:<api_secret>@<cloud_name>) — set this on Render
// (and locally in server/.env) from your Cloudinary dashboard.
// Medicine photos are stored here instead of local disk because Render's
// web services don't persist local files across deploys/restarts unless a
// paid disk is attached — Cloudinary's free tier avoids that entirely.
// True when credentials are present (from CLOUDINARY_URL or the separate
// CLOUDINARY_CLOUD_NAME / _API_KEY / _API_SECRET variables). Without them
// every photo upload fails.
function isCloudinaryConfigured() {
  const { cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret } = cloudinary.config();
  return Boolean(cloudName && apiKey && apiSecret);
}

module.exports = cloudinary;
module.exports.isCloudinaryConfigured = isCloudinaryConfigured;

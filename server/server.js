const express = require('express');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const compression = require('compression');
const crypto = require('crypto');
require('dotenv').config();
const { testConnection, pool } = require('./config/db');
const { runMigrations } = require('./config/migrations');
const { UPLOADS_ROOT } = require('./config/uploadPaths');
const authRoutes = require('./routes/authRoutes');
const medicineRoutes = require('./routes/medicineRoutes');
const branchRoutes = require('./routes/branchRoutes');
const batchRoutes = require('./routes/batchRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const { startExpiryMonitor } = require('./jobs/expiryMonitor');
const reportRoutes = require('./routes/reportRoutes');
const aiRoutes = require('./routes/aiRoutes');
const aiRoutesEnhanced = require('./routes/aiRoutesEnhanced');

const app = express();
// credentials:true is required for the browser to send the HttpOnly session
// cookie on cross-origin requests (Vite dev → API, or separate Render services).
// Allowed origins:
//   • Any localhost / 127.0.0.1 port (dev)
//   • FRONTEND_ORIGIN env var (production — set this on Render to the client URL)
//   • Requests with no Origin header (curl, Postman, server-to-server)
const ALLOWED_ORIGINS = new Set([
  // Explicit env var — set FRONTEND_ORIGIN on Render to your client URL.
  // Supports comma-separated values for multiple frontends.
  ...(process.env.FRONTEND_ORIGIN || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
  // Hardcoded Render frontend URL as a guaranteed fallback so the app
  // works even before the env var is configured on the server service.
  'https://medihub-2-hn4o.onrender.com',
]);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    // Always allow localhost on any port for local dev
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    // Allow any origin explicitly listed in FRONTEND_ORIGIN
    if (ALLOWED_ORIGINS.has(origin)) {
      return callback(null, true);
    }
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));
// Behind Render's proxy: lets rate limiting see the real client address.
app.set('trust proxy', 1);
// Security headers. Photos are loaded by the website from this API's address,
// so cross-origin reads must stay allowed; the API serves no HTML of its own
// worth a CSP.
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '25mb' })); // backups restore through this limit

// Any successful change through the API invalidates cached data lookups.
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'OPTIONS') {
    res.on('finish', () => { if (res.statusCode < 400) require('./utils/dataVersion').bump(); });
  }
  next();
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'MediHub API running', version: '2.0', ai: 'modern-llm' });
});

// Deeper check for the host's health monitor: answers 503 when the database
// can't be reached, so a broken connection is noticed and restarted.
app.get('/api/health/db', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    console.error('Health check: database unreachable:', err.message);
    res.status(503).json({ status: 'error', database: 'unreachable' });
  }
});

// Lets you confirm from the deployed URL (no dashboard access needed)
// whether uploads are actually landing on persistent storage — the
// UPLOADS_DIR env var and the disk it points at only take effect if the
// hosting platform actually provisioned/mounted it.
app.get('/api/health/uploads', (req, res) => {
  const fs = require('fs');
  let writable = false;
  try {
    fs.accessSync(UPLOADS_ROOT, fs.constants.W_OK);
    writable = true;
  } catch {
    writable = false;
  }
  res.json({
    uploadsRoot: UPLOADS_ROOT,
    uploadsDirEnvSet: Boolean(process.env.UPLOADS_DIR),
    writable,
    // Medicine photos are stored in the MySQL database (medicine_images).
    photoStorage: 'database',
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/medicines', medicineRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/batches', batchRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reports', reportRoutes);
// Use enhanced AI routes (modern LLM features) - includes backward compatibility
app.use('/api/ai', aiRoutesEnhanced);
// Legacy routes still available but will use enhanced controller
app.use('/api/ai-legacy', aiRoutes);
app.use('/api/suppliers', require('./routes/supplierRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/audit-logs', require('./routes/auditRoutes'));
app.use('/api/maintenance', require('./routes/maintenanceRoutes'));

const clientDist = path.join(__dirname, '../client/dist');
const indexHtml  = path.join(clientDist, 'index.html');
const fs         = require('fs');

// Serve uploaded medicine photos at /uploads/medicines/<file> — the only
// currently-persisted upload type. UPLOADS_ROOT points at the Render
// persistent disk in production (see server/config/uploadPaths.js) so this
// keeps working across deploys/restarts, and at server/uploads locally.
app.use('/uploads', express.static(UPLOADS_ROOT));

// Serve static assets from the built client (js/css/images)
app.use(express.static(clientDist, { index: false, fallthrough: true }));

// SPA fallback — every non-API, non-asset GET request returns index.html so
// React Router handles the route on hard refresh, direct URL, or spam refresh.
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next();           // let API 404 handler below respond
  if (/\.\w{1,10}$/.test(req.path)) return next();          // static asset not found → true 404
  if (fs.existsSync(indexHtml)) {
    return res.sendFile(indexHtml);
  }
  // index.html missing means the client hasn't been built yet (dev-only scenario)
  res.status(503).send('Client not built. Run `npm run build` in the client directory.');
});

// API 404 — only reached for /api/* paths not matched above
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler — catches errors from middleware/routes that didn't
// handle them (e.g. multer file validation) so the client always gets JSON.
// Turns low-level failures into a status and a message a person can act on.
function describeError(err) {
  const code = err.code || err.type || '';
  if (code === 'ER_DUP_ENTRY') return { status: 409, message: 'That already exists. Check for a duplicate and try again' };
  if (code === 'ER_NO_REFERENCED_ROW_2') return { status: 400, message: 'This refers to something that no longer exists. Refresh the page and try again' };
  if (code === 'ER_ROW_IS_REFERENCED_2') return { status: 409, message: 'This is still used by other records, so it cannot be removed' };
  if (code === 'ER_DATA_TOO_LONG' || code === 'ER_WARN_DATA_OUT_OF_RANGE') return { status: 400, message: 'One of the values is too long or out of range' };
  if (code === 'ER_LOCK_DEADLOCK' || code === 'ER_LOCK_WAIT_TIMEOUT') return { status: 503, message: 'The system is busy right now. Please try again' };
  if (['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'PROTOCOL_CONNECTION_LOST', 'ECONNRESET', 'ER_CON_COUNT_ERROR'].includes(code)) {
    return { status: 503, message: 'The database is temporarily unavailable. Please try again in a moment' };
  }
  if (code === 'LIMIT_FILE_SIZE') return { status: 413, message: 'That file is too large' };
  if (code === 'entity.too.large') return { status: 413, message: 'That request is too large' };
  if (code === 'entity.parse.failed') return { status: 400, message: 'The request was not understood' };
  if (err.status && err.status < 500) return { status: err.status, message: err.message };
  return { status: 500, message: 'Something went wrong on the server' };
}

app.use((err, req, res, next) => {
  // A short reference shown to the user and logged with the details, so a
  // problem reported by a tester can be found in the server log.
  const ref = crypto.randomBytes(3).toString('hex');
  console.error(`Unhandled error [${ref}] ${req.method} ${req.originalUrl} user=${req.user?.id ?? '-'}:`, err);
  if (res.headersSent) return next(err);
  const { status, message } = describeError(err);
  res.status(status).json({ error: status >= 500 ? `${message} (ref ${ref})` : message, ref });
});

// A forgotten await somewhere must be logged, not silently kill the process.
process.on('unhandledRejection', (reason) => console.error('Unhandled promise rejection:', reason));

const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  try {
    await testConnection();
    try {
      await runMigrations();
    } catch (err) {
      // Don't take the whole app down: the older features keep working.
      console.error('Database migration failed — branches and barcodes may not work until it succeeds:', err.message);
    }
    startExpiryMonitor();
  } catch (err) {
    console.error('Startup check failed:', err.message);
  }
});
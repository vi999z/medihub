const express = require('express');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const { testConnection } = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const medicineRoutes = require('./routes/medicineRoutes');
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
app.use(cookieParser());
app.use(express.json({ limit: '15mb' }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'MediHub API running', version: '2.0', ai: 'modern-llm' });
});

app.use('/api/auth', authRoutes);
app.use('/api/medicines', medicineRoutes);
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

const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  try {
    await testConnection();
    startExpiryMonitor();
  } catch (err) {
    console.error('Startup check failed:', err.message);
  }
});
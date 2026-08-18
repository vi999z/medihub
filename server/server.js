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
const ALLOWED_ORIGINS = new Set(
  (process.env.FRONTEND_ORIGIN || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
);

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
if (require('fs').existsSync(clientDist)) {
  app.use(express.static(clientDist, { index: false, fallthrough: true }));
  // SPA fallback — any non-API, non-static-asset request serves index.html
  // so React Router handles the route on hard refresh / direct navigation.
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    // Static assets (js, css, images, fonts, etc.) fall through to 404
    if (/\.\w{1,6}$/.test(req.path)) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.status(404).send('Not found');
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
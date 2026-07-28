const express = require('express');
const cors = require('cors');
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

const app = express();
app.use(cors({ origin: process.env.FRONTEND_ORIGIN }));
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'MediHub API running' });
});

app.use('/api/auth', authRoutes);
app.use('/api/medicines', medicineRoutes);
app.use('/api/batches', batchRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/suppliers', require('./routes/supplierRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/audit-logs', require('./routes/auditRoutes'));

const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  await testConnection();
  startExpiryMonitor();
});
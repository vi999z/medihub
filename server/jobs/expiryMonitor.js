const cron = require('node-cron');
const { pool } = require('../config/db');
const {
  notificationExists,
  createNotification,
  createNearExpiryAlert,
  createExpiredAlert,
  createLowStockAlert
} = require('../utils/alertHelpers');

// 1. Flag batches approaching expiry (respects EXPIRY_ALERT_TIERS from .env)
async function checkExpiringBatches() {
  const [batches] = await pool.query(
    `SELECT b.id, b.batch_number, b.expiry_date, b.quantity_remaining, m.name AS medicine_name
     FROM batches b JOIN medicines m ON b.medicine_id = m.id
     WHERE b.status = 'active' AND b.quantity_remaining > 0`
  );

  for (const batch of batches) {
    await createNearExpiryAlert(batch);
  }
}

// 2. Flip genuinely expired batches to 'expired' status
async function flipExpiredBatches() {
  const [expired] = await pool.query(
    `SELECT b.id, b.batch_number, m.name AS medicine_name
     FROM batches b JOIN medicines m ON b.medicine_id = m.id
     WHERE b.status = 'active' AND b.expiry_date < CURDATE()`
  );

  for (const batch of expired) {
    await pool.query('UPDATE batches SET status = "expired" WHERE id = ?', [batch.id]);
    await createExpiredAlert(batch);
  }
}

// 3a. Purge stale low_stock notifications for medicines that now have 0 stock
//     (these should never show — zero stock means the medicine was wiped/depleted)
async function purgeZeroStockNotifications() {
  await pool.query(
    `DELETE n FROM notifications n
     LEFT JOIN (
       SELECT m.id, COALESCE(SUM(b.quantity_remaining), 0) AS total_remaining
       FROM medicines m
       LEFT JOIN batches b ON b.medicine_id = m.id AND b.status = 'active'
       GROUP BY m.id
     ) stock ON n.reference_id = stock.id
     WHERE n.type = 'low_stock'
       AND (stock.total_remaining = 0 OR stock.total_remaining IS NULL)`
  );
}

// 3b. Low stock check — aggregates remaining quantity per medicine across all its active batches
async function checkLowStock() {
  const [medicines] = await pool.query(
    `SELECT m.id, m.name, m.reorder_level, COALESCE(SUM(b.quantity_remaining), 0) AS total_remaining
     FROM medicines m
     LEFT JOIN batches b ON b.medicine_id = m.id AND b.status = 'active'
     GROUP BY m.id, m.name, m.reorder_level
     HAVING total_remaining > 0 AND total_remaining <= m.reorder_level`
  );

  for (const med of medicines) {
    await createLowStockAlert(med);
  }
}

async function runAllChecks() {
  console.log('🔍 Running expiry & stock monitoring checks...');
  try {
    await purgeZeroStockNotifications(); // remove stale 0-stock alerts first
    await flipExpiredBatches();
    await checkExpiringBatches();
    await checkLowStock();
    console.log('✅ Monitoring checks complete');
  } catch (err) {
    console.error('❌ Monitoring job failed:', err.message);
  }
}

function startExpiryMonitor() {
  runAllChecks(); // run once immediately on server start
  cron.schedule('0 0 * * *', runAllChecks); // then daily at midnight
}

module.exports = { startExpiryMonitor, runAllChecks };
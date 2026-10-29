const cron = require('node-cron');
const { pool } = require('../config/db');
const { APP_TIMEZONE } = require('../utils/dates');
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
    await pool.query('UPDATE batches SET status = ? WHERE id = ?', ['expired', batch.id]);
    await createExpiredAlert(batch);
  }
}

// 3a. Purge low_stock notifications for medicines that no longer exist
//     (e.g. after a wipe). Zero stock is kept: it raises an "out of stock" alert.
async function purgeOrphanedStockNotifications() {
  await pool.query(
    `DELETE n FROM notifications n
     LEFT JOIN medicines m ON n.reference_id = m.id
     WHERE n.type = 'low_stock' AND m.id IS NULL`
  );
}

// 3b. Low stock check — aggregates remaining quantity per medicine across all its active batches
async function checkLowStock() {
  const [medicines] = await pool.query(
    `SELECT m.id, m.name, m.reorder_level, COALESCE(SUM(b.quantity_remaining), 0) AS total_remaining
     FROM medicines m
     LEFT JOIN batches b ON b.medicine_id = m.id AND b.status = 'active'
     GROUP BY m.id, m.name, m.reorder_level
     HAVING total_remaining <= m.reorder_level`
  );

  for (const med of medicines) {
    await createLowStockAlert(med);
  }
}

async function runAllChecks() {
  console.log('🔍 Running expiry & stock monitoring checks...');
  try {
    await purgeOrphanedStockNotifications(); // remove alerts for deleted medicines first
    await flipExpiredBatches();
    await checkExpiringBatches();
    await checkLowStock();
    console.log('✅ Monitoring checks complete');
  } catch (err) {
    console.error('❌ Monitoring job failed:', err.message);
  }
}

function startExpiryMonitor() {
  // Run once shortly after start-up (not immediately), so a server waking from
  // sleep answers its first visitor before this heavier check competes for the
  // database. Alerts for stock changes are created as they happen anyway.
  setTimeout(runAllChecks, 30000);
  // Then daily at midnight Philippine time (the server itself runs on UTC).
  cron.schedule('0 0 * * *', runAllChecks, { timezone: APP_TIMEZONE });
}

module.exports = { startExpiryMonitor, runAllChecks };
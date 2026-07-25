const cron = require('node-cron');
const { pool } = require('../config/db');

const ALERT_TIERS = (process.env.EXPIRY_ALERT_TIERS || '90,30,7')
  .split(',')
  .map(Number)
  .sort((a, b) => b - a); // e.g. [90, 30, 7]

async function notificationExists(type, referenceId, withinDays = 1) {
  const [rows] = await pool.query(
    `SELECT id FROM notifications
     WHERE type = ? AND reference_id = ? AND created_at >= (CURDATE() - INTERVAL ? DAY)`,
    [type, referenceId, withinDays]
  );
  return rows.length > 0;
}

async function createNotification(type, referenceId, message, severity) {
  await pool.query(
    'INSERT INTO notifications (type, reference_id, message, severity) VALUES (?, ?, ?, ?)',
    [type, referenceId, message, severity]
  );
}

// 1. Flag batches approaching expiry (respects EXPIRY_ALERT_TIERS from .env)
async function checkExpiringBatches() {
  const [batches] = await pool.query(
    `SELECT b.id, b.batch_number, b.expiry_date, b.quantity_remaining, m.name AS medicine_name
     FROM batches b JOIN medicines m ON b.medicine_id = m.id
     WHERE b.status = 'active' AND b.quantity_remaining > 0`
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const batch of batches) {
    const daysLeft = Math.ceil((new Date(batch.expiry_date) - today) / 86400000);
    const tier = ALERT_TIERS.find((t) => daysLeft <= t);
    if (tier === undefined) continue;

    if (await notificationExists('near_expiry', batch.id, 1)) continue;

    const severity = tier <= 7 ? 'critical' : tier <= 30 ? 'warning' : 'info';
    const message = `${batch.medicine_name} (batch ${batch.batch_number}) expires in ${daysLeft} day(s) — ${batch.quantity_remaining} units remaining.`;
    await createNotification('near_expiry', batch.id, message, severity);
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
    await createNotification(
      'expired', batch.id,
      `${batch.medicine_name} (batch ${batch.batch_number}) has expired and should be pulled from shelves.`,
      'critical'
    );
  }
}

// 3. Low stock check — aggregates remaining quantity per medicine across all its active batches
async function checkLowStock() {
  const [medicines] = await pool.query(
    `SELECT m.id, m.name, m.reorder_level, COALESCE(SUM(b.quantity_remaining), 0) AS total_remaining
     FROM medicines m
     LEFT JOIN batches b ON b.medicine_id = m.id AND b.status = 'active'
     GROUP BY m.id, m.name, m.reorder_level
     HAVING total_remaining <= m.reorder_level`
  );

  for (const med of medicines) {
    if (await notificationExists('low_stock', med.id, 3)) continue;
    const message = `${med.name} is low on stock: ${med.total_remaining} remaining (reorder level: ${med.reorder_level}).`;
    await createNotification('low_stock', med.id, message, 'warning');
  }
}

async function runAllChecks() {
  console.log('🔍 Running expiry & stock monitoring checks...');
  try {
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
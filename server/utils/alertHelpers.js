const { pool } = require('../config/db');

const ALERT_TIERS = (process.env.EXPIRY_ALERT_TIERS || '60,14,3')
  .split(',')
  .map(Number)
  .sort((a, b) => b - a); // e.g. [60, 14, 3]

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

/**
 * Generate a near-expiry alert for a batch if it falls within the configured alert tiers.
 * Returns the created notification type, or null if no alert applies.
 */
async function createNearExpiryAlert(batch) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysLeft = Math.ceil((new Date(batch.expiry_date) - today) / 86400000);
  const tier = ALERT_TIERS.find((t) => daysLeft <= t);
  if (tier === undefined) return null;

  if (await notificationExists('near_expiry', batch.id, 1)) return null;

  const severity = tier <= 3 ? 'critical' : tier <= 14 ? 'warning' : 'info';
  const message = `${batch.medicine_name} (batch ${batch.batch_number}) expires in ${daysLeft} day(s) — ${batch.quantity_remaining} units remaining.`;
  await createNotification('near_expiry', batch.id, message, severity);
  return 'near_expiry';
}

/**
 * Generate an expired alert for a batch whose expiry date is in the past.
 * Returns true if an alert was created.
 */
async function createExpiredAlert(batch) {
  if (await notificationExists('expired', batch.id, 1)) return false;
  const message = `${batch.medicine_name} (batch ${batch.batch_number}) has expired and should be pulled from shelves.`;
  await createNotification('expired', batch.id, message, 'critical');
  return true;
}

/**
 * Generate a low-stock alert for a medicine if its total remaining stock is
 * at or below its reorder level (and above zero).
 * Returns true if an alert was created.
 */
async function createLowStockAlert(medicine) {
  const totalRemaining = Number(medicine.total_remaining) || 0;
  const reorderLevel = Number(medicine.reorder_level) || 0;
  if (totalRemaining <= 0 || totalRemaining > reorderLevel) return false;

  if (await notificationExists('low_stock', medicine.id, 3)) return false;
  const message = `${medicine.name} is low on stock: ${totalRemaining} remaining (reorder level: ${reorderLevel}).`;
  await createNotification('low_stock', medicine.id, message, 'warning');
  return true;
}

module.exports = {
  ALERT_TIERS,
  notificationExists,
  createNotification,
  createNearExpiryAlert,
  createExpiredAlert,
  createLowStockAlert
};
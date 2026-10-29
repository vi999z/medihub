const { pool } = require('../config/db');

const ALERT_TIERS = (process.env.EXPIRY_ALERT_TIERS || '14,7,3')
  .split(',')
  .map(Number)
  .sort((a, b) => b - a); // e.g. [14, 7, 3]

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
  // The tightest tier that applies (2 days left → the 3-day tier, not 14).
  const tier = [...ALERT_TIERS].reverse().find((t) => daysLeft <= t);
  if (tier === undefined) return null;

  if (await notificationExists('near_expiry', batch.id, 1)) return null;

  const severity = tier <= 3 ? 'critical' : tier <= 7 ? 'warning' : 'info';
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
 * Generate a low-stock alert for a medicine if its total usable stock is at
 * or below its reorder level. Zero stock is the most urgent case, so it gets
 * a critical "out of stock" alert instead of being skipped.
 * Returns true if an alert was created.
 */
async function createLowStockAlert(medicine) {
  const totalRemaining = Number(medicine.total_remaining) || 0;
  const reorderLevel = Number(medicine.reorder_level) || 0;
  if (totalRemaining > reorderLevel) return false;

  if (await notificationExists('low_stock', medicine.id, 3)) return false;
  const outOfStock = totalRemaining <= 0;
  const message = outOfStock
    ? `${medicine.name} is out of stock (reorder level: ${reorderLevel}).`
    : `${medicine.name} is low on stock: ${totalRemaining} remaining (reorder level: ${reorderLevel}).`;
  await createNotification('low_stock', medicine.id, message, outOfStock ? 'critical' : 'warning');
  return true;
}

/**
 * Re-check a medicine's low-stock alert right after its stock changes, so the
 * alert appears immediately instead of at the next nightly run.
 */
async function refreshLowStockAlert(medicineId) {
  const [rows] = await pool.query(
    `SELECT m.id, m.name, m.reorder_level,
            COALESCE(SUM(CASE WHEN b.status = 'active' AND b.expiry_date >= CURDATE() THEN b.quantity_remaining ELSE 0 END), 0) AS total_remaining
     FROM medicines m
     LEFT JOIN batches b ON b.medicine_id = m.id
     WHERE m.id = ?
     GROUP BY m.id, m.name, m.reorder_level`,
    [medicineId]
  );
  if (rows[0]) await createLowStockAlert(rows[0]);
}

/**
 * Re-check one batch's expiry alerts (and its medicine's stock level) right
 * after it is received, edited, or moved. An active batch already past its
 * expiry date is flipped to 'expired' here too.
 */
async function refreshAlertsForBatch(batchId) {
  const [rows] = await pool.query(
    `SELECT b.id, b.medicine_id, b.batch_number, b.expiry_date, b.quantity_remaining, b.status,
            (b.expiry_date < CURDATE()) AS is_past_expiry, m.name AS medicine_name
     FROM batches b JOIN medicines m ON b.medicine_id = m.id
     WHERE b.id = ?`,
    [batchId]
  );
  const batch = rows[0];
  if (!batch) return;
  if (batch.status === 'active' && Number(batch.is_past_expiry)) {
    await pool.query("UPDATE batches SET status = 'expired' WHERE id = ?", [batch.id]);
    batch.status = 'expired';
  }
  if (batch.status === 'expired') {
    await createExpiredAlert(batch);
  } else if (batch.status === 'active' && Number(batch.quantity_remaining) > 0) {
    await createNearExpiryAlert(batch);
  }
  await refreshLowStockAlert(batch.medicine_id);
}

module.exports = {
  ALERT_TIERS,
  notificationExists,
  createNotification,
  createNearExpiryAlert,
  createExpiredAlert,
  createLowStockAlert,
  refreshLowStockAlert,
  refreshAlertsForBatch
};
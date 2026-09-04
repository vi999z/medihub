const { pool } = require('../config/db');

async function getSummary() {
  const [[medicineCount]] = await pool.query('SELECT COUNT(*) AS total FROM medicines');

  const [[inventoryValue]] = await pool.query(
    `SELECT COALESCE(SUM(quantity_remaining * COALESCE(cost_price, 0)), 0) AS total
     FROM batches WHERE status = 'active' AND expiry_date >= CURDATE()`
  );

  const [[expiringSoon]] = await pool.query(
    `SELECT COUNT(*) AS total FROM batches
     WHERE status = 'active' AND expiry_date BETWEEN CURDATE() AND (CURDATE() + INTERVAL 14 DAY)`
  );

  const [[expiredCount]] = await pool.query(
    `SELECT COUNT(*) AS total FROM batches WHERE status = 'expired'`
  );

  const [[lowStockCount]] = await pool.query(
    `SELECT COUNT(*) AS total FROM (
       SELECT m.id, COALESCE(SUM(b.quantity_remaining), 0) AS remaining
       FROM medicines m
       LEFT JOIN batches b ON b.medicine_id = m.id AND b.status = 'active'
       GROUP BY m.id, m.reorder_level
       HAVING remaining <= MAX(m.reorder_level)
     ) AS low`
  );

  return {
    total_medicines: medicineCount.total,
    inventory_value: parseFloat(inventoryValue.total),
    expiring_soon: expiringSoon.total,
    expired: expiredCount.total,
    low_stock: lowStockCount.total,
  };
}

async function getExpiringSoon(days = 14) {
  const [rows] = await pool.query(
    `SELECT b.id, b.batch_number, b.expiry_date, b.quantity_remaining, m.name AS medicine_name,
            DATEDIFF(b.expiry_date, CURDATE()) AS days_left
     FROM batches b JOIN medicines m ON b.medicine_id = m.id
     WHERE b.status = 'active' AND b.expiry_date BETWEEN CURDATE() AND (CURDATE() + INTERVAL ? DAY)
     ORDER BY b.expiry_date ASC`,
    [days]
  );
  return rows;
}

async function getLowStock() {
  const [rows] = await pool.query(
    `SELECT m.id, m.name, m.reorder_level, COALESCE(SUM(b.quantity_remaining), 0) AS total_remaining
     FROM medicines m
     LEFT JOIN batches b ON b.medicine_id = m.id AND b.status = 'active'
     GROUP BY m.id, m.name, m.reorder_level
     HAVING total_remaining <= m.reorder_level
     ORDER BY total_remaining ASC`
  );
  return rows;
}

async function getSalesTrend(days = 30) {
  const [rows] = await pool.query(
    `SELECT DATE(st.created_at) AS day, SUM(-st.quantity) AS units_sold
     FROM stock_transactions st
     WHERE st.transaction_type = 'sale' AND st.created_at >= (CURDATE() - INTERVAL ? DAY)
     GROUP BY DATE(st.created_at) ORDER BY day ASC`,
    [days]
  );
  const map = Object.fromEntries(rows.map((r) => [r.day.toISOString().slice(0, 10), Number(r.units_sold)]));
  const series = [];
  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    series.push({ date: key, units_sold: map[key] || 0 });
  }
  return series;
}

async function getByCategory() {
  const [rows] = await pool.query(
    `SELECT COALESCE(m.category, 'Uncategorized') AS name, COUNT(*) AS count
     FROM medicines m
     LEFT JOIN batches b ON b.medicine_id = m.id AND b.status = 'active'
     GROUP BY m.category
     ORDER BY count DESC`
  );
  return rows;
}

async function getBatchesByStatus(status) {
  const validStatuses = ['active', 'expired', 'depleted', 'recalled'];
  const safeStatus = validStatuses.includes(status) ? status : 'active';
  const [rows] = await pool.query(
    `SELECT b.id, b.batch_number, b.status, b.quantity_received, b.quantity_remaining,
            b.cost_price, b.selling_price, b.expiry_date, b.manufacture_date,
            b.created_at,
            m.name AS medicine_name, m.category, m.unit,
            s.name AS supplier_name,
            DATEDIFF(b.expiry_date, CURDATE()) AS days_until_expiry
     FROM batches b
     JOIN medicines m ON b.medicine_id = m.id
     LEFT JOIN suppliers s ON b.supplier_id = s.id
     WHERE b.status = ?
     ORDER BY b.expiry_date ASC`,
    [safeStatus]
  );
  return rows;
}

async function getWastedMedicines() {
  // Wasted = depleted or expired batches with cost_price info
  const [rows] = await pool.query(
    `SELECT b.id, b.batch_number, b.status, b.quantity_received, b.quantity_remaining,
            b.cost_price, b.selling_price, b.expiry_date,
            (b.quantity_remaining * COALESCE(b.cost_price, 0)) AS estimated_waste_value,
            m.name AS medicine_name, m.category, m.unit,
            s.name AS supplier_name
     FROM batches b
     JOIN medicines m ON b.medicine_id = m.id
     LEFT JOIN suppliers s ON b.supplier_id = s.id
     WHERE b.status IN ('expired', 'depleted')
     ORDER BY estimated_waste_value DESC`
  );
  return rows;
}

async function getNotificationsReport(severity = null, unreadOnly = false) {
  const params = [];
  const clauses = [];
  if (severity) { clauses.push('n.severity = ?'); params.push(severity); }
  if (unreadOnly) { clauses.push('n.is_read = 0'); }
  const whereStr = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const [rows] = await pool.query(
    `SELECT n.id, n.type, n.severity, n.message, n.is_read, n.created_at
     FROM notifications n
     ${whereStr}
     ORDER BY n.created_at DESC
     LIMIT 200`,
    params
  );
  return rows;
}

async function getTransactionsReport(days = 30, type = null) {
  const params = [days];
  const typeClause = type ? 'AND st.transaction_type = ?' : '';
  if (type) params.push(type);
  const [rows] = await pool.query(
    `SELECT st.id, st.transaction_type, st.quantity, st.reason, st.created_at,
            m.name AS medicine_name, m.category,
            b.batch_number, b.expiry_date,
            u.name AS user_name
     FROM stock_transactions st
     JOIN batches b ON st.batch_id = b.id
     JOIN medicines m ON b.medicine_id = m.id
     LEFT JOIN users u ON st.user_id = u.id
     WHERE st.created_at >= (CURDATE() - INTERVAL ? DAY)
     ${typeClause}
     ORDER BY st.created_at DESC`,
    params
  );
  return rows;
}

module.exports = { getSummary, getExpiringSoon, getLowStock, getSalesTrend, getByCategory, getBatchesByStatus, getWastedMedicines, getTransactionsReport, getNotificationsReport };

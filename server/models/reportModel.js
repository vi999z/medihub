const { pool } = require('../config/db');

async function getSummary() {
  const [[medicineCount]] = await pool.query('SELECT COUNT(*) AS total FROM medicines');

  const [[inventoryValue]] = await pool.query(
    `SELECT COALESCE(SUM(quantity_remaining * cost_price), 0) AS total
     FROM batches WHERE status = 'active'`
  );

  const [[expiringSoon]] = await pool.query(
    `SELECT COUNT(*) AS total FROM batches
     WHERE status = 'active' AND expiry_date BETWEEN CURDATE() AND (CURDATE() + INTERVAL 30 DAY)`
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

async function getExpiringSoon(days = 30) {
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

module.exports = { getSummary, getExpiringSoon, getLowStock };
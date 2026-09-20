const { pool } = require('../config/db');

async function getSummary() {
  const [[medicineCount]] = await pool.query('SELECT COUNT(*) AS total FROM medicines');

  const [[inventoryValue]] = await pool.query(
    `SELECT COALESCE(SUM(quantity_remaining * COALESCE(cost_price, 0)), 0) AS cost_total,
            COALESCE(SUM(quantity_remaining * COALESCE(selling_price, 0)), 0) AS retail_total
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

  const [[outOfStockCount]] = await pool.query(
    `SELECT COUNT(*) AS total FROM (
       SELECT m.id, COALESCE(SUM(b.quantity_remaining), 0) AS remaining
       FROM medicines m
       LEFT JOIN batches b ON b.medicine_id = m.id AND b.status = 'active'
       GROUP BY m.id
       HAVING remaining <= 0
     ) AS oos`
  );

  const costTotal = parseFloat(inventoryValue.cost_total);
  const retailTotal = parseFloat(inventoryValue.retail_total);
  const marginPct = retailTotal > 0 ? ((retailTotal - costTotal) / retailTotal) * 100 : 0;

  return {
    total_medicines: medicineCount.total,
    inventory_value: costTotal,
    retail_value: retailTotal,
    margin_pct: marginPct,
    margin_value: retailTotal - costTotal,
    expiring_soon: expiringSoon.total,
    expired: expiredCount.total,
    low_stock: lowStockCount.total,
    out_of_stock: outOfStockCount.total,
  };
}

async function getTodaySales() {
  const [[today]] = await pool.query(
    `SELECT COALESCE(SUM(-st.quantity * COALESCE(b.selling_price, 0)), 0) AS total
     FROM stock_transactions st
     JOIN batches b ON st.batch_id = b.id
     WHERE st.transaction_type = 'sale' AND DATE(st.created_at) = CURDATE()`
  );
  const [[yesterday]] = await pool.query(
    `SELECT COALESCE(SUM(-st.quantity * COALESCE(b.selling_price, 0)), 0) AS total
     FROM stock_transactions st
     JOIN batches b ON st.batch_id = b.id
     WHERE st.transaction_type = 'sale' AND DATE(st.created_at) = CURDATE() - INTERVAL 1 DAY`
  );
  const todayTotal = parseFloat(today.total);
  const yesterdayTotal = parseFloat(yesterday.total);
  const vsYesterdayPct = yesterdayTotal > 0 ? ((todayTotal - yesterdayTotal) / yesterdayTotal) * 100 : null;

  return { total: todayTotal, vs_yesterday_pct: vsYesterdayPct };
}

async function getNeedsAttention(days = 14) {
  const [rows] = await pool.query(
    `SELECT m.id, m.name, m.category, m.dosage_form, m.unit, m.reorder_level,
            COALESCE(SUM(b.quantity_remaining), 0) AS total_remaining,
            MIN(CASE WHEN b.status = 'active' AND b.expiry_date BETWEEN CURDATE() AND (CURDATE() + INTERVAL ? DAY)
                THEN b.expiry_date END) AS nearest_expiry
     FROM medicines m
     LEFT JOIN batches b ON b.medicine_id = m.id AND b.status = 'active'
     GROUP BY m.id, m.name, m.category, m.dosage_form, m.unit, m.reorder_level`,
    [days]
  );

  const counts = { out_of_stock: 0, low_stock: 0, expiring: 0, healthy: 0 };
  const classified = rows.map((r) => {
    const remaining = Number(r.total_remaining);
    let status;
    if (remaining <= 0) status = 'out_of_stock';
    else if (r.nearest_expiry) status = 'expiring';
    else if (remaining <= r.reorder_level) status = 'low_stock';
    else status = 'healthy';
    counts[status]++;
    return { ...r, total_remaining: remaining, status };
  });

  const priority = { out_of_stock: 0, expiring: 1, low_stock: 2, healthy: 3 };
  const items = classified
    .sort((a, b) => {
      if (priority[a.status] !== priority[b.status]) return priority[a.status] - priority[b.status];
      if (a.status === 'expiring') return new Date(a.nearest_expiry) - new Date(b.nearest_expiry);
      if (a.status === 'healthy') return String(a.name).localeCompare(String(b.name));
      return a.total_remaining - b.total_remaining;
    });

  return { counts, items };
}

async function getTopSellers(limit = 5, days = 30) {
  const [rows] = await pool.query(
    `SELECT m.id, m.name,
            COALESCE(SUM(-st.quantity), 0) AS quantity_sold,
            COALESCE(SUM(-st.quantity * COALESCE(b.selling_price, 0)), 0) AS revenue
     FROM stock_transactions st
     JOIN batches b ON st.batch_id = b.id
     JOIN medicines m ON b.medicine_id = m.id
     WHERE st.transaction_type = 'sale' AND st.created_at >= (CURDATE() - INTERVAL ? DAY)
     GROUP BY m.id, m.name
     ORDER BY revenue DESC
     LIMIT ?`,
    [days, limit]
  );
  return rows.map((r) => ({ ...r, quantity_sold: Number(r.quantity_sold), revenue: parseFloat(r.revenue) }));
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
    `SELECT DATE(st.created_at) AS day,
            SUM(-st.quantity) AS units_sold,
            SUM(-st.quantity * COALESCE(b.selling_price, 0)) AS revenue
     FROM stock_transactions st
     JOIN batches b ON st.batch_id = b.id
     WHERE st.transaction_type = 'sale' AND st.created_at >= (CURDATE() - INTERVAL ? DAY)
     GROUP BY DATE(st.created_at) ORDER BY day ASC`,
    [days]
  );
  const map = Object.fromEntries(
    rows.map((r) => [r.day.toISOString().slice(0, 10), { units_sold: Number(r.units_sold), revenue: parseFloat(r.revenue) }])
  );
  const series = [];
  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    const entry = map[key] || { units_sold: 0, revenue: 0 };
    series.push({ date: key, units_sold: entry.units_sold, revenue: entry.revenue });
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
            u.full_name AS user_name
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

module.exports = { getSummary, getTodaySales, getNeedsAttention, getTopSellers, getExpiringSoon, getLowStock, getSalesTrend, getByCategory, getBatchesByStatus, getWastedMedicines, getTransactionsReport, getNotificationsReport };

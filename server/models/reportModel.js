const { pool } = require('../config/db');
const { localDateKey, addDays, startOfLocalDay } = require('../utils/dates');

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
    `SELECT m.id, m.name, m.category, m.dosage_form, m.unit, m.reorder_level, m.branch,
            COALESCE(SUM(b.quantity_remaining), 0) AS total_remaining,
            MIN(CASE WHEN b.status = 'active' AND b.expiry_date BETWEEN CURDATE() AND (CURDATE() + INTERVAL ? DAY)
                THEN b.expiry_date END) AS nearest_expiry
     FROM medicines m
     LEFT JOIN batches b ON b.medicine_id = m.id AND b.status = 'active'
     GROUP BY m.id, m.name, m.category, m.dosage_form, m.unit, m.reorder_level, m.branch`,
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

async function getExpiringSoon(days = 14, { branch } = {}) {
  const f = branchFilter(branch, 'COALESCE(m.branch, b.pending_branch)');
  const [rows] = await pool.query(
    `SELECT b.id, COALESCE(m.branch, b.pending_branch) AS branch,
            COALESCE(m.name, b.pending_name) AS medicine_name,
            b.batch_number, b.expiry_date, b.quantity_remaining,
            DATEDIFF(b.expiry_date, CURDATE()) AS days_left
     FROM batches b LEFT JOIN medicines m ON b.medicine_id = m.id
     WHERE b.status = 'active' AND b.quantity_remaining > 0
       AND b.expiry_date BETWEEN CURDATE() AND (CURDATE() + INTERVAL ? DAY)${f.sql}
     ORDER BY b.expiry_date ASC`,
    [days, ...f.params]
  );
  return rows;
}

async function getLowStock({ branch } = {}) {
  const f = branchFilter(branch, 'm.branch');
  const [rows] = await pool.query(
    `SELECT m.id, m.branch, m.name, m.reorder_level, COALESCE(SUM(b.quantity_remaining), 0) AS total_remaining
     FROM medicines m
     LEFT JOIN batches b ON b.medicine_id = m.id AND b.status = 'active' AND b.expiry_date >= CURDATE()
     WHERE 1 = 1${f.sql}
     GROUP BY m.id, m.branch, m.name, m.reorder_level
     HAVING total_remaining <= m.reorder_level
     ORDER BY total_remaining ASC`,
    f.params
  );
  return rows;
}

async function getSalesTrend(days = 30) {
  const dayCount = Math.min(Math.max(parseInt(days, 10) || 30, 1), 366);
  const today = localDateKey();
  const firstDay = addDays(today, -(dayCount - 1));
  // Group by calendar day in the pharmacy's timezone (in JS, not with SQL
  // DATE(), which uses the database session's timezone).
  const [rows] = await pool.query(
    `SELECT st.created_at, -st.quantity AS units, COALESCE(b.selling_price, 0) AS price
     FROM stock_transactions st
     JOIN batches b ON st.batch_id = b.id
     WHERE st.transaction_type = 'sale' AND st.created_at >= ?`,
    [startOfLocalDay(firstDay)]
  );
  const map = {};
  for (const r of rows) {
    const key = localDateKey(new Date(r.created_at));
    const entry = map[key] || (map[key] = { units_sold: 0, revenue: 0 });
    entry.units_sold += Number(r.units);
    entry.revenue += Number(r.units) * parseFloat(r.price);
  }
  const series = [];
  for (let i = 0; i < dayCount; i++) {
    const key = addDays(firstDay, i);
    const entry = map[key] || { units_sold: 0, revenue: 0 };
    series.push({ date: key, units_sold: entry.units_sold, revenue: Math.round(entry.revenue * 100) / 100 });
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

// ── Report filters ──────────────────────────────────────────────────────────
// `branch` (a branch name, or empty for all branches) and a date range
// (`from` / `to`, both YYYY-MM-DD, inclusive, in the pharmacy's timezone).
function branchFilter(branch, column) {
  return branch ? { sql: ` AND ${column} = ?`, params: [branch] } : { sql: '', params: [] };
}

function periodBounds(from, to) {
  return [startOfLocalDay(from), startOfLocalDay(addDays(to, 1))];
}

async function getBatchesByStatus(status, { branch } = {}) {
  const validStatuses = ['active', 'expired', 'depleted', 'recalled'];
  const safeStatus = validStatuses.includes(status) ? status : 'active';
  const f = branchFilter(branch, 'COALESCE(m.branch, b.pending_branch)');
  const [rows] = await pool.query(
    `SELECT COALESCE(m.branch, b.pending_branch) AS branch,
            COALESCE(m.name, b.pending_name) AS medicine_name,
            b.batch_number, b.status, b.quantity_received, b.quantity_remaining,
            b.cost_price, b.selling_price, b.expiry_date, b.manufacture_date,
            COALESCE(m.category, 'Not linked') AS category, m.unit,
            s.name AS supplier_name,
            DATEDIFF(b.expiry_date, CURDATE()) AS days_until_expiry
     FROM batches b
     LEFT JOIN medicines m ON b.medicine_id = m.id
     LEFT JOIN suppliers s ON b.supplier_id = s.id
     WHERE b.status = ?${f.sql}
     ORDER BY b.expiry_date ASC`,
    [safeStatus, ...f.params]
  );
  return rows;
}

async function getWastedMedicines({ branch } = {}) {
  // Wasted = stock disposed of (disposal movements) plus stock still sitting
  // in expired batches. Batches that simply sold out are not waste.
  const f = branchFilter(branch, 'COALESCE(m.branch, b.pending_branch)');
  const [rows] = await pool.query(
    `SELECT COALESCE(m.branch, b.pending_branch) AS branch,
            COALESCE(m.name, b.pending_name) AS medicine_name,
            b.batch_number, b.status, b.quantity_received,
            COALESCE(d.disposed, 0) AS quantity_disposed,
            CASE WHEN b.status = 'expired' THEN b.quantity_remaining ELSE 0 END AS quantity_expired_in_stock,
            COALESCE(d.disposed, 0) + CASE WHEN b.status = 'expired' THEN b.quantity_remaining ELSE 0 END AS quantity_wasted,
            b.cost_price, b.expiry_date,
            (COALESCE(d.disposed, 0) + CASE WHEN b.status = 'expired' THEN b.quantity_remaining ELSE 0 END)
              * COALESCE(b.cost_price, 0) AS estimated_waste_value,
            s.name AS supplier_name
     FROM batches b
     LEFT JOIN medicines m ON b.medicine_id = m.id
     LEFT JOIN suppliers s ON b.supplier_id = s.id
     LEFT JOIN (
       SELECT batch_id, SUM(-quantity) AS disposed
       FROM stock_transactions WHERE transaction_type = 'disposal'
       GROUP BY batch_id
     ) d ON d.batch_id = b.id
     WHERE (COALESCE(d.disposed, 0) > 0 OR (b.status = 'expired' AND b.quantity_remaining > 0))${f.sql}
     ORDER BY estimated_waste_value DESC`,
    f.params
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

// Stock movements in a date range, optionally for one branch and/or one type.
async function getTransactionsReport({ from, to, type = null, branch } = {}) {
  const [start, end] = periodBounds(from, to);
  const f = branchFilter(branch, 'COALESCE(m.branch, b.pending_branch)');
  const params = [start, end, ...f.params];
  let typeClause = '';
  if (type) { typeClause = ' AND st.transaction_type = ?'; params.push(type); }
  const [rows] = await pool.query(
    `SELECT st.id, st.created_at, COALESCE(m.branch, b.pending_branch) AS branch, st.transaction_type,
            COALESCE(m.name, b.pending_name) AS medicine_name, b.batch_number, st.quantity,
            st.reason, u.full_name AS user_name
     FROM stock_transactions st
     JOIN batches b ON st.batch_id = b.id
     LEFT JOIN medicines m ON b.medicine_id = m.id
     LEFT JOIN users u ON st.user_id = u.id
     WHERE st.created_at >= ? AND st.created_at < ?${f.sql}${typeClause}
     ORDER BY st.created_at DESC`,
    params
  );
  return rows;
}

// Sales by medicine for a date range, optionally one branch. Returns count
// against sales, so "net" figures are sales minus returned stock.
async function getSalesReport({ from, to, branch } = {}) {
  const [start, end] = periodBounds(from, to);
  const f = branchFilter(branch, 'm.branch');
  const [rows] = await pool.query(
    `SELECT m.branch, m.name AS medicine_name, m.category, m.unit,
            SUM(CASE WHEN st.transaction_type = 'sale' THEN -st.quantity ELSE 0 END) AS units_sold,
            SUM(CASE WHEN st.transaction_type = 'return' THEN st.quantity ELSE 0 END) AS units_returned,
            SUM(-st.quantity) AS net_units,
            SUM(-st.quantity * COALESCE(b.selling_price, 0)) AS net_sales,
            SUM(-st.quantity * COALESCE(b.cost_price, 0)) AS net_cost
     FROM stock_transactions st
     JOIN batches b ON st.batch_id = b.id
     JOIN medicines m ON b.medicine_id = m.id
     WHERE st.transaction_type IN ('sale', 'return') AND st.created_at >= ? AND st.created_at < ?${f.sql}
     GROUP BY m.id, m.branch, m.name, m.category, m.unit
     HAVING units_sold > 0 OR units_returned > 0
     ORDER BY net_sales DESC`,
    [start, end, ...f.params]
  );
  return rows.map((r) => {
    const netSales = Math.round(Number(r.net_sales) * 100) / 100;
    const netCost = Math.round(Number(r.net_cost) * 100) / 100;
    return {
      branch: r.branch, medicine_name: r.medicine_name, category: r.category, unit: r.unit,
      units_sold: Number(r.units_sold), units_returned: Number(r.units_returned), net_units: Number(r.net_units),
      net_sales: netSales, estimated_cost: netCost, estimated_profit: Math.round((netSales - netCost) * 100) / 100,
    };
  });
}

// Stock value per medicine (active, unexpired batches), optionally one branch.
async function getInventoryValue({ branch } = {}) {
  const f = branchFilter(branch, 'm.branch');
  const [rows] = await pool.query(
    `SELECT m.branch, m.name AS medicine_name, m.category, m.unit,
            COALESCE(SUM(b.quantity_remaining), 0) AS total_quantity,
            COALESCE(SUM(b.quantity_remaining * COALESCE(b.cost_price, 0)), 0) AS value_at_cost,
            COALESCE(SUM(b.quantity_remaining * COALESCE(b.selling_price, 0)), 0) AS value_at_retail
     FROM medicines m
     LEFT JOIN batches b ON b.medicine_id = m.id AND b.status = 'active' AND b.expiry_date >= CURDATE()
     WHERE 1 = 1${f.sql}
     GROUP BY m.id, m.branch, m.name, m.category, m.unit
     HAVING total_quantity > 0
     ORDER BY value_at_cost DESC`,
    f.params
  );
  return rows.map((r) => ({
    ...r,
    total_quantity: Number(r.total_quantity),
    value_at_cost: Math.round(Number(r.value_at_cost) * 100) / 100,
    value_at_retail: Math.round(Number(r.value_at_retail) * 100) / 100,
  }));
}

module.exports = { getSalesReport, getInventoryValue, getSummary, getTodaySales, getNeedsAttention, getTopSellers, getExpiringSoon, getLowStock, getSalesTrend, getByCategory, getBatchesByStatus, getWastedMedicines, getTransactionsReport, getNotificationsReport };

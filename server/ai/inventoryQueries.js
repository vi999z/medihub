/**
 * Inventory Queries
 * All database query functions that retrieve live inventory data.
 */

const { pool } = require('../config/db');
const { scoreActiveBatches } = require('./expiryRiskModel');
const { getReorderSuggestions } = require('./demandForecastModel');
const { detectAnomalies } = require('./anomalyDetection');

async function getInventorySummary() {
  const [summary] = await pool.query('SELECT * FROM summary_view');
  const [categoryData] = await pool.query(
    'SELECT category, COUNT(*) as count, SUM(quantity) as total_quantity FROM medicines JOIN batches ON medicines.id = batches.medicine_id WHERE batches.status = "active" GROUP BY category'
  );
  return {
    summary: summary[0] || {},
    by_category: categoryData || [],
    timestamp: new Date().toISOString()
  };
}

async function getExpiryAnalysis(daysWindow) {
  const [expiringBatches] = await pool.query(
    `SELECT m.name, m.id, b.batch_number, b.quantity, b.expiry_date,
            DATEDIFF(b.expiry_date, CURDATE()) as days_until_expiry,
            COALESCE(SUM(st.quantity * CASE WHEN st.transaction_type = 'sale' THEN -1 ELSE 1 END), 0) as consumption_rate
     FROM batches b
     JOIN medicines m ON b.medicine_id = m.id
     LEFT JOIN stock_transactions st ON st.batch_id = b.id AND st.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
     WHERE b.status = 'active' AND b.expiry_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
     GROUP BY b.id
     ORDER BY b.expiry_date ASC`,
    [daysWindow]
  );

  const expiryRisk = await scoreActiveBatches();

  return {
    expiring_soon: expiringBatches || [],
    risk_analysis: expiryRisk,
    window_days: daysWindow,
    total_at_risk: expiringBatches?.length || 0
  };
}

async function getLowStockItems(limit) {
  const [lowStock] = await pool.query(
    `SELECT m.id, m.name, m.category, b.quantity, m.reorder_level, m.min_stock,
            (m.reorder_level - b.quantity) as quantity_needed,
            COALESCE(AVG(CASE WHEN st.transaction_type = 'sale' THEN -st.quantity ELSE 0 END), 0) as daily_avg_sales
     FROM medicines m
     LEFT JOIN batches b ON m.id = b.medicine_id AND b.status = 'active'
     LEFT JOIN stock_transactions st ON b.id = st.batch_id AND st.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
     GROUP BY m.id
     HAVING b.quantity < m.reorder_level OR b.quantity IS NULL
     ORDER BY (m.reorder_level - COALESCE(b.quantity, 0)) DESC
     LIMIT ?`,
    [limit]
  );

  return {
    low_stock_items: lowStock || [],
    count: lowStock?.length || 0
  };
}

async function getSalesTrends(days) {
  const [trends] = await pool.query(
    `SELECT DATE(st.created_at) as date,
            COUNT(DISTINCT st.id) as transaction_count,
            SUM(CASE WHEN st.transaction_type = 'sale' THEN -st.quantity ELSE st.quantity END) as net_movement,
            SUM(CASE WHEN st.transaction_type = 'sale' THEN -st.quantity ELSE 0 END) as total_sold,
            COUNT(DISTINCT st.medicine_id) as unique_medicines
     FROM stock_transactions st
     WHERE st.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY DATE(st.created_at)
     ORDER BY date DESC`,
    [days]
  );

  return {
    daily_trends: trends || [],
    days_analyzed: days,
    avg_daily_transactions: trends ? Math.round(trends.reduce((a, t) => a + t.transaction_count, 0) / days) : 0
  };
}

async function getAnomalyAnalysis(severity = null) {
  const result = await detectAnomalies(30);
  let anomalies = result.anomalies || [];

  if (severity) {
    anomalies = anomalies.filter(a => a.severity === severity);
  }

  return {
    total_anomalies: anomalies.length,
    by_severity: {
      critical: anomalies.filter(a => a.severity === 'critical').length,
      warning: anomalies.filter(a => a.severity === 'warning').length,
      info: anomalies.filter(a => a.severity === 'info').length
    },
    anomalies: anomalies.slice(0, 20),
    analysis_window_days: 30
  };
}

async function getReorderRecommendations(includeRationale) {
  const suggestions = await getReorderSuggestions();

  if (includeRationale && Array.isArray(suggestions)) {
    return {
      recommendations: suggestions.map(s => ({
        ...s,
        rationale: `Based on ${s.daily_velocity?.toFixed(1) || 0} units/day consumption, recommend ordering ${s.suggested_quantity || 0} units to maintain ${Math.ceil((s.suggested_quantity || 0) / (s.daily_velocity || 1)) || 0} days of stock.`
      })),
      count: suggestions.length
    };
  }

  return { recommendations: suggestions || [], count: Array.isArray(suggestions) ? suggestions.length : 0 };
}

async function getSupplierPerformance(supplierId = null) {
  let query = `
    SELECT s.id, s.name,
           COUNT(DISTINCT po.id) as total_orders,
           AVG(DATEDIFF(po.delivery_date, po.order_date)) as avg_delivery_days,
           SUM(po.total_amount) as total_spent,
           COUNT(DISTINCT CASE WHEN po.status = 'delivered' THEN po.id END) as completed_orders
    FROM suppliers s
    LEFT JOIN purchase_orders po ON s.id = po.supplier_id
  `;

  if (supplierId) {
    query += ` WHERE s.id = ${supplierId}`;
  }

  query += ` GROUP BY s.id`;

  const [suppliers] = await pool.query(query);
  return { suppliers: suppliers || [] };
}

async function getBatchDetails(medicineId) {
  const [batches] = await pool.query(
    `SELECT b.id, b.batch_number, b.quantity, b.expiry_date, b.date_received, b.status,
            DATEDIFF(b.expiry_date, CURDATE()) as days_until_expiry,
            m.name as medicine_name,
            COUNT(st.id) as transaction_count,
            SUM(CASE WHEN st.transaction_type = 'sale' THEN -st.quantity ELSE st.quantity END) as net_movement
     FROM batches b
     JOIN medicines m ON b.medicine_id = m.id
     LEFT JOIN stock_transactions st ON b.id = st.batch_id
     WHERE m.id = ?
     GROUP BY b.id
     ORDER BY b.expiry_date ASC`,
    [medicineId]
  );

  return { batches: batches || [], medicine_id: medicineId };
}

module.exports = {
  getInventorySummary,
  getExpiryAnalysis,
  getLowStockItems,
  getSalesTrends,
  getAnomalyAnalysis,
  getReorderRecommendations,
  getSupplierPerformance,
  getBatchDetails
};

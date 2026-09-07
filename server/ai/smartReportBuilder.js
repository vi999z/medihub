const { pool } = require('../config/db');

const REPORT_WINDOWS = { recent: 30, previous: 30, expiry: 30 };

function round(value, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function percentageChange(current, previous) {
  if (!previous) return current ? null : 0;
  return round(((current - previous) / previous) * 100, 1);
}

function daysToStockout(stock, dailyDemand) {
  if (stock <= 0) return { value: 0, state: 'no_stock' };
  if (dailyDemand <= 0) return { value: null, state: 'no_demand' };
  return { value: round(stock / dailyDemand, 1), state: 'estimated' };
}

function priorityFor(item) {
  if (item.current_stock <= 0 && item.daily_demand > 0) return { priority: 'critical', score: 100 };
  if (item.days_to_stockout.value !== null && item.days_to_stockout.value <= 7) return { priority: 'critical', score: 90 - item.days_to_stockout.value };
  if (item.days_to_expiry !== null && item.days_to_expiry <= 7) return { priority: 'high', score: 80 - item.days_to_expiry };
  if (item.current_stock <= item.reorder_level && item.daily_demand > 0) return { priority: 'high', score: 70 - item.days_to_stockout.value || 0 };
  if (item.current_stock <= item.reorder_level) return { priority: 'low', score: 30 };
  return { priority: 'low', score: 10 };
}

function actionFor(item) {
  if (item.current_stock <= 0) return `Urgently replenish ${item.name}; it is out of stock${item.daily_demand > 0 ? ` with demand of ${round(item.daily_demand)} units/day` : ''}.`;
  if (item.days_to_stockout.value !== null && item.days_to_stockout.value <= 7) return `Prioritize replenishment; projected stockout in ${item.days_to_stockout.value} days.`;
  if (item.days_to_expiry !== null && item.days_to_expiry <= 7) return `Review expiry disposition immediately and rotate or transfer this batch.`;
  if (item.current_stock <= item.reorder_level) return item.daily_demand > 0 ? 'Schedule replenishment and monitor weekly demand.' : 'Monitor before ordering because recent demand is low.';
  return 'Continue normal monitoring.';
}

async function querySnapshot() {
  const [medicineRows] = await pool.query(`
    SELECT m.id, m.name, COALESCE(m.category, 'Uncategorized') AS category, m.reorder_level,
           COALESCE(SUM(CASE WHEN b.status = 'active' THEN b.quantity_remaining ELSE 0 END), 0) AS current_stock,
           MIN(CASE WHEN b.status = 'active' THEN DATEDIFF(b.expiry_date, CURDATE()) END) AS days_to_expiry
    FROM medicines m
    LEFT JOIN batches b ON b.medicine_id = m.id
    GROUP BY m.id, m.name, m.category, m.reorder_level
    ORDER BY m.name
  `);

  const [salesRows] = await pool.query(`
    SELECT b.medicine_id, SUM(CASE WHEN st.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN -st.quantity ELSE 0 END) AS recent_units,
           SUM(CASE WHEN st.created_at >= DATE_SUB(CURDATE(), INTERVAL 60 DAY)
                     AND st.created_at < DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN -st.quantity ELSE 0 END) AS previous_units,
           COUNT(CASE WHEN st.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) AND st.transaction_type = 'sale' THEN 1 END) AS recent_sale_count,
           COUNT(CASE WHEN st.created_at >= DATE_SUB(CURDATE(), INTERVAL 60 DAY)
                       AND st.created_at < DATE_SUB(CURDATE(), INTERVAL 30 DAY)
                       AND st.transaction_type = 'sale' THEN 1 END) AS previous_sale_count
    FROM batches b
    LEFT JOIN stock_transactions st ON st.batch_id = b.id AND st.transaction_type = 'sale'
    GROUP BY b.medicine_id
  `);

  const salesByMedicine = new Map(salesRows.map(row => [Number(row.medicine_id), row]));
  return medicineRows.map(row => {
    const sales = salesByMedicine.get(Number(row.id)) || {};
    const recentUnits = Math.max(0, Number(sales.recent_units) || 0);
    const previousUnits = Math.max(0, Number(sales.previous_units) || 0);
    const currentStock = Number(row.current_stock) || 0;
    const dailyDemand = recentUnits / REPORT_WINDOWS.recent;
    const stockout = daysToStockout(currentStock, dailyDemand);
    const item = {
      medicine_id: Number(row.id), name: row.name, category: row.category,
      current_stock: currentStock, reorder_level: Number(row.reorder_level) || 0,
      daily_demand: dailyDemand, recent_units: recentUnits, previous_units: previousUnits,
      recent_sale_count: Number(sales.recent_sale_count) || 0,
      previous_sale_count: Number(sales.previous_sale_count) || 0,
      demand_change_pct: percentageChange(recentUnits, previousUnits),
      days_to_stockout: stockout, days_to_expiry: row.days_to_expiry === null ? null : Number(row.days_to_expiry),
    };
    const priority = priorityFor(item);
    return { ...item, ...priority, action: actionFor(item), reorder_quantity: Math.max(0, Math.ceil(dailyDemand * 30 - currentStock)) };
  });
}

function buildCategoryAnalysis(items) {
  const groups = new Map();
  for (const item of items) {
    const group = groups.get(item.category) || { category: item.category, current_stock: 0, recent_units: 0, previous_units: 0, medicines: 0 };
    group.current_stock += item.current_stock;
    group.recent_units += item.recent_units;
    group.previous_units += item.previous_units;
    group.medicines += 1;
    groups.set(item.category, group);
  }
  return [...groups.values()].map(group => ({
    ...group,
    daily_demand: round(group.recent_units / REPORT_WINDOWS.recent, 2),
    depletion_change_pct: percentageChange(group.recent_units, group.previous_units),
    stockout_days: daysToStockout(group.current_stock, group.recent_units / REPORT_WINDOWS.recent),
  })).sort((a, b) => b.recent_units - a.recent_units);
}

function buildExecutiveSummary(report) {
  const critical = report.priority_actions.filter(item => item.priority === 'critical').length;
  const expiring = report.sections.expiring_soon.length;
  const lowStock = report.sections.low_stock_monitor.length;
  const fastest = report.category_analysis[0];
  const trend = fastest?.depletion_change_pct === null || fastest?.depletion_change_pct === 0
    ? 'Demand trends are stable where sufficient history exists.'
    : `${fastest.category} has the highest recent movement${fastest.depletion_change_pct > 0 ? `, up ${fastest.depletion_change_pct}% versus the previous period` : `, down ${Math.abs(fastest.depletion_change_pct)}% versus the previous period`}.`;
  return `${critical} item${critical === 1 ? '' : 's'} need immediate action, including ${report.summary.out_of_stock} currently out of stock. ${lowStock} medicine${lowStock === 1 ? '' : 's'} are at or below reorder level and ${expiring} batch${expiring === 1 ? '' : 'es'} expire within ${REPORT_WINDOWS.expiry} days. ${trend}`;
}

async function buildSmartReport({ title = 'Pharmacy Health Report' } = {}) {
  const items = await querySnapshot();
  const categoryAnalysis = buildCategoryAnalysis(items);
  const priorityActions = items.filter(item => item.priority !== 'low' || item.current_stock <= item.reorder_level)
    .sort((a, b) => b.score - a.score || a.current_stock - b.current_stock)
    .map((item, index) => ({ rank: index + 1, ...item }));
  const sections = {
    critical: priorityActions.filter(item => item.priority === 'critical'),
    expiring_soon: items.filter(item => item.days_to_expiry !== null && item.days_to_expiry <= REPORT_WINDOWS.expiry).sort((a, b) => a.days_to_expiry - b.days_to_expiry),
    low_stock_monitor: items.filter(item => item.current_stock > 0 && item.current_stock <= item.reorder_level).sort((a, b) => b.score - a.score),
    healthy_stock: items.filter(item => item.current_stock > item.reorder_level && (item.days_to_expiry === null || item.days_to_expiry > REPORT_WINDOWS.expiry)),
  };
  const summary = {
    total_medicines: items.length,
    total_stock: items.reduce((sum, item) => sum + item.current_stock, 0),
    out_of_stock: items.filter(item => item.current_stock <= 0).length,
    low_stock: items.filter(item => item.current_stock <= item.reorder_level).length,
    expiring_within_30_days: sections.expiring_soon.length,
    critical_actions: sections.critical.length,
  };
  const report = {
    title, generated_at: new Date().toISOString(),
    summary, comparisons: { recent_days: 30, previous_days: 30, note: 'Demand comparisons use the preceding 30-day period.' },
    category_analysis: categoryAnalysis,
    priority_actions: priorityActions,
    sections,
    charts: {
      category_stock: categoryAnalysis.map(item => ({ label: item.category, value: item.current_stock })),
      category_demand: categoryAnalysis.map(item => ({ label: item.category, value: item.recent_units })),
      top_items: [...items].sort((a, b) => b.recent_units - a.recent_units).slice(0, 8).map(item => ({ label: item.name, recent: item.recent_units, previous: item.previous_units })),
    },
    data_quality: items.length ? [] : ['No medicine records were available for this report.'],
  };
  report.executive_summary = buildExecutiveSummary(report);
  report.recommendations = priorityActions.slice(0, 8).map(item => item.action);
  report.key_insights = categoryAnalysis.slice(0, 3).map(item => `${item.category}: ${item.current_stock} units in stock and ${round(item.daily_demand)} units/day recent demand.`);
  return report;
}

module.exports = { buildSmartReport, daysToStockout, percentageChange, buildCategoryAnalysis };

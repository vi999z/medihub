const tf = require('@tensorflow/tfjs');
const { pool } = require('../config/db');

async function getDailySales(medicineId, lookbackDays = 90) {
  const [rows] = await pool.query(
    `SELECT DATE(st.created_at) AS day, SUM(-st.quantity) AS units_sold
     FROM stock_transactions st
     JOIN batches b ON st.batch_id = b.id
     WHERE b.medicine_id = ? AND st.transaction_type = 'sale'
       AND st.created_at >= (CURDATE() - INTERVAL ? DAY)
     GROUP BY DATE(st.created_at)
     ORDER BY day ASC`,
    [medicineId, lookbackDays]
  );

  // Fill gaps with 0 so the series has no missing days
  const series = [];
  const start = new Date();
  start.setDate(start.getDate() - lookbackDays);
  const salesByDay = Object.fromEntries(rows.map((r) => [r.day.toISOString().slice(0, 10), Number(r.units_sold)]));

  for (let i = 0; i < lookbackDays; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    series.push(salesByDay[key] || 0);
  }
  return series;
}

function movingAverage(series, window = 7) {
  const result = [];
  for (let i = 0; i < series.length; i++) {
    const slice = series.slice(Math.max(0, i - window + 1), i + 1);
    result.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  return result;
}

function describeTrend(trend, daysOfStockLeft, averageDemand) {
  if (daysOfStockLeft <= 7) {
    return {
      label: 'Reorder now',
      severity: 'critical',
      message: `This item is projected to run out in ${daysOfStockLeft.toFixed(1)} days at the current pace of ${averageDemand.toFixed(2)} units/day.`,
      action: 'Place an order immediately and review supplier lead time.'
    };
  }
  if (daysOfStockLeft <= 14) {
    return {
      label: 'Reorder soon',
      severity: 'warning',
      message: `This medicine is approaching a stockout window and should be replenished soon.`,
      action: 'Schedule a reorder this week to avoid a service interruption.'
    };
  }
  return {
    label: 'Healthy buffer',
    severity: 'safe',
    message: `Current stock still provides a reasonable buffer against demand.`,
    action: 'Keep monitoring and reorder only if the trend starts rising.'
  };
}

// Simple linear-trend projection using tf for the regression fit —
// enough for genuinely small pharmacy SKU-level series, where a heavier model would just overfit noise.
async function forecastDemand(medicineId, horizonDays = 14) {
  const series = await getDailySales(medicineId, 90);
  const smoothed = movingAverage(series, 7);

  const xs = tf.tensor1d(smoothed.map((_, i) => i));
  const ys = tf.tensor1d(smoothed);

  const xMean = xs.mean();
  const yMean = ys.mean();
  const xDev = xs.sub(xMean);
  const yDev = ys.sub(yMean);
  const slope = xDev.mul(yDev).sum().div(xDev.square().sum());
  const intercept = yMean.sub(slope.mul(xMean));

  const slopeVal = (await slope.data())[0];
  const interceptVal = (await intercept.data())[0];

  xs.dispose(); ys.dispose(); xMean.dispose(); yMean.dispose(); xDev.dispose(); yDev.dispose(); slope.dispose(); intercept.dispose();

  const lastIndex = smoothed.length - 1;
  const forecast = [];
  for (let i = 1; i <= horizonDays; i++) {
    const predicted = Math.max(0, slopeVal * (lastIndex + i) + interceptVal);
    forecast.push(Number(predicted.toFixed(2)));
  }

  const avgDailyDemand = forecast.reduce((a, b) => a + b, 0) / forecast.length;
  const trend = slopeVal > 0.02 ? 'rising' : slopeVal < -0.02 ? 'falling' : 'stable';

  return { forecast, avg_daily_demand: Number(avgDailyDemand.toFixed(2)), trend };
}

async function getReorderSuggestions() {
  const [medicines] = await pool.query(
    `SELECT m.id, m.name, m.reorder_level,
            COALESCE(SUM(b.quantity_remaining), 0) AS current_stock
     FROM medicines m
     LEFT JOIN batches b ON b.medicine_id = m.id AND b.status = 'active'
     GROUP BY m.id, m.name, m.reorder_level`
  );

  const suggestions = [];
  for (const med of medicines) {
    const { avg_daily_demand, trend } = await forecastDemand(med.id);
    if (avg_daily_demand <= 0) continue;

    const daysOfStockLeft = med.current_stock / avg_daily_demand;
    const suggestedReorderQty = Math.ceil(avg_daily_demand * 30); // 30-day buffer

    const insight = describeTrend(trend, daysOfStockLeft, avg_daily_demand);

    suggestions.push({
      medicine_id: med.id,
      medicine_name: med.name,
      current_stock: med.current_stock,
      avg_daily_demand,
      days_of_stock_left: Number(daysOfStockLeft.toFixed(1)),
      trend,
      suggested_reorder_qty: suggestedReorderQty,
      insight_label: insight.label,
      insight_severity: insight.severity,
      insight_message: insight.message,
      action: insight.action,
    });
  }

  return suggestions.sort((a, b) => a.days_of_stock_left - b.days_of_stock_left);
}

module.exports = { forecastDemand, getReorderSuggestions };
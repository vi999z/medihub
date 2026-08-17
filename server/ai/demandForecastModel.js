const tf = require('@tensorflow/tfjs');
const { pool } = require('../config/db');

async function getDailySales(medicineId, lookbackDays = 90) {
  try {
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
  } catch (err) {
    console.error(`Error fetching daily sales for medicine ${medicineId}:`, err.message);
    throw err;
  }
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
  try {
    const series = await getDailySales(medicineId, 90);
    const smoothed = movingAverage(series, 7);

    // ─── Edge case: no sales data at all — can't forecast ───
    const totalSales = smoothed.reduce((a, b) => a + b, 0);
    if (totalSales === 0) {
      return { forecast: Array(horizonDays).fill(0), avg_daily_demand: 0, trend: 'stable', error: null };
    }

    const xs = tf.tensor1d(smoothed.map((_, i) => i));
    const ys = tf.tensor1d(smoothed);

    let slopeVal, interceptVal;
    const intermediateTensors = [];
    try {
      const xMean = xs.mean();
      const yMean = ys.mean();
      const xDev = xs.sub(xMean);
      const yDev = ys.sub(yMean);
      const slope = xDev.mul(yDev).sum().div(xDev.square().sum());
      const intercept = yMean.sub(slope.mul(xMean));
      intermediateTensors.push(xMean, yMean, xDev, yDev, slope, intercept);

      slopeVal = (await slope.data())[0];
      interceptVal = (await intercept.data())[0];
    } finally {
      // Always dispose all tensors — input and intermediate
      intermediateTensors.forEach((t) => t.dispose());
      xs.dispose();
      ys.dispose();
    }

    const lastIndex = smoothed.length - 1;
    const forecast = [];
    for (let i = 1; i <= horizonDays; i++) {
      const predicted = Math.max(0, slopeVal * (lastIndex + i) + interceptVal);
      // Ensure bounded non-negative output
      forecast.push(Number(Math.max(0, predicted).toFixed(2)));
    }

    const avgDailyDemand = forecast.reduce((a, b) => a + b, 0) / forecast.length;
    const trend = slopeVal > 0.02 ? 'rising' : slopeVal < -0.02 ? 'falling' : 'stable';

    return { forecast, avg_daily_demand: Number(Math.max(0, avgDailyDemand).toFixed(2)), trend, error: null };
  } catch (err) {
    console.error(`Error forecasting demand for medicine ${medicineId}:`, err.message);
    return { 
      forecast: Array(horizonDays).fill(0), 
      avg_daily_demand: 0, 
      trend: 'stable', 
      error: err.message 
    };
  }
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
  const skippedMedicines = [];
  
  for (const med of medicines) {
    try {
      const { avg_daily_demand, trend, error } = await forecastDemand(med.id);
      if (error) {
        console.warn(`Skipping medicine ${med.id} due to forecast error:`, error);
        skippedMedicines.push({ id: med.id, name: med.name, error });
        continue;
      }
      if (avg_daily_demand <= 0) continue;

      const daysOfStockLeft = avg_daily_demand > 0 ? med.current_stock / avg_daily_demand : Infinity;
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
    } catch (err) {
      console.error(`Error processing medicine ${med.id} for reorder suggestions:`, err.message);
      skippedMedicines.push({ id: med.id, name: med.name, error: err.message });
    }
  }

  return { 
    suggestions: suggestions.sort((a, b) => a.days_of_stock_left - b.days_of_stock_left),
    skipped_medicines: skippedMedicines
  };
}

// ─── Get forecasting diagnostics ───
async function getForecastingDiagnostics(medicineId) {
  try {
    const series = await getDailySales(medicineId, 90);
    const smoothed = movingAverage(series, 7);
    const totalSales = smoothed.reduce((a, b) => a + b, 0);
    const avgDailySales = totalSales / smoothed.length;
    
    return {
      medicine_id: medicineId,
      has_data: totalSales > 0,
      total_sales_90_days: totalSales,
      avg_daily_sales: Number(avgDailySales.toFixed(2)),
      data_points: series.length,
      can_forecast: totalSales > 0
    };
  } catch (err) {
    console.error(`Error getting forecasting diagnostics for medicine ${medicineId}:`, err.message);
    return {
      medicine_id: medicineId,
      has_data: false,
      error: err.message
    };
  }
}

module.exports = { forecastDemand, getReorderSuggestions, getForecastingDiagnostics };
const { pool } = require('../config/db');

const Z_SCORE_THRESHOLD = 2.5;

async function detectAnomalies(lookbackDays = 30) {
  try {
    const [transactions] = await pool.query(
      `SELECT st.id, st.batch_id, st.transaction_type, st.quantity, st.created_at, st.reason,
              m.id AS medicine_id, m.name AS medicine_name, b.batch_number, u.full_name AS user_name
       FROM stock_transactions st
       JOIN batches b ON st.batch_id = b.id
       JOIN medicines m ON b.medicine_id = m.id
       JOIN users u ON st.user_id = u.id
       WHERE st.created_at >= (CURDATE() - INTERVAL ? DAY)
       ORDER BY m.id, st.created_at`,
      [lookbackDays]
    );

    const byMedicine = {};
    for (const t of transactions) {
      (byMedicine[t.medicine_id] ??= []).push(t);
    }

    const anomalies = [];
    const skippedMedicines = [];

    for (const medicineId in byMedicine) {
      try {
        const txns = byMedicine[medicineId];
        if (txns.length < 5) continue; // not enough history to judge "normal" yet

        const magnitudes = txns.map((t) => Math.abs(t.quantity));
        const mean = magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length;
        const variance = magnitudes.reduce((a, b) => a + (b - mean) ** 2, 0) / magnitudes.length;
        const std = Math.sqrt(variance) || 1;

        for (const t of txns) {
          const z = (Math.abs(t.quantity) - mean) / std;
          // Ensure bounded z-score (can be negative for below-average, but we check absolute)
          const boundedZ = Math.max(0, z);
          if (boundedZ >= Z_SCORE_THRESHOLD) {
            const severity = boundedZ >= 4 ? 'critical' : boundedZ >= 3 ? 'warning' : 'info';
            const label = severity === 'critical' ? 'High-risk anomaly' : severity === 'warning' ? 'Unusual movement' : 'Notable deviation';
            const message = severity === 'critical'
              ? `This ${t.transaction_type} is far outside the normal range for ${t.medicine_name}.` 
              : `This ${t.transaction_type} deviates meaningfully from recent activity for ${t.medicine_name}.`;

            anomalies.push({
              transaction_id: t.id,
              medicine_name: t.medicine_name,
              batch_number: t.batch_number,
              transaction_type: t.transaction_type,
              quantity: t.quantity,
              typical_magnitude: Number(mean.toFixed(1)),
              z_score: Number(boundedZ.toFixed(2)),
              user_name: t.user_name,
              reason: t.reason,
              created_at: t.created_at,
              severity,
              insight_label: label,
              insight_message: message,
              action: severity === 'critical' ? 'Review the transaction immediately and verify the batch or dispensing record.' : 'Confirm the movement with the pharmacist or inventory lead.'
            });
          }
        }
      } catch (err) {
        console.error(`Error detecting anomalies for medicine ${medicineId}:`, err.message);
        skippedMedicines.push({ id: medicineId, error: err.message });
      }
    }

    return { 
      anomalies: anomalies.sort((a, b) => b.z_score - a.z_score),
      skipped_medicines: skippedMedicines
    };
  } catch (err) {
    console.error('Error in detectAnomalies:', err.message);
    return { anomalies: [], skipped_medicines: [], error: err.message };
  }
}

// ─── Get anomaly detection diagnostics ───
async function getAnomalyDiagnostics(medicineId, lookbackDays = 30) {
  try {
    const [transactions] = await pool.query(
      `SELECT st.id, st.quantity, st.transaction_type, st.created_at
       FROM stock_transactions st
       JOIN batches b ON st.batch_id = b.id
       WHERE b.medicine_id = ? AND st.created_at >= (CURDATE() - INTERVAL ? DAY)
       ORDER BY st.created_at`,
      [medicineId, lookbackDays]
    );

    if (transactions.length < 5) {
      return {
        medicine_id: medicineId,
        has_enough_data: false,
        transaction_count: transactions.length,
        message: 'Not enough transaction history for anomaly detection (need at least 5)'
      };
    }

    const magnitudes = transactions.map((t) => Math.abs(t.quantity));
    const mean = magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length;
    const variance = magnitudes.reduce((a, b) => a + (b - mean) ** 2, 0) / magnitudes.length;
    const std = Math.sqrt(variance) || 1;
    const maxMagnitude = Math.max(...magnitudes);
    const minMagnitude = Math.min(...magnitudes);

    return {
      medicine_id: medicineId,
      has_enough_data: true,
      transaction_count: transactions.length,
      lookback_days: lookbackDays,
      typical_magnitude: Number(mean.toFixed(2)),
      std_deviation: Number(std.toFixed(2)),
      min_magnitude: minMagnitude,
      max_magnitude: maxMagnitude,
      z_score_threshold: Z_SCORE_THRESHOLD
    };
  } catch (err) {
    console.error(`Error getting anomaly diagnostics for medicine ${medicineId}:`, err.message);
    return {
      medicine_id: medicineId,
      has_enough_data: false,
      error: err.message
    };
  }
}

module.exports = { detectAnomalies, getAnomalyDiagnostics };
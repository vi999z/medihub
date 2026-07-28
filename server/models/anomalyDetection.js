const { pool } = require('../config/db');

const Z_SCORE_THRESHOLD = 2.5;

async function detectAnomalies(lookbackDays = 30) {
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

  for (const medicineId in byMedicine) {
    const txns = byMedicine[medicineId];
    if (txns.length < 5) continue; // not enough history to judge "normal" yet

    const magnitudes = txns.map((t) => Math.abs(t.quantity));
    const mean = magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length;
    const variance = magnitudes.reduce((a, b) => a + (b - mean) ** 2, 0) / magnitudes.length;
    const std = Math.sqrt(variance) || 1;

    for (const t of txns) {
      const z = (Math.abs(t.quantity) - mean) / std;
      if (z >= Z_SCORE_THRESHOLD) {
        anomalies.push({
          transaction_id: t.id,
          medicine_name: t.medicine_name,
          batch_number: t.batch_number,
          transaction_type: t.transaction_type,
          quantity: t.quantity,
          typical_magnitude: Number(mean.toFixed(1)),
          z_score: Number(z.toFixed(2)),
          user_name: t.user_name,
          reason: t.reason,
          created_at: t.created_at,
        });
      }
    }
  }

  return anomalies.sort((a, b) => b.z_score - a.z_score);
}

module.exports = { detectAnomalies };
const tf = require('@tensorflow/tfjs');
const { pool } = require('../config/db');

const FEATURE_KEYS = ['days_until_expiry_at_receipt', 'quantity_received', 'daily_velocity', 'reorder_level'];

async function getVelocity(medicineId, days = 60) {
  const [rows] = await pool.query(
    `SELECT COALESCE(SUM(-st.quantity), 0) AS units_sold
     FROM stock_transactions st
     JOIN batches b ON st.batch_id = b.id
     WHERE b.medicine_id = ? AND st.transaction_type = 'sale'
       AND st.created_at >= (CURDATE() - INTERVAL ? DAY)`,
    [medicineId, days]
  );
  return rows[0].units_sold / days;
}

async function buildFeatureRow(batch) {
  const velocity = await getVelocity(batch.medicine_id);
  const daysUntilExpiryAtReceipt = Math.round(
    (new Date(batch.expiry_date) - new Date(batch.date_received)) / 86400000
  );
  return {
    days_until_expiry_at_receipt: daysUntilExpiryAtReceipt,
    quantity_received: batch.quantity_received,
    daily_velocity: velocity,
    reorder_level: batch.reorder_level ?? 10,
  };
}

function computeStats(rows) {
  const stats = {};
  for (const key of FEATURE_KEYS) {
    const values = rows.map((r) => r[key]);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    stats[key] = { mean, std: Math.sqrt(variance) || 1 };
  }
  return stats;
}

function normalize(rows, stats) {
  return rows.map((row) => FEATURE_KEYS.map((k) => (row[k] - stats[k].mean) / stats[k].std));
}

function buildModel() {
  const model = tf.sequential();
  model.add(tf.layers.dense({ inputShape: [FEATURE_KEYS.length], units: 8, activation: 'relu' }));
  model.add(tf.layers.dense({ units: 4, activation: 'relu' }));
  model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));
  model.compile({ optimizer: tf.train.adam(0.02), loss: 'binaryCrossentropy' });
  return model;
}

async function trainAndPersist() {
  const [resolved] = await pool.query(
    `SELECT b.*, m.reorder_level FROM batches b
     JOIN medicines m ON b.medicine_id = m.id
     WHERE b.status IN ('expired', 'depleted')`
  );

  if (resolved.length < 15) {
    return { trained: false, reason: `Only ${resolved.length} resolved batches so far — need at least 15 to train reliably. Using the heuristic fallback until then.` };
  }

  const featureRows = [];
  const labels = [];
  for (const batch of resolved) {
    featureRows.push(await buildFeatureRow(batch));
    labels.push(batch.status === 'expired' ? 1 : 0);
  }

  const stats = computeStats(featureRows);
  const xs = tf.tensor2d(normalize(featureRows, stats));
  const ys = tf.tensor2d(labels, [labels.length, 1]);

  const model = buildModel();
  await model.fit(xs, ys, { epochs: 60, batchSize: 8, shuffle: true, verbose: 0 });

  const weights = await Promise.all(model.getWeights().map((w) => w.array()));

  await pool.query(
    `INSERT INTO ai_models (model_name, weights_json, feature_stats_json, training_samples)
     VALUES ('expiry_risk', ?, ?, ?)
     ON DUPLICATE KEY UPDATE weights_json = VALUES(weights_json), feature_stats_json = VALUES(feature_stats_json),
       training_samples = VALUES(training_samples), trained_at = CURRENT_TIMESTAMP`,
    [JSON.stringify(weights), JSON.stringify(stats), resolved.length]
  );

  xs.dispose(); ys.dispose();
  return { trained: true, samples: resolved.length };
}

async function loadPersistedModel() {
  const [rows] = await pool.query(`SELECT * FROM ai_models WHERE model_name = 'expiry_risk' ORDER BY trained_at DESC LIMIT 1`);
  if (!rows.length) return null;

  const weightsArrays = JSON.parse(rows[0].weights_json);
  const stats = JSON.parse(rows[0].feature_stats_json);

  const model = buildModel();
  const tensors = model.getWeights().map((w, i) => tf.tensor(weightsArrays[i], w.shape));
  model.setWeights(tensors);

  return { model, stats, samples: rows[0].training_samples };
}

function heuristicRisk({ quantity_remaining, daily_velocity, days_left }) {
  if (daily_velocity <= 0) return quantity_remaining > 0 ? 0.75 : 0;
  const projectedDaysToSellThrough = quantity_remaining / daily_velocity;
  if (projectedDaysToSellThrough <= days_left) return Math.max(0, 0.3 - (days_left - projectedDaysToSellThrough) / 100);
  const overshoot = (projectedDaysToSellThrough - days_left) / days_left;
  return Math.min(1, 0.5 + overshoot);
}

async function scoreActiveBatches() {
  const [batches] = await pool.query(
    `SELECT b.*, m.name AS medicine_name, m.reorder_level
     FROM batches b JOIN medicines m ON b.medicine_id = m.id
     WHERE b.status = 'active' AND b.quantity_remaining > 0`
  );

  const persisted = await loadPersistedModel();
  const results = [];

  for (const batch of batches) {
    const velocity = await getVelocity(batch.medicine_id);
    const daysLeft = Math.ceil((new Date(batch.expiry_date) - new Date()) / 86400000);
    let risk, method;

    if (persisted) {
      const daysUntilExpiryAtReceipt = Math.round((new Date(batch.expiry_date) - new Date(batch.date_received)) / 86400000);
      const featureRow = {
        days_until_expiry_at_receipt: daysUntilExpiryAtReceipt,
        quantity_received: batch.quantity_received,
        daily_velocity: velocity,
        reorder_level: batch.reorder_level ?? 10,
      };
      const input = tf.tensor2d(normalize([featureRow], persisted.stats));
      const prediction = persisted.model.predict(input);
      risk = (await prediction.data())[0];
      input.dispose(); prediction.dispose();
      method = 'model';
    } else {
      risk = heuristicRisk({ quantity_remaining: batch.quantity_remaining, daily_velocity: velocity, days_left: daysLeft });
      method = 'heuristic';
    }

    results.push({
      batch_id: batch.id,
      medicine_name: batch.medicine_name,
      batch_number: batch.batch_number,
      quantity_remaining: batch.quantity_remaining,
      days_left: daysLeft,
      daily_velocity: Number(velocity.toFixed(2)),
      risk_score: Number(risk.toFixed(3)),
      method,
    });
  }

  return results.sort((a, b) => b.risk_score - a.risk_score);
}

module.exports = { trainAndPersist, scoreActiveBatches };
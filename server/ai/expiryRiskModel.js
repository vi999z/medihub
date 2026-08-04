const tf = require('@tensorflow/tfjs');
const { pool } = require('../config/db');
const { calculateExpiryRisk } = require('./expiryRiskUtils');

const FEATURE_KEYS = ['days_until_expiry_at_receipt', 'quantity_received', 'daily_velocity', 'reorder_level'];
const MIN_TRAINING_SAMPLES = 15;
const MODEL_NAME = 'expiry_risk';

// ─── Ensure the ai_models table exists so training never fails on a missing table ───
async function ensureAiModelsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_models (
      id INT AUTO_INCREMENT PRIMARY KEY,
      model_name VARCHAR(50) NOT NULL UNIQUE,
      weights_json LONGTEXT NOT NULL,
      feature_stats_json TEXT NOT NULL,
      training_samples INT DEFAULT 0,
      trained_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
}

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

// ─── Training ───
// Handles: insufficient data, single-class labels, class imbalance, table creation, tensor cleanup
async function trainAndPersist() {
  await ensureAiModelsTable();

  const [resolved] = await pool.query(
    `SELECT b.*, m.reorder_level FROM batches b
     JOIN medicines m ON b.medicine_id = m.id
     WHERE b.status IN ('expired', 'depleted')`
  );

  if (resolved.length < MIN_TRAINING_SAMPLES) {
    return {
      trained: false,
      reason: `Only ${resolved.length} resolved batches so far — need at least ${MIN_TRAINING_SAMPLES} to train reliably. Using the heuristic fallback until then.`,
      samples: resolved.length,
    };
  }

  // Build feature rows
  const featureRows = [];
  const labels = [];
  for (const batch of resolved) {
    featureRows.push(await buildFeatureRow(batch));
    labels.push(batch.status === 'expired' ? 1 : 0);
  }

  // ─── Guard: if all labels are the same class, the model can't learn anything useful ───
  const expiredCount = labels.filter((l) => l === 1).length;
  const depletedCount = labels.length - expiredCount;
  if (expiredCount === 0 || depletedCount === 0) {
    return {
      trained: false,
      reason: `All resolved batches have the same outcome (${expiredCount ? 'all expired' : 'all depleted'}). Need a mix of both outcomes to train. Using the heuristic fallback.`,
      samples: resolved.length,
      expired_count: expiredCount,
      depleted_count: depletedCount,
    };
  }

  const stats = computeStats(featureRows);
  const normalized = normalize(featureRows, stats);

  // ─── Class weighting: counteract imbalance so the minority class isn't ignored ───
  // Weight = total / (2 * class_count) — standard balanced formula
  const total = labels.length;
  const weightExpired = total / (2 * expiredCount);
  const weightDepleted = total / (2 * depletedCount);
  const sampleWeights = labels.map((l) => (l === 1 ? weightExpired : weightDepleted));

  const xs = tf.tensor2d(normalized);
  const ys = tf.tensor2d(labels, [labels.length, 1]);
  const sw = tf.tensor1d(sampleWeights);

  const model = buildModel();

  try {
    await model.fit(xs, ys, {
      epochs: 60,
      batchSize: Math.min(8, labels.length),
      shuffle: true,
      verbose: 0,
      sampleWeight: sw,
    });

    const weights = await Promise.all(model.getWeights().map((w) => w.array()));

    await pool.query(
      `INSERT INTO ai_models (model_name, weights_json, feature_stats_json, training_samples)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE weights_json = VALUES(weights_json), feature_stats_json = VALUES(feature_stats_json),
         training_samples = VALUES(training_samples), trained_at = CURRENT_TIMESTAMP`,
      [MODEL_NAME, JSON.stringify(weights), JSON.stringify(stats), resolved.length]
    );

    return {
      trained: true,
      samples: resolved.length,
      expired_count: expiredCount,
      depleted_count: depletedCount,
    };
  } finally {
    xs.dispose();
    ys.dispose();
    sw.dispose();
    model.dispose();
  }
}

// ─── Load persisted model with full error handling ───
// Returns null if table missing, no rows, or weights are corrupted — caller falls back to heuristic
async function loadPersistedModel() {
  try {
    await ensureAiModelsTable();

    const [rows] = await pool.query(
      `SELECT * FROM ai_models WHERE model_name = ? ORDER BY trained_at DESC LIMIT 1`,
      [MODEL_NAME]
    );
    if (!rows.length) return null;

    let weightsArrays, stats;
    try {
      weightsArrays = JSON.parse(rows[0].weights_json);
      stats = JSON.parse(rows[0].feature_stats_json);
    } catch {
      console.warn('⚠️  Persisted AI model weights are corrupted — falling back to heuristic.');
      return null;
    }

    if (!Array.isArray(weightsArrays) || weightsArrays.length === 0) return null;

    const model = buildModel();
    try {
      const modelWeights = model.getWeights();
      // Validate that the stored weights match the model's expected shapes
      if (weightsArrays.length !== modelWeights.length) {
        console.warn('⚠️  Persisted AI model weights shape mismatch — falling back to heuristic.');
        model.dispose();
        return null;
      }
      const tensors = modelWeights.map((w, i) => tf.tensor(weightsArrays[i], w.shape));
      model.setWeights(tensors);
      tensors.forEach((t) => t.dispose());
    } catch (err) {
      console.warn('⚠️  Failed to load persisted AI model weights:', err.message);
      model.dispose();
      return null;
    }

    return { model, stats, samples: rows[0].training_samples };
  } catch (err) {
    console.warn('⚠️  Could not load persisted AI model:', err.message);
    return null;
  }
}

function heuristicRisk({ quantity_remaining, daily_velocity, days_left, reorder_level = 10 }) {
  return calculateExpiryRisk({
    quantityRemaining: quantity_remaining,
    dailyVelocity: daily_velocity,
    daysLeft: days_left,
    reorderLevel: reorder_level,
  });
}

function describeRisk(riskScore, daysLeft, dailyVelocity, quantityRemaining) {
  if (riskScore >= 0.78) {
    return {
      label: 'Immediate action needed',
      severity: 'critical',
      message: `This batch is likely to expire before it sells through. The remaining stock of ${quantityRemaining} units may not last the ${daysLeft} days left at the current pace of ${dailyVelocity.toFixed(2)} units/day.`,
      action: 'Prioritize a fast-moving promotion or split the batch across branches before expiry.'
    };
  }
  if (riskScore >= 0.45) {
    return {
      label: 'Monitor closely',
      severity: 'warning',
      message: `This batch is trending toward expiry sooner than normal. Current demand is reducing the available shelf life window.`,
      action: 'Review pricing, placement, or stock rotation this week.'
    };
  }
  return {
    label: 'Stable',
    severity: 'safe',
    message: `This batch is still within a manageable window and should be monitored normally.`,
    action: 'Keep the batch visible and review again in a few days if demand changes.'
  };
}

// ─── Score all active batches ───
// Falls back to heuristic per-batch if the model can't be loaded or crashes on a specific batch
async function scoreActiveBatches() {
  const [batches] = await pool.query(
    `SELECT b.*, m.name AS medicine_name, m.reorder_level
     FROM batches b JOIN medicines m ON b.medicine_id = m.id
     WHERE b.status = 'active' AND b.quantity_remaining > 0`
  );

  if (!batches.length) return [];

  const persisted = await loadPersistedModel();
  const results = [];

  try {
    for (const batch of batches) {
      const velocity = await getVelocity(batch.medicine_id);
      const daysLeft = Math.ceil((new Date(batch.expiry_date) - new Date()) / 86400000);
      let risk, method;

      if (persisted) {
        try {
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
          input.dispose();
          prediction.dispose();
          method = 'model';
        } catch (err) {
          // If the model fails on a specific batch, fall back to heuristic for this batch
          console.warn(`⚠️  Model prediction failed for batch ${batch.id}, using heuristic:`, err.message);
          risk = heuristicRisk({
            quantity_remaining: batch.quantity_remaining,
            daily_velocity: velocity,
            days_left: daysLeft,
            reorder_level: batch.reorder_level ?? 10,
          });
          method = 'heuristic';
        }
      } else {
        risk = heuristicRisk({
          quantity_remaining: batch.quantity_remaining,
          daily_velocity: velocity,
          days_left: daysLeft,
          reorder_level: batch.reorder_level ?? 10,
        });
        method = 'heuristic';
      }

      const insight = describeRisk(risk, daysLeft, velocity, batch.quantity_remaining);

      results.push({
        batch_id: batch.id,
        medicine_name: batch.medicine_name,
        batch_number: batch.batch_number,
        quantity_remaining: batch.quantity_remaining,
        days_left: daysLeft,
        daily_velocity: Number(velocity.toFixed(2)),
        risk_score: Number(risk.toFixed(3)),
        method,
        insight_label: insight.label,
        insight_severity: insight.severity,
        insight_message: insight.message,
        action: insight.action,
      });
    }
  } finally {
    // Always clean up the loaded model, even if scoring fails mid-loop
    if (persisted) {
      persisted.model.dispose();
    }
  }

  return results.sort((a, b) => b.risk_score - a.risk_score);
}

module.exports = { trainAndPersist, scoreActiveBatches };
const { trainAndPersist, scoreActiveBatches } = require('../ai/expiryRiskModel');
const { pool } = require('../config/db');
const { getReorderSuggestions } = require('../ai/demandForecastModel');
const { detectAnomalies } = require('../ai/anomalyDetection');


async function logAudit(userId, action, details, req) {
  await pool.query(
    'INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)',
    [userId, action, details, req.ip]
  );
}

// GET /api/ai/expiry-risk
async function getExpiryRisk(req, res) {
  try {
    const results = await scoreActiveBatches();
    res.json(results);
  } catch (err) {
    console.error('Expiry risk scoring failed:', err);
    res.status(500).json({
      error: 'Failed to compute expiry risk',
      detail: err.message,
    });
  }
}

// POST /api/ai/train
async function train(req, res) {
  try {
    const result = await trainAndPersist();

    // Log the training attempt regardless of success/failure
    await logAudit(
      req.user.id,
      'trained_ai_model',
      `Expiry risk model training: ${JSON.stringify(result)}`,
      req
    );

    // Return 200 with full result — the frontend shows different messages for trained vs not-trained
    res.json(result);
  } catch (err) {
    console.error('AI training failed:', err);
    res.status(500).json({
      error: 'Training failed',
      detail: err.message,
      trained: false,
    });
  }
}

// GET /api/ai/reorder-suggestions
async function getReorderSuggestionsHandler(req, res) {
  try {
    res.json(await getReorderSuggestions());
  } catch (err) {
    console.error('Reorder suggestions failed:', err);
    res.status(500).json({
      error: 'Failed to compute reorder suggestions',
      detail: err.message,
    });
  }
}

// GET /api/ai/anomalies
async function getAnomalies(req, res) {
  try {
    res.json(await detectAnomalies(req.query.days || 30));
  } catch (err) {
    console.error('Anomaly detection failed:', err);
    res.status(500).json({
      error: 'Failed to detect anomalies',
      detail: err.message,
    });
  }
}

module.exports = { getExpiryRisk, train, getReorderSuggestionsHandler, getAnomalies };
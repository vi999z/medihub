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

async function getExpiryRisk(req, res) {
  try {
    res.json(await scoreActiveBatches());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to compute expiry risk' });
  }
}

async function train(req, res) {
  try {
    const result = await trainAndPersist();
    await logAudit(req.user.id, 'trained_ai_model', `Expiry risk model: ${JSON.stringify(result)}`, req);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Training failed' });
  }
}

async function getReorderSuggestionsHandler(req, res) {
  try {
    res.json(await getReorderSuggestions());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to compute reorder suggestions' });
  }
}

async function getAnomalies(req, res) {
  try {
    res.json(await detectAnomalies(req.query.days || 30));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to detect anomalies' });
  }
}

module.exports = { getExpiryRisk, train, getReorderSuggestionsHandler, getAnomalies };
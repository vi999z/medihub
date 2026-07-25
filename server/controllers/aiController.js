const { trainAndPersist, scoreActiveBatches } = require('../ai/expiryRiskModel');
const { pool } = require('../config/db');

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

module.exports = { getExpiryRisk, train };
const auditModel = require('../models/auditModel');

async function getAll(req, res) {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 2000);
  res.json(await auditModel.getRecent(limit));
}

module.exports = { getAll };
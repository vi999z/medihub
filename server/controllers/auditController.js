const auditModel = require('../models/auditModel');

async function getAll(req, res) {
  res.json(await auditModel.getRecent(req.query.limit || 100));
}

module.exports = { getAll };
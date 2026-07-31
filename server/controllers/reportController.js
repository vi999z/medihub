const reportModel = require('../models/reportModel');

async function summary(req, res) {
  const data = await reportModel.getSummary();
  res.json(data);
}

async function expiringSoon(req, res) {
  const data = await reportModel.getExpiringSoon(req.query.days || 30);
  res.json(data);
}

async function lowStock(req, res) {
  const data = await reportModel.getLowStock();
  res.json(data);
}

async function salesTrend(req, res) {
  const data = await reportModel.getSalesTrend(req.query.days || 30);
  res.json(data);
}

module.exports = { summary, expiringSoon, lowStock, salesTrend };
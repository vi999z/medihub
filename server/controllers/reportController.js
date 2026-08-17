const reportModel = require('../models/reportModel');

async function summary(req, res) {
  try {
    const data = await reportModel.getSummary();
    res.json(data);
  } catch (err) {
    console.error('Error fetching summary report:', err);
    res.status(500).json({ error: 'Failed to fetch summary report' });
  }
}

async function expiringSoon(req, res) {
  try {
    const data = await reportModel.getExpiringSoon(req.query.days || 30);
    res.json(data);
  } catch (err) {
    console.error('Error fetching expiring soon report:', err);
    res.status(500).json({ error: 'Failed to fetch expiring soon report' });
  }
}

async function lowStock(req, res) {
  try {
    const data = await reportModel.getLowStock();
    res.json(data);
  } catch (err) {
    console.error('Error fetching low stock report:', err);
    res.status(500).json({ error: 'Failed to fetch low stock report' });
  }
}

async function salesTrend(req, res) {
  try {
    const data = await reportModel.getSalesTrend(req.query.days || 30);
    res.json(data);
  } catch (err) {
    console.error('Error fetching sales trend report:', err);
    res.status(500).json({ error: 'Failed to fetch sales trend report' });
  }
}

async function byCategory(req, res) {
  try {
    const data = await reportModel.getByCategory();
    res.json(data);
  } catch (err) {
    console.error('Error fetching category report:', err);
    res.status(500).json({ error: 'Failed to fetch category report' });
  }
}

module.exports = { summary, expiringSoon, lowStock, salesTrend, byCategory };
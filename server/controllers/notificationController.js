const notificationModel = require('../models/notificationModel');

async function getAll(req, res) {
  const unreadOnly = req.query.unread === 'true';
  const notifications = await notificationModel.getAll({ unreadOnly, limit: req.query.limit || 100 });
  res.json(notifications);
}

async function markRead(req, res) {
  await notificationModel.markRead(req.params.id);
  res.json({ success: true });
}

async function markAllRead(req, res) {
  await notificationModel.markAllRead();
  res.json({ success: true });
}

module.exports = { getAll, markRead, markAllRead };
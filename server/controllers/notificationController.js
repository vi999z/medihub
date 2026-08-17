const notificationModel = require('../models/notificationModel');

async function getAll(req, res) {
  try {
    const unreadOnly = req.query.unread === 'true';
    const notifications = await notificationModel.getAll({ unreadOnly, limit: req.query.limit || 100 });
    res.json(notifications);
  } catch (err) {
    console.error('Error fetching notifications:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
}

async function markRead(req, res) {
  try {
    await notificationModel.markRead(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Error marking notification as read:', err);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
}

async function markAllRead(req, res) {
  try {
    await notificationModel.markAllRead();
    res.json({ success: true });
  } catch (err) {
    console.error('Error marking all notifications as read:', err);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
}

module.exports = { getAll, markRead, markAllRead };
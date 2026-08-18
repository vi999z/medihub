/**
 * Conversation Controller
 * Persists, loads, and deletes saved AI conversations per user.
 */

const { pool } = require('../config/db');
const { logAudit } = require('../utils/auditLogger');

// Auto-create table if it doesn't exist (runs once on first use)
async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_conversations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      title VARCHAR(255) NOT NULL DEFAULT 'New Conversation',
      messages_json LONGTEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_conv (user_id, updated_at)
    )
  `);
}
ensureTable().catch(err => console.error('[conversations] Table init failed:', err.message));

// ─── List all conversations for the authenticated user ───
async function listConversations(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT id, title, created_at, updated_at,
              JSON_LENGTH(messages_json) AS message_count
       FROM ai_conversations
       WHERE user_id = ?
       ORDER BY updated_at DESC
       LIMIT 50`,
      [req.user.id]
    );
    res.json({ conversations: rows });
  } catch (err) {
    console.error('[conversations] list failed:', err.message);
    res.status(500).json({ error: 'Failed to load conversations' });
  }
}

// ─── Get a single conversation (messages) ───
async function getConversation(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT id, title, messages_json, created_at, updated_at
       FROM ai_conversations
       WHERE id = ? AND user_id = ?`,
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Conversation not found' });

    const conv = rows[0];
    conv.messages = JSON.parse(conv.messages_json || '[]');
    delete conv.messages_json;
    res.json(conv);
  } catch (err) {
    console.error('[conversations] get failed:', err.message);
    res.status(500).json({ error: 'Failed to load conversation' });
  }
}

// ─── Save / upsert a conversation ───
// Body: { id? (existing), title, messages: [{role, content, timestamp}] }
async function saveConversation(req, res) {
  try {
    const { id, title, messages } = req.body;
    if (!Array.isArray(messages)) return res.status(400).json({ error: 'messages must be an array' });

    const safeTitle = (title || 'New Conversation').slice(0, 255);
    // Strip large image data before storing so the DB row stays reasonable
    const storableMessages = messages.map(m => {
      const { image, ...rest } = m;
      return rest;
    });
    const messagesJson = JSON.stringify(storableMessages);

    if (id) {
      // Update existing
      const [check] = await pool.query(
        'SELECT id FROM ai_conversations WHERE id = ? AND user_id = ?',
        [id, req.user.id]
      );
      if (!check.length) return res.status(404).json({ error: 'Conversation not found' });

      await pool.query(
        'UPDATE ai_conversations SET title = ?, messages_json = ? WHERE id = ? AND user_id = ?',
        [safeTitle, messagesJson, id, req.user.id]
      );
      return res.json({ id, title: safeTitle, saved: true });
    } else {
      // Insert new
      const [result] = await pool.query(
        'INSERT INTO ai_conversations (user_id, title, messages_json) VALUES (?, ?, ?)',
        [req.user.id, safeTitle, messagesJson]
      );
      await logAudit(req.user.id, 'ai_conversation_saved', `id=${result.insertId}`, req);
      return res.json({ id: result.insertId, title: safeTitle, saved: true });
    }
  } catch (err) {
    console.error('[conversations] save failed:', err.message);
    res.status(500).json({ error: 'Failed to save conversation' });
  }
}

// ─── Delete a conversation ───
async function deleteConversation(req, res) {
  try {
    const [result] = await pool.query(
      'DELETE FROM ai_conversations WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Conversation not found' });
    await logAudit(req.user.id, 'ai_conversation_deleted', `id=${req.params.id}`, req);
    res.json({ deleted: true });
  } catch (err) {
    console.error('[conversations] delete failed:', err.message);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
}

// ─── Rename a conversation title ───
async function renameConversation(req, res) {
  try {
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });
    const [result] = await pool.query(
      'UPDATE ai_conversations SET title = ? WHERE id = ? AND user_id = ?',
      [title.slice(0, 255), req.params.id, req.user.id]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Conversation not found' });
    res.json({ renamed: true });
  } catch (err) {
    console.error('[conversations] rename failed:', err.message);
    res.status(500).json({ error: 'Failed to rename conversation' });
  }
}

module.exports = { listConversations, getConversation, saveConversation, deleteConversation, renameConversation };

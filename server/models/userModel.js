const { pool } = require('../config/db');

async function findByEmail(email) {
  const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
  return rows[0];
}

async function findById(id) {
  const [rows] = await pool.query(
    'SELECT id, full_name, email, role, is_active, created_at FROM users WHERE id = ?',
    [id]
  );
  return rows[0];
}

async function createUser({ full_name, email, password_hash, role }) {
  const [result] = await pool.query(
    'INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, ?)',
    [full_name, email, password_hash, role]
  );
  return result.insertId;
}

async function getAllUsers() {
  const [rows] = await pool.query(
    'SELECT id, full_name, email, role, is_active, created_at FROM users ORDER BY created_at DESC'
  );
  return rows;
}

module.exports = { findByEmail, findById, createUser, getAllUsers };
const { pool } = require('../config/db');

async function getAll() {
  const [rows] = await pool.query('SELECT * FROM suppliers ORDER BY name ASC');
  return rows;
}

async function getById(id) {
  const [rows] = await pool.query('SELECT * FROM suppliers WHERE id = ?', [id]);
  return rows[0];
}

async function create(data) {
  const { name, contact_person, phone, email, address } = data;
  const [result] = await pool.query(
    'INSERT INTO suppliers (name, contact_person, phone, email, address) VALUES (?, ?, ?, ?, ?)',
    [name, contact_person, phone, email, address]
  );
  return result.insertId;
}

async function update(id, data) {
  const { name, contact_person, phone, email, address } = data;
  await pool.query(
    'UPDATE suppliers SET name=?, contact_person=?, phone=?, email=?, address=? WHERE id=?',
    [name, contact_person, phone, email, address, id]
  );
}

async function remove(id) {
  await pool.query('DELETE FROM suppliers WHERE id = ?', [id]);
}

module.exports = { getAll, getById, create, update, remove };
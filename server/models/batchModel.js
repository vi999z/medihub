const { pool } = require('../config/db');

async function getAll() {
  const [rows] = await pool.query(
    `SELECT b.*, m.name AS medicine_name, s.name AS supplier_name
     FROM batches b
     JOIN medicines m ON b.medicine_id = m.id
     LEFT JOIN suppliers s ON b.supplier_id = s.id
     ORDER BY b.expiry_date ASC`
  );
  return rows;
}

async function getById(id) {
  const [rows] = await pool.query('SELECT * FROM batches WHERE id = ?', [id]);
  return rows[0];
}

async function getByMedicine(medicineId) {
  const [rows] = await pool.query(
    'SELECT * FROM batches WHERE medicine_id = ? AND status = "active" ORDER BY expiry_date ASC',
    [medicineId]
  );
  return rows;
}

async function create(data) {
  const {
    medicine_id, supplier_id, batch_number, quantity_received,
    cost_price, selling_price, manufacture_date, expiry_date
  } = data;

  const [result] = await pool.query(
    `INSERT INTO batches
     (medicine_id, supplier_id, batch_number, quantity_received, quantity_remaining, cost_price, selling_price, manufacture_date, expiry_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [medicine_id, supplier_id, batch_number, quantity_received, quantity_received, cost_price, selling_price, manufacture_date, expiry_date]
  );
  return result.insertId;
}

async function update(id, data) {
  const {
    medicine_id, supplier_id, batch_number, quantity_received,
    quantity_remaining, cost_price, selling_price, manufacture_date, expiry_date, status
  } = data;

  await pool.query(
    `UPDATE batches
     SET medicine_id=?, supplier_id=?, batch_number=?, quantity_received=?, quantity_remaining=?, cost_price=?, selling_price=?, manufacture_date=?, expiry_date=?, status=?
     WHERE id=?`,
    [medicine_id, supplier_id ?? null, batch_number, quantity_received, quantity_remaining, cost_price ?? null, selling_price ?? null, manufacture_date || null, expiry_date, status || 'active', id]
  );
}

async function updateQuantity(id, newQuantity) {
  await pool.query('UPDATE batches SET quantity_remaining = ? WHERE id = ?', [newQuantity, id]);
}

async function updateStatus(id, status) {
  await pool.query('UPDATE batches SET status = ? WHERE id = ?', [status, id]);
}

async function remove(id) {
  await pool.query('DELETE FROM batches WHERE id = ?', [id]);
}

module.exports = { getAll, getById, getByMedicine, create, update, updateQuantity, updateStatus, remove };
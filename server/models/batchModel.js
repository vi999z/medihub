const { pool } = require('../config/db');

// A batch is either linked to a medicine (medicine_id set) or "unlinked":
// received before its medicine exists in the catalog, with what is known
// about that medicine kept in the pending_* columns until it is linked.
// The shared SELECT gives both kinds the same shape.
const BATCH_SELECT = `
  SELECT b.*,
         COALESCE(m.name, b.pending_name) AS medicine_name,
         COALESCE(m.branch, b.pending_branch) AS branch,
         (b.medicine_id IS NOT NULL) AS linked,
         s.name AS supplier_name
  FROM batches b
  LEFT JOIN medicines m ON b.medicine_id = m.id
  LEFT JOIN suppliers s ON b.supplier_id = s.id`;

function shape(row) {
  return row ? { ...row, linked: Boolean(row.linked) } : row;
}

async function getAll() {
  const [rows] = await pool.query(`${BATCH_SELECT} ORDER BY b.expiry_date ASC`);
  return rows.map(shape);
}

async function getById(id) {
  const [rows] = await pool.query(`${BATCH_SELECT} WHERE b.id = ?`, [id]);
  return shape(rows[0]);
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
    cost_price, selling_price, manufacture_date, expiry_date,
    pending_name, pending_strength, pending_dosage_form, pending_barcode, pending_branch,
  } = data;

  const [result] = await pool.query(
    `INSERT INTO batches
     (medicine_id, supplier_id, batch_number, quantity_received, quantity_remaining, cost_price, selling_price, manufacture_date, expiry_date,
      pending_name, pending_strength, pending_dosage_form, pending_barcode, pending_branch)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [medicine_id ?? null, supplier_id, batch_number, quantity_received, quantity_received, cost_price, selling_price, manufacture_date, expiry_date,
      pending_name ?? null, pending_strength ?? null, pending_dosage_form ?? null, pending_barcode ?? null, pending_branch ?? null]
  );
  return result.insertId;
}

async function update(id, data) {
  const {
    medicine_id, supplier_id, batch_number, quantity_received,
    quantity_remaining, cost_price, selling_price, manufacture_date, expiry_date, status,
    pending_name, pending_strength, pending_dosage_form, pending_barcode, pending_branch,
  } = data;

  await pool.query(
    `UPDATE batches
     SET medicine_id=?, supplier_id=?, batch_number=?, quantity_received=?, quantity_remaining=?, cost_price=?, selling_price=?, manufacture_date=?, expiry_date=?, status=?,
         pending_name=?, pending_strength=?, pending_dosage_form=?, pending_barcode=?, pending_branch=?
     WHERE id=?`,
    [medicine_id ?? null, supplier_id ?? null, batch_number, quantity_received, quantity_remaining, cost_price ?? null, selling_price ?? null, manufacture_date || null, expiry_date, status || 'active',
      pending_name ?? null, pending_strength ?? null, pending_dosage_form ?? null, pending_barcode ?? null, pending_branch ?? null, id]
  );
}

// Connects an unlinked batch to a catalog medicine; the pending details are
// no longer needed. Returns false if the batch was already linked.
async function link(id, medicineId) {
  const [result] = await pool.query(
    `UPDATE batches
     SET medicine_id = ?, pending_name = NULL, pending_strength = NULL, pending_dosage_form = NULL,
         pending_barcode = NULL, pending_branch = NULL
     WHERE id = ? AND medicine_id IS NULL`,
    [medicineId, id]
  );
  return result.affectedRows === 1;
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

module.exports = { getAll, getById, getByMedicine, create, update, link, updateQuantity, updateStatus, remove };

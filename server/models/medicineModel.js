const { pool } = require('../config/db');

const CATEGORY_OPTIONS = [
  'Anti-inflammatory',
  'Antibiotic',
  'Antihistamine',
  'Analgesic',
  'Antacid',
  'Antiemetic',
  'Antipyretic',
  'Antifungal',
  'Antiviral',
  'Cardiovascular',
  'Respiratory',
  'Dermatology',
  'Gastrointestinal',
  'Vitamins & Supplements',
  'Hormonal',
  'Diagnostic',
  'Other'
];

function normalizeCategory(value) {
  if (!value) return 'Other';
  const trimmed = value.trim();
  if (!trimmed) return 'Other';
  const match = CATEGORY_OPTIONS.find((option) => option.toLowerCase() === trimmed.toLowerCase());
  if (match) return match;
  return trimmed;
}

async function getAll() {
  const [rows] = await pool.query(
    `SELECT m.*,
            COALESCE(SUM(CASE WHEN b.status = 'active' AND b.expiry_date >= CURDATE() THEN b.quantity_remaining ELSE 0 END), 0) AS total_stock,
            COUNT(CASE WHEN b.status = 'active' AND b.expiry_date >= CURDATE() THEN 1 END) AS active_batches,
            COUNT(CASE WHEN b.status = 'active' AND b.expiry_date >= CURDATE() AND b.expiry_date <= DATE_ADD(CURDATE(), INTERVAL 14 DAY) THEN 1 END) AS expiring_batches,
            MIN(CASE WHEN b.status = 'active' AND b.expiry_date >= CURDATE() THEN b.expiry_date END) AS nearest_expiry,
            COALESCE(SUM(CASE WHEN b.status = 'active' AND b.expiry_date >= CURDATE() THEN b.quantity_remaining * COALESCE(b.cost_price, 0) ELSE 0 END), 0) AS inventory_value,
            COALESCE(SUM(CASE WHEN b.status = 'active' AND b.expiry_date >= CURDATE() THEN b.quantity_remaining * COALESCE(b.selling_price, 0) ELSE 0 END), 0) AS retail_value
     FROM medicines m
     LEFT JOIN batches b ON b.medicine_id = m.id
     GROUP BY m.id
     ORDER BY m.name ASC`
  );
  return rows.map((row) => ({
    ...row,
    total_stock: Number(row.total_stock) || 0,
    active_batches: Number(row.active_batches) || 0,
    expiring_batches: Number(row.expiring_batches) || 0,
    inventory_value: Number(row.inventory_value) || 0,
    retail_value: Number(row.retail_value) || 0
  }));
}

async function getById(id) {
  const [rows] = await pool.query('SELECT * FROM medicines WHERE id = ?', [id]);
  return rows[0];
}

async function create(data) {
  const { name, generic_name, category, dosage_form, strength, unit, reorder_level, requires_prescription, branch, barcode } = data;
  const normalizedCategory = normalizeCategory(category);
  const [result] = await pool.query(
    `INSERT INTO medicines (name, generic_name, category, dosage_form, strength, unit, reorder_level, requires_prescription, branch, barcode)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, generic_name, normalizedCategory, dosage_form, strength, unit, reorder_level ?? 10, !!requires_prescription, branch, barcode || null]
  );
  return result.insertId;
}

async function update(id, data) {
  const { name, generic_name, category, dosage_form, strength, unit, reorder_level, requires_prescription, branch, barcode } = data;
  const normalizedCategory = normalizeCategory(category);
  await pool.query(
    `UPDATE medicines SET name=?, generic_name=?, category=?, dosage_form=?, strength=?, unit=?, reorder_level=?, requires_prescription=?, branch=?, barcode=?
     WHERE id=?`,
    [name, generic_name, normalizedCategory, dosage_form, strength, unit, reorder_level, !!requires_prescription, branch, barcode || null, id]
  );
}

async function remove(id) {
  await pool.query('DELETE FROM medicines WHERE id = ?', [id]);
}

// Resolves a scanned code to a medicine (and batch, when the code names one).
// Order: product barcode, medicine QR (MEDIHUB:M:<id>), batch QR (MEDIHUB:B:<id>),
// a batch number typed into a label, and finally a plain number as a batch id
// (the format QR codes had before medicines got their own).
async function findByCode(rawCode) {
  const code = String(rawCode || '').trim();
  if (!code) return null;

  const [byBarcode] = await pool.query('SELECT id FROM medicines WHERE barcode = ? ORDER BY id LIMIT 1', [code]);
  if (byBarcode[0]) return { kind: 'medicine', medicine_id: byBarcode[0].id };

  const qr = code.match(/^MEDIHUB:([MB]):(\d+)$/i);
  if (qr) {
    const id = Number(qr[2]);
    if (qr[1].toUpperCase() === 'M') {
      const [rows] = await pool.query('SELECT id FROM medicines WHERE id = ?', [id]);
      return rows[0] ? { kind: 'medicine', medicine_id: rows[0].id } : null;
    }
    const [rows] = await pool.query('SELECT id, medicine_id FROM batches WHERE id = ?', [id]);
    return rows[0] ? { kind: 'batch', medicine_id: rows[0].medicine_id, batch_id: rows[0].id } : null;
  }

  const [byNumber] = await pool.query('SELECT id, medicine_id FROM batches WHERE batch_number = ? ORDER BY id DESC LIMIT 1', [code]);
  if (byNumber[0]) return { kind: 'batch', medicine_id: byNumber[0].medicine_id, batch_id: byNumber[0].id };

  if (/^\d{1,9}$/.test(code)) {
    const [legacy] = await pool.query('SELECT id, medicine_id FROM batches WHERE id = ?', [Number(code)]);
    if (legacy[0]) return { kind: 'batch', medicine_id: legacy[0].medicine_id, batch_id: legacy[0].id };
  }
  return null;
}

// Medicine photos live in the database (one row per medicine), so they need
// no outside storage service and are deleted with their medicine.
let imageTableReady = null;
function ensureImageTable() {
  imageTableReady ??= pool.query(
    `CREATE TABLE IF NOT EXISTS medicine_images (
       medicine_id INT PRIMARY KEY,
       mime_type VARCHAR(50) NOT NULL,
       data MEDIUMBLOB NOT NULL,
       updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
       FOREIGN KEY (medicine_id) REFERENCES medicines(id) ON DELETE CASCADE
     )`
  ).catch((err) => { imageTableReady = null; throw err; });
  return imageTableReady;
}

async function saveImage(id, mimeType, data) {
  await ensureImageTable();
  await pool.query(
    `INSERT INTO medicine_images (medicine_id, mime_type, data) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE mime_type = VALUES(mime_type), data = VALUES(data)`,
    [id, mimeType, data]
  );
}

async function getImage(id) {
  await ensureImageTable();
  const [rows] = await pool.query('SELECT mime_type, data FROM medicine_images WHERE medicine_id = ?', [id]);
  return rows[0];
}

async function deleteImage(id) {
  await ensureImageTable();
  await pool.query('DELETE FROM medicine_images WHERE medicine_id = ?', [id]);
}

async function setImage(id, imageUrl) {
  await pool.query('UPDATE medicines SET image_url = ? WHERE id = ?', [imageUrl, id]);
}

module.exports = { getAll, getById, create, update, remove, setImage, saveImage, getImage, deleteImage, findByCode, CATEGORY_OPTIONS, normalizeCategory };
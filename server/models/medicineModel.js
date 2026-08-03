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
  const [rows] = await pool.query('SELECT * FROM medicines ORDER BY name ASC');
  return rows;
}

async function getById(id) {
  const [rows] = await pool.query('SELECT * FROM medicines WHERE id = ?', [id]);
  return rows[0];
}

async function create(data) {
  const { name, generic_name, category, dosage_form, strength, unit, reorder_level, requires_prescription } = data;
  const normalizedCategory = normalizeCategory(category);
  const [result] = await pool.query(
    `INSERT INTO medicines (name, generic_name, category, dosage_form, strength, unit, reorder_level, requires_prescription)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, generic_name, normalizedCategory, dosage_form, strength, unit, reorder_level || 10, !!requires_prescription]
  );
  return result.insertId;
}

async function update(id, data) {
  const { name, generic_name, category, dosage_form, strength, unit, reorder_level, requires_prescription } = data;
  const normalizedCategory = normalizeCategory(category);
  await pool.query(
    `UPDATE medicines SET name=?, generic_name=?, category=?, dosage_form=?, strength=?, unit=?, reorder_level=?, requires_prescription=?
     WHERE id=?`,
    [name, generic_name, normalizedCategory, dosage_form, strength, unit, reorder_level, !!requires_prescription, id]
  );
}

async function remove(id) {
  await pool.query('DELETE FROM medicines WHERE id = ?', [id]);
}

module.exports = { getAll, getById, create, update, remove, CATEGORY_OPTIONS, normalizeCategory };
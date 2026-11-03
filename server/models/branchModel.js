const { pool } = require('../config/db');

async function getAll() {
  const [rows] = await pool.query(
    `SELECT b.*, (SELECT COUNT(*) FROM medicines m WHERE m.branch = b.name) AS medicine_count
     FROM branches b ORDER BY b.name ASC`
  );
  return rows.map((r) => ({ ...r, is_active: Boolean(r.is_active), medicine_count: Number(r.medicine_count) || 0 }));
}

async function getById(id) {
  const [rows] = await pool.query('SELECT * FROM branches WHERE id = ?', [id]);
  return rows[0];
}

async function getByName(name) {
  const [rows] = await pool.query('SELECT * FROM branches WHERE LOWER(name) = LOWER(?) LIMIT 1', [name]);
  return rows[0];
}

// Names of branches that can currently be chosen for new records.
async function activeNames() {
  const [rows] = await pool.query('SELECT name FROM branches WHERE is_active = 1 ORDER BY name ASC');
  return rows.map((r) => r.name);
}

async function create({ name, address }) {
  const [res] = await pool.query('INSERT INTO branches (name, address) VALUES (?, ?)', [name, address]);
  return res.insertId;
}

// Renaming also renames the branch on its medicines, so nothing is orphaned.
async function update(id, { name, address }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[current]] = await conn.query('SELECT name FROM branches WHERE id = ? FOR UPDATE', [id]);
    await conn.query('UPDATE branches SET name = ?, address = ? WHERE id = ?', [name, address, id]);
    if (current && current.name !== name) {
      await conn.query('UPDATE medicines SET branch = ? WHERE branch = ?', [name, current.name]);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function setActive(id, isActive) {
  await pool.query('UPDATE branches SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, id]);
}

module.exports = { getAll, getById, getByName, activeNames, create, update, setActive };

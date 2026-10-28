const supplierModel = require('../models/supplierModel');
const { pool } = require('../config/db');
const { logAudit } = require('../utils/auditLogger');
const { validateSupplier } = require('../utils/validators');

async function getAll(req, res) {
  try {
    res.json(await supplierModel.getAll());
  } catch (err) {
    console.error('Error fetching suppliers:', err);
    res.status(500).json({ error: 'Failed to fetch suppliers' });
  }
}

// Supplier names must be unique (case-insensitive). `excludeId` skips the
// supplier being edited.
async function nameTaken(name, excludeId = 0) {
  const [rows] = await pool.query('SELECT id FROM suppliers WHERE LOWER(name) = LOWER(?) AND id <> ? LIMIT 1', [name, excludeId]);
  return rows.length > 0;
}

async function create(req, res) {
  try {
    const { value, error } = validateSupplier(req.body);
    if (error) return res.status(400).json({ error });
    if (await nameTaken(value.name)) return res.status(409).json({ error: 'A supplier with this name already exists' });

    const id = await supplierModel.create(value);
    await logAudit(req.user.id, 'created_supplier', `Added supplier: ${value.name}`, req);
    res.status(201).json({ id, ...value });
  } catch (err) {
    console.error('Error creating supplier:', err);
    res.status(500).json({ error: 'Failed to create supplier' });
  }
}

async function update(req, res) {
  try {
    const existing = await supplierModel.getById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Supplier not found' });

    const { value, error } = validateSupplier(req.body);
    if (error) return res.status(400).json({ error });
    if (await nameTaken(value.name, existing.id)) return res.status(409).json({ error: 'A supplier with this name already exists' });

    await supplierModel.update(req.params.id, value);
    await logAudit(req.user.id, 'updated_supplier', `Updated supplier: ${value.name}`, req);
    res.json({ id: Number(req.params.id), ...value });
  } catch (err) {
    console.error('Error updating supplier:', err);
    res.status(500).json({ error: 'Failed to update supplier' });
  }
}

async function remove(req, res) {
  try {
    const existing = await supplierModel.getById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Supplier not found' });

    // Batches keep their history; the schema sets their supplier to NULL.
    await supplierModel.remove(req.params.id);
    await logAudit(req.user.id, 'deleted_supplier', `Removed supplier: ${existing.name}`, req);
    res.status(204).send();
  } catch (err) {
    console.error('Error deleting supplier:', err);
    res.status(500).json({ error: 'Failed to delete supplier' });
  }
}

module.exports = { getAll, create, update, remove };

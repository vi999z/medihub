const supplierModel = require('../models/supplierModel');

async function getAll(req, res) {
  try {
    res.json(await supplierModel.getAll());
  } catch (err) {
    console.error('Error fetching suppliers:', err);
    res.status(500).json({ error: 'Failed to fetch suppliers' });
  }
}

async function create(req, res) {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Supplier name is required' });
    const id = await supplierModel.create(req.body);
    res.status(201).json({ id, ...req.body });
  } catch (err) {
    console.error('Error creating supplier:', err);
    res.status(500).json({ error: 'Failed to create supplier' });
  }
}

async function update(req, res) {
  try {
    const existing = await supplierModel.getById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Supplier not found' });

    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Supplier name is required' });

    await supplierModel.update(req.params.id, req.body);
    res.json({ id: req.params.id, ...req.body });
  } catch (err) {
    console.error('Error updating supplier:', err);
    res.status(500).json({ error: 'Failed to update supplier' });
  }
}

async function remove(req, res) {
  try {
    await supplierModel.remove(req.params.id);
    res.status(204).send();
  } catch (err) {
    console.error('Error deleting supplier:', err);
    res.status(500).json({ error: 'Failed to delete supplier' });
  }
}

module.exports = { getAll, create, update, remove };
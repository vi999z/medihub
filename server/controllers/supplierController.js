const supplierModel = require('../models/supplierModel');

async function getAll(req, res) {
  res.json(await supplierModel.getAll());
}

async function create(req, res) {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Supplier name is required' });
  const id = await supplierModel.create(req.body);
  res.status(201).json({ id, ...req.body });
}

async function update(req, res) {
  const existing = await supplierModel.getById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Supplier not found' });

  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Supplier name is required' });

  await supplierModel.update(req.params.id, req.body);
  res.json({ id: req.params.id, ...req.body });
}

async function remove(req, res) {
  await supplierModel.remove(req.params.id);
  res.status(204).send();
}

module.exports = { getAll, create, update, remove };
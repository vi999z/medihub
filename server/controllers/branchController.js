const branchModel = require('../models/branchModel');
const { logAudit } = require('../utils/auditLogger');
const { validateBranch } = require('../utils/validators');

async function getAll(req, res) {
  res.json(await branchModel.getAll());
}

async function create(req, res) {
  const { value, error, field } = validateBranch(req.body);
  if (error) return res.status(400).json({ error, field });
  if (await branchModel.getByName(value.name)) return res.status(409).json({ error: 'A branch with this name already exists', field: 'name' });

  const id = await branchModel.create(value);
  await logAudit(req.user.id, 'created_branch', `Added branch: ${value.name}`, req);
  res.status(201).json({ id, ...value, is_active: true });
}

async function update(req, res) {
  const existing = await branchModel.getById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Branch not found' });

  const { value, error, field } = validateBranch(req.body);
  if (error) return res.status(400).json({ error, field });
  const sameName = await branchModel.getByName(value.name);
  if (sameName && sameName.id !== existing.id) return res.status(409).json({ error: 'A branch with this name already exists', field: 'name' });

  await branchModel.update(existing.id, value);
  await logAudit(req.user.id, 'updated_branch', `Updated branch: ${existing.name}${existing.name !== value.name ? ` → ${value.name}` : ''}`, req);
  res.json({ id: existing.id, ...value, is_active: Boolean(existing.is_active) });
}

async function setStatus(req, res) {
  const existing = await branchModel.getById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Branch not found' });
  if (typeof req.body.is_active !== 'boolean') return res.status(400).json({ error: 'is_active must be true or false' });

  // At least one branch must stay available, or no medicine could be added.
  if (!req.body.is_active) {
    const active = await branchModel.activeNames();
    if (active.length <= 1 && active.includes(existing.name)) {
      return res.status(400).json({ error: 'At least one branch must stay active' });
    }
  }
  await branchModel.setActive(existing.id, req.body.is_active);
  await logAudit(req.user.id, 'changed_branch_status', `${req.body.is_active ? 'Activated' : 'Deactivated'} branch: ${existing.name}`, req);
  res.json({ success: true });
}

module.exports = { getAll, create, update, setStatus };

const { pool } = require('../config/db');
const { importSchemas } = require('../config/importSchemas');
const { analyzeCsv, importCsv, importCombinedCsv } = require('../utils/csvUtils');

async function logAudit(userId, action, details, req) {
  await pool.query(
    'INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)',
    [userId, action, details, req.ip]
  );
}

function getSchema(type) {
  return importSchemas[type];
}

// POST /api/import/analyze
// body: { type, csv }
async function analyze(req, res) {
  const { type, csv } = req.body;
  if (!type || !csv || typeof csv !== 'string') {
    return res.status(400).json({ error: 'type and csv content are required' });
  }

  const schema = getSchema(type);
  if (!schema) {
    return res.status(400).json({ error: `Unknown import type "${type}". Available: ${Object.keys(importSchemas).join(', ')}` });
  }

  if (!schema.roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'You do not have permission to import this data type' });
  }

  try {
    const analysis = await analyzeCsv(csv, schema);
    res.json({ type, label: schema.label, ...analysis });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

// POST /api/import/:type
// body: { csv }
async function importByType(req, res) {
  const { type } = req.params;
  const { csv } = req.body;
  if (!csv || typeof csv !== 'string') {
    return res.status(400).json({ error: 'CSV content is required' });
  }

  const schema = getSchema(type);
  if (!schema) {
    return res.status(400).json({ error: `Unknown import type "${type}". Available: ${Object.keys(importSchemas).join(', ')}` });
  }

  if (!schema.roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'You do not have permission to import this data type' });
  }

  try {
    let results;
    if (type === 'combined') {
      results = await importCombinedCsv(csv, schema, req.user.id, req, { pool });
      await logAudit(
        req.user.id,
        'imported_combined',
        `Combined import: ${results.medicines.imported} medicines, ${results.suppliers.imported} suppliers, ${results.batches.imported} batches, ${results.transactions.imported} transactions (${results.total} rows)`,
        req
      );
    } else {
      results = await importCsv(csv, schema, req.user.id, req);
      await logAudit(req.user.id, `imported_${type}`, `Imported ${results.imported} of ${results.total} ${type} from CSV`, req);
    }
    res.json({ type, label: schema.label, ...results });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

// GET /api/import/schemas
// Returns available import types and their field definitions (for client-side mapping)
async function getSchemas(req, res) {
  const schemas = {};
  for (const [key, schema] of Object.entries(importSchemas)) {
    if (!schema.roles.includes(req.user.role)) continue;
    schemas[key] = {
      label: schema.label,
      description: schema.description,
      required: schema.required,
      uniqueKey: schema.uniqueKey,
      fields: Object.fromEntries(
        Object.entries(schema.fields).map(([fieldKey, fieldDef]) => [
          fieldKey,
          { type: fieldDef.type, label: fieldDef.label, required: fieldDef.required, options: fieldDef.options }
        ])
      ),
      example: schema.example
    };
  }
  res.json(schemas);
}

module.exports = { analyze, importByType, getSchemas };
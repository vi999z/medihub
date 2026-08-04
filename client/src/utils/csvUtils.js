/**
 * Unified CSV utility module — the single source of truth for all CSV operations
 * on the client side.
 *
 * Consolidates: file reading, column mapping, schema definitions,
 * and CSV generation (export/download).
 *
 * The schema definitions here mirror the server-side schemas in
 * server/config/importSchemas.js (minus the database-dependent logic).
 */

// ─── Schema definitions ────────────────────────────────────────────────────

export const IMPORT_SCHEMAS = {
  combined: {
    label: 'Combined Import',
    description: 'Medicines, suppliers, batches, and optional transactions in ONE CSV file — processed in a single go. Transactions are optional: leave transaction_type/transaction_quantity blank to skip them.',
    required: ['name', 'batch_number', 'quantity_received', 'expiry_date'],
    uniqueKey: 'batch_number',
    fields: {
      // ── Medicine columns ──
      name: { type: 'string', required: true, label: 'Medicine Name' },
      generic_name: { type: 'string', label: 'Generic Name' },
      category: { type: 'string', label: 'Category' },
      dosage_form: { type: 'string', label: 'Dosage Form' },
      strength: { type: 'string', label: 'Strength' },
      unit: { type: 'string', label: 'Unit', default: 'box' },
      reorder_level: { type: 'number', label: 'Reorder Level', default: 10 },
      requires_prescription: { type: 'boolean', label: 'Requires Rx' },
      // ── Supplier columns ──
      supplier_name: { type: 'string', label: 'Supplier Name' },
      contact_person: { type: 'string', label: 'Contact Person' },
      phone: { type: 'string', label: 'Phone' },
      email: { type: 'string', label: 'Email' },
      address: { type: 'string', label: 'Address' },
      // ── Batch columns ──
      batch_number: { type: 'string', required: true, label: 'Batch Number' },
      quantity_received: { type: 'number', required: true, label: 'Quantity Received' },
      cost_price: { type: 'number', label: 'Cost Price' },
      selling_price: { type: 'number', label: 'Selling Price' },
      manufacture_date: { type: 'date', label: 'Manufacture Date' },
      expiry_date: { type: 'date', required: true, label: 'Expiry Date' },
      // ── Transaction columns (ALL OPTIONAL) ──
      transaction_type: { type: 'string', label: 'Transaction Type', options: ['sale', 'adjustment', 'disposal', 'return'] },
      transaction_quantity: { type: 'number', label: 'Transaction Quantity' },
      reason: { type: 'string', label: 'Reason' },
      transaction_date: { type: 'date', label: 'Transaction Date' }
    },
    example: 'name,generic_name,category,dosage_form,strength,unit,reorder_level,requires_prescription,supplier_name,contact_person,phone,email,address,batch_number,quantity_received,cost_price,selling_price,manufacture_date,expiry_date,transaction_type,transaction_quantity,reason,transaction_date\nParacetamol,Acetaminophen,Analgesic,Tablet,500mg,box,10,No,MedSupply,John Doe,09171234567,john@medsupply.com,123 Main St,BATCH-001,100,5.00,12.00,2025-01-15,2027-01-15,sale,5,Walk-in customer,2025-06-01\nParacetamol,Acetaminophen,Analgesic,Tablet,500mg,box,10,No,MedSupply,John Doe,09171234567,john@medsupply.com,123 Main St,BATCH-002,200,4.50,11.00,2025-03-01,2027-03-01,,,,\nAmoxicillin,Amoxicillin,Antibiotic,Capsule,250mg,box,20,Yes,MedSupply,John Doe,09171234567,john@medsupply.com,123 Main St,BATCH-003,50,8.00,20.00,2025-02-01,2027-02-01,disposal,2,Expired stock,2025-06-10\nIbuprofen,Ibuprofen,Anti-inflammatory,Tablet,400mg,bottle,15,No,PharmaDirect,Jane Smith,09175551234,jane@pharmadirect.com,456 Business Rd,BATCH-004,80,3.75,9.50,2025-04-10,2026-04-10,return,3,Customer return,2025-06-12\nCetirizine,Cetirizine,Antihistamine,Syrup,5mg/5ml,bottle,10,No,,,,,BATCH-005,60,2.50,7.00,2025-05-01,2026-05-01,,,,\nOmeprazole,Omeprazole,Antacid,Capsule,20mg,box,25,No,PharmaDirect,Jane Smith,09175551234,jane@pharmadirect.com,456 Business Rd,BATCH-006,120,6.25,15.00,2025-04-20,2026-10-20,adjustment,5,Inventory count adjustment,2025-06-15'
  },
  medicines: {
    label: 'Medicines',
    description: 'Bulk-add medicines to the catalog.',
    required: ['name', 'unit'],
    uniqueKey: 'name',
    fields: {
      name: { type: 'string', required: true, label: 'Name' },
      generic_name: { type: 'string', label: 'Generic Name' },
      category: { type: 'string', label: 'Category' },
      dosage_form: { type: 'string', label: 'Dosage Form' },
      strength: { type: 'string', label: 'Strength' },
      unit: { type: 'string', required: true, label: 'Unit' },
      reorder_level: { type: 'number', label: 'Reorder Level', default: 10 },
      requires_prescription: { type: 'boolean', label: 'Requires Rx' }
    },
    example: 'name,generic_name,category,dosage_form,strength,unit,reorder_level,requires_prescription\nParacetamol,Acetaminophen,Analgesic,Tablet,500mg,box,10,No\nAmoxicillin,Amoxicillin,Antibiotic,Capsule,250mg,box,20,Yes'
  },
  suppliers: {
    label: 'Suppliers',
    description: 'Bulk-add suppliers to your network.',
    required: ['name'],
    uniqueKey: 'name',
    fields: {
      name: { type: 'string', required: true, label: 'Name' },
      contact_person: { type: 'string', label: 'Contact Person' },
      phone: { type: 'string', label: 'Phone' },
      email: { type: 'string', label: 'Email' },
      address: { type: 'string', label: 'Address' }
    },
    example: 'name,contact_person,phone,email,address\nMedSupply,John Doe,09171234567,john@medsupply.com,123 Main St'
  },
  batches: {
    label: 'Batches',
    description: 'Bulk-record stock batches. Medicines and suppliers must already exist.',
    required: ['medicine_name', 'batch_number', 'quantity_received', 'expiry_date'],
    uniqueKey: 'batch_number',
    fields: {
      medicine_name: { type: 'string', required: true, label: 'Medicine Name' },
      batch_number: { type: 'string', required: true, label: 'Batch Number' },
      supplier_name: { type: 'string', label: 'Supplier Name' },
      quantity_received: { type: 'number', required: true, label: 'Quantity Received' },
      cost_price: { type: 'number', label: 'Cost Price' },
      selling_price: { type: 'number', label: 'Selling Price' },
      manufacture_date: { type: 'date', label: 'Manufacture Date' },
      expiry_date: { type: 'date', required: true, label: 'Expiry Date' }
    },
    example: 'medicine_name,batch_number,supplier_name,quantity_received,cost_price,selling_price,manufacture_date,expiry_date\nParacetamol,BATCH-001,MedSupply,100,5.00,12.00,2025-01-15,2027-01-15'
  },
  transactions: {
    label: 'Transactions',
    description: 'Bulk-record stock movements (sales, adjustments, disposals, returns). Batches must already exist.',
    required: ['batch_number', 'transaction_type', 'quantity'],
    fields: {
      batch_number: { type: 'string', required: true, label: 'Batch Number' },
      transaction_type: { type: 'string', required: true, label: 'Type', options: ['sale', 'adjustment', 'disposal', 'return'] },
      quantity: { type: 'number', required: true, label: 'Quantity' },
      reason: { type: 'string', label: 'Reason' },
      date: { type: 'date', label: 'Date' }
    },
    example: 'batch_number,transaction_type,quantity,reason,date\nBATCH-001,sale,5,Walk-in customer,2025-06-01\nBATCH-002,disposal,2,Expired stock,2025-06-02'
  }
};

// ─── File reading ──────────────────────────────────────────────────────────

/**
 * Read a File object and return its text content.
 */
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

// ─── Column mapping / fuzzy matching ───────────────────────────────────────

function normalizeHeader(header) {
  return String(header || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

function fuzzyMatch(header, fieldKey) {
  const h = normalizeHeader(header);
  const f = normalizeHeader(fieldKey);
  if (h === f) return true;
  if (h.replace(/_/g, '') === f.replace(/_/g, '')) return true;
  if (f.startsWith(h) && h.length >= 3) return true;
  if (h.endsWith('_name') && f === 'name') return true;
  return false;
}

/**
 * Auto-detect column mapping from CSV headers to schema fields.
 * Returns { fieldKey: csvHeader } for each matched field.
 */
function detectColumnMapping(headers, schema) {
  const mapping = {};
  const usedHeaders = new Set();

  // First pass: exact matches
  for (const [fieldKey, fieldDef] of Object.entries(schema.fields)) {
    const exact = headers.find((h) => normalizeHeader(h) === fieldKey && !usedHeaders.has(h));
    if (exact) {
      mapping[fieldKey] = exact;
      usedHeaders.add(exact);
    }
  }

  // Second pass: fuzzy matches for unmapped fields
  for (const [fieldKey, fieldDef] of Object.entries(schema.fields)) {
    if (mapping[fieldKey]) continue;
    const fuzzy = headers.find((h) => !usedHeaders.has(h) && fuzzyMatch(h, fieldKey));
    if (fuzzy) {
      mapping[fieldKey] = fuzzy;
      usedHeaders.add(fuzzy);
    }
  }

  return mapping;
}

// ─── CSV generation (export) ───────────────────────────────────────────────

function escapeCsvValue(value) {
  if (value === null || value === undefined) return '';
  const stringValue = String(value).replace(/"/g, '""');
  return /[",\n]/.test(stringValue) ? `"${stringValue}"` : stringValue;
}

/**
 * Generate CSV text from an array of row objects.
 * @param {Array<Object>} rows - Data rows
 * @param {string[]} headers - Column headers (keys into each row)
 * @returns {string} CSV-formatted string
 */
function generateCsv(rows, headers) {
  const lines = [headers.join(',')];
  rows.forEach((row) => {
    lines.push(headers.map((header) => escapeCsvValue(row[header])).join(','));
  });
  return lines.join('\n');
}

/**
 * Generate CSV text and trigger a browser download.
 * @param {string} filename - Download filename
 * @param {Array<Object>} rows - Data rows
 * @param {string[]} headers - Column headers
 */
function downloadCsv(filename, rows, headers) {
  const csvContent = generateCsv(rows, headers);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export {
  // File reading
  readFileAsText,
  // Column mapping
  normalizeHeader,
  fuzzyMatch,
  detectColumnMapping,
  // Export
  escapeCsvValue,
  generateCsv,
  downloadCsv,
};
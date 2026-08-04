/**
 * Client-side mirror of server import schemas.
 * Used for column mapping, preview, and template generation.
 */

export const IMPORT_SCHEMAS = {
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

export function normalizeHeader(header) {
  return String(header || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

export function fuzzyMatch(header, fieldKey) {
  const h = normalizeHeader(header);
  const f = normalizeHeader(fieldKey);
  if (h === f) return true;
  if (h.replace(/_/g, '') === f.replace(/_/g, '')) return true;
  if (f.startsWith(h) && h.length >= 3) return true;
  if (h.endsWith('_name') && f === 'name') return true;
  return false;
}

export function detectColumnMapping(headers, schema) {
  const mapping = {};
  const usedHeaders = new Set();

  // First pass: exact matches
  for (const [fieldKey] of Object.entries(schema.fields)) {
    const exact = headers.find((h) => normalizeHeader(h) === fieldKey && !usedHeaders.has(h));
    if (exact) {
      mapping[fieldKey] = exact;
      usedHeaders.add(exact);
    }
  }

  // Second pass: fuzzy matches
  for (const [fieldKey] of Object.entries(schema.fields)) {
    if (mapping[fieldKey]) continue;
    const fuzzy = headers.find((h) => !usedHeaders.has(h) && fuzzyMatch(h, fieldKey));
    if (fuzzy) {
      mapping[fieldKey] = fuzzy;
      usedHeaders.add(fuzzy);
    }
  }

  return mapping;
}
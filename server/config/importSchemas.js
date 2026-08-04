/**
 * Central schema registry for the generic CSV import engine.
 * Each entity type defines its fields, validation rules, lookups, and create logic.
 * Adding a new importable entity = adding one entry here.
 */
const { pool } = require('../config/db');
const medicineModel = require('../models/medicineModel');
const supplierModel = require('../models/supplierModel');
const batchModel = require('../models/batchModel');

// ─── Shared lookup helpers ───
async function loadMedicineMap() {
  const [rows] = await pool.query('SELECT id, name FROM medicines');
  return new Map(rows.map((r) => [r.name.toLowerCase(), r.id]));
}

async function loadSupplierMap() {
  const [rows] = await pool.query('SELECT id, name FROM suppliers');
  return new Map(rows.map((r) => [r.name.toLowerCase(), r.id]));
}

async function loadBatchMap() {
  const [rows] = await pool.query('SELECT id, batch_number FROM batches');
  return new Map(rows.map((r) => [r.batch_number.toLowerCase(), r.id]));
}

// ─── Schema definitions ───
const importSchemas = {
  combined: {
    label: 'Combined Import',
    description: 'Medicines, suppliers, batches, and optional transactions in ONE CSV file — processed in a single go. Transactions are optional: leave transaction_type/transaction_quantity blank to skip them.',
    roles: ['admin', 'pharmacist'],
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
    example: 'name,generic_name,category,dosage_form,strength,unit,reorder_level,requires_prescription,supplier_name,contact_person,phone,email,address,batch_number,quantity_received,cost_price,selling_price,manufacture_date,expiry_date,transaction_type,transaction_quantity,reason,transaction_date\nParacetamol,Acetaminophen,Analgesic,Tablet,500mg,box,10,No,MedSupply,John Doe,09171234567,john@medsupply.com,123 Main St,BATCH-001,100,5.00,12.00,2025-01-15,2027-01-15,sale,5,Walk-in customer,2025-06-01\nParacetamol,Acetaminophen,Analgesic,Tablet,500mg,box,10,No,MedSupply,John Doe,09171234567,john@medsupply.com,123 Main St,BATCH-002,200,4.50,11.00,2025-03-01,2027-03-01,,,,\nAmoxicillin,Amoxicillin,Antibiotic,Capsule,250mg,box,20,Yes,MedSupply,John Doe,09171234567,john@medsupply.com,123 Main St,BATCH-003,50,8.00,20.00,2025-02-01,2027-02-01,disposal,2,Expired stock,2025-06-10\nIbuprofen,Ibuprofen,Anti-inflammatory,Tablet,400mg,bottle,15,No,PharmaDirect,Jane Smith,09175551234,jane@pharmadirect.com,456 Business Rd,BATCH-004,80,3.75,9.50,2025-04-10,2026-04-10,return,3,Customer return,2025-06-12\nCetirizine,Cetirizine,Antihistamine,Syrup,5mg/5ml,bottle,10,No,,,,,BATCH-005,60,2.50,7.00,2025-05-01,2026-05-01,,,,\nOmeprazole,Omeprazole,Antacid,Capsule,20mg,box,25,No,PharmaDirect,Jane Smith,09175551234,jane@pharmadirect.com,456 Business Rd,BATCH-006,120,6.25,15.00,2025-04-20,2026-10-20,adjustment,5,Inventory count adjustment,2025-06-15',
    async validateRow(row) {
      const errors = [];
      if (row.quantity_received !== null && Number(row.quantity_received) <= 0) {
        errors.push('quantity_received must be greater than 0');
      }
      if (row.expiry_date && new Date(row.expiry_date) <= new Date()) {
        errors.push('expiry_date must be in the future');
      }
      const hasTxType = !!row.transaction_type;
      const txQty = row.transaction_quantity;
      if (hasTxType && (txQty === null || txQty === undefined)) {
        errors.push('transaction_quantity is required when transaction_type is set');
      }
      if (!hasTxType && txQty !== null && txQty !== undefined) {
        errors.push('transaction_type is required when transaction_quantity is set');
      }
      if (hasTxType && !['sale', 'adjustment', 'disposal', 'return'].includes(row.transaction_type)) {
        errors.push('transaction_type must be one of: sale, adjustment, disposal, return');
      }
      return errors;
    }
  },

  medicines: {
    label: 'Medicines',
    description: 'Bulk-add medicines to the catalog.',
    roles: ['admin'],
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
    example: 'name,generic_name,category,dosage_form,strength,unit,reorder_level,requires_prescription\nParacetamol,Acetaminophen,Analgesic,Tablet,500mg,box,10,No\nAmoxicillin,Amoxicillin,Antibiotic,Capsule,250mg,box,20,Yes',
    async create(row) {
      return medicineModel.create({
        name: row.name,
        generic_name: row.generic_name || null,
        category: row.category || 'Other',
        dosage_form: row.dosage_form || null,
        strength: row.strength || null,
        unit: row.unit,
        reorder_level: row.reorder_level ?? 10,
        requires_prescription: row.requires_prescription
      });
    }
  },

  suppliers: {
    label: 'Suppliers',
    description: 'Bulk-add suppliers to your network.',
    roles: ['admin'],
    required: ['name'],
    uniqueKey: 'name',
    fields: {
      name: { type: 'string', required: true, label: 'Name' },
      contact_person: { type: 'string', label: 'Contact Person' },
      phone: { type: 'string', label: 'Phone' },
      email: { type: 'string', label: 'Email' },
      address: { type: 'string', label: 'Address' }
    },
    example: 'name,contact_person,phone,email,address\nMedSupply,John Doe,09171234567,john@medsupply.com,123 Main St',
    async create(row) {
      return supplierModel.create({
        name: row.name,
        contact_person: row.contact_person || null,
        phone: row.phone || null,
        email: row.email || null,
        address: row.address || null
      });
    }
  },

  batches: {
    label: 'Batches',
    description: 'Bulk-record stock batches. Medicines and suppliers must already exist.',
    roles: ['admin', 'pharmacist'],
    required: ['medicine_name', 'batch_number', 'quantity_received', 'expiry_date'],
    uniqueKey: 'batch_number',
    fields: {
      medicine_name: { type: 'string', required: true, label: 'Medicine Name', lookup: 'medicine' },
      batch_number: { type: 'string', required: true, label: 'Batch Number' },
      supplier_name: { type: 'string', label: 'Supplier Name', lookup: 'supplier' },
      quantity_received: { type: 'number', required: true, label: 'Quantity Received' },
      cost_price: { type: 'number', label: 'Cost Price' },
      selling_price: { type: 'number', label: 'Selling Price' },
      manufacture_date: { type: 'date', label: 'Manufacture Date' },
      expiry_date: { type: 'date', required: true, label: 'Expiry Date' }
    },
    example: 'medicine_name,batch_number,supplier_name,quantity_received,cost_price,selling_price,manufacture_date,expiry_date\nParacetamol,BATCH-001,MedSupply,100,5.00,12.00,2025-01-15,2027-01-15',
    async loadLookups() {
      return {
        medicine: await loadMedicineMap(),
        supplier: await loadSupplierMap()
      };
    },
    async create(row, lookups) {
      const medicineId = lookups.medicine.get(row.medicine_name.toLowerCase());
      const supplierId = row.supplier_name ? lookups.supplier.get(row.supplier_name.toLowerCase()) : null;
      return batchModel.create({
        medicine_id: medicineId,
        supplier_id: supplierId,
        batch_number: row.batch_number,
        quantity_received: row.quantity_received,
        cost_price: row.cost_price,
        selling_price: row.selling_price,
        manufacture_date: row.manufacture_date,
        expiry_date: row.expiry_date
      });
    },
    async validateRow(row, lookups) {
      const errors = [];
      const medicineId = lookups.medicine.get(row.medicine_name.toLowerCase());
      if (!medicineId) errors.push(`medicine "${row.medicine_name}" not found in catalog`);
      if (row.supplier_name && !lookups.supplier.get(row.supplier_name.toLowerCase())) {
        errors.push(`supplier "${row.supplier_name}" not found`);
      }
      if (row.expiry_date && new Date(row.expiry_date) <= new Date()) {
        errors.push('expiry_date must be in the future');
      }
      return errors;
    }
  },

  transactions: {
    label: 'Transactions',
    description: 'Bulk-record stock movements (sales, adjustments, disposals, returns). Batches must already exist.',
    roles: ['admin', 'pharmacist'],
    required: ['batch_number', 'transaction_type', 'quantity'],
    fields: {
      batch_number: { type: 'string', required: true, label: 'Batch Number', lookup: 'batch' },
      transaction_type: { type: 'string', required: true, label: 'Type', options: ['sale', 'adjustment', 'disposal', 'return'] },
      quantity: { type: 'number', required: true, label: 'Quantity' },
      reason: { type: 'string', label: 'Reason' },
      date: { type: 'date', label: 'Date' }
    },
    example: 'batch_number,transaction_type,quantity,reason,date\nBATCH-001,sale,5,Walk-in customer,2025-06-01\nBATCH-002,disposal,2,Expired stock,2025-06-02',
    async loadLookups() {
      return {
        batch: await loadBatchMap()
      };
    },
    async create(row, lookups, userId) {
      const batchId = lookups.batch.get(row.batch_number.toLowerCase());
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        const [batchRows] = await conn.query('SELECT * FROM batches WHERE id = ? FOR UPDATE', [batchId]);
        const batch = batchRows[0];
        if (!batch) throw new Error('Batch not found');

        const isReduction = ['sale', 'disposal'].includes(row.transaction_type);
        const delta = isReduction ? -Math.abs(row.quantity) : row.quantity;
        const newQuantity = batch.quantity_remaining + delta;

        if (newQuantity < 0) {
          throw new Error(`Insufficient stock. Only ${batch.quantity_remaining} remaining in this batch.`);
        }

        await conn.query('UPDATE batches SET quantity_remaining = ? WHERE id = ?', [newQuantity, batchId]);
        if (newQuantity === 0) {
          await conn.query('UPDATE batches SET status = "depleted" WHERE id = ?', [batchId]);
        }

        const [result] = await conn.query(
          `INSERT INTO stock_transactions (batch_id, user_id, transaction_type, quantity, reason, created_at)
           VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`,
          [batchId, userId, row.transaction_type, delta, row.reason || null, row.date || null]
        );

        await conn.commit();
        return result.insertId;
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    },
    async validateRow(row, lookups) {
      const errors = [];
      const batchId = lookups.batch.get(row.batch_number.toLowerCase());
      if (!batchId) errors.push(`batch "${row.batch_number}" not found`);
      if (row.transaction_type && !['sale', 'adjustment', 'disposal', 'return'].includes(row.transaction_type)) {
        errors.push(`transaction_type must be one of: sale, adjustment, disposal, return`);
      }
      return errors;
    }
  }
};

module.exports = { importSchemas };
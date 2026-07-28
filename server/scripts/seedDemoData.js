require('dotenv').config();
const { pool } = require('../config/db');

const MEDICINES = [
  { name: 'Amoxicillin', generic_name: 'Amoxicillin', category: 'Antibiotic', dosage_form: 'Capsule', strength: '500mg', unit: 'box', reorder_level: 20 },
  { name: 'Cetirizine', generic_name: 'Cetirizine HCl', category: 'Antihistamine', dosage_form: 'Tablet', strength: '10mg', unit: 'box', reorder_level: 15 },
  { name: 'Omeprazole', generic_name: 'Omeprazole', category: 'Antacid', dosage_form: 'Capsule', strength: '20mg', unit: 'box', reorder_level: 15 },
  { name: 'Mefenamic Acid', generic_name: 'Mefenamic Acid', category: 'Analgesic', dosage_form: 'Tablet', strength: '500mg', unit: 'box', reorder_level: 25 },
];

const SUPPLIER = { name: 'PharmaLink Distributors', contact_person: 'Ana Reyes', phone: '09171234567', email: 'orders@pharmalink.ph', address: 'Makati City' };

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d; }
function daysFromNow(n) { const d = new Date(); d.setDate(d.getDate() + n); return d; }
function toSqlDate(d) { return d.toISOString().slice(0, 10); }

async function run() {
  const [[admin]] = await pool.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  if (!admin) throw new Error('No admin user found — seed one first.');
  const userId = admin.id;

  let [[supplierRow]] = await pool.query('SELECT id FROM suppliers WHERE name = ?', [SUPPLIER.name]);
  let supplierId = supplierRow?.id;
  if (!supplierId) {
    const [res] = await pool.query(
      'INSERT INTO suppliers (name, contact_person, phone, email, address) VALUES (?, ?, ?, ?, ?)',
      [SUPPLIER.name, SUPPLIER.contact_person, SUPPLIER.phone, SUPPLIER.email, SUPPLIER.address]
    );
    supplierId = res.insertId;
  }

  for (const med of MEDICINES) {
    let [[existing]] = await pool.query('SELECT id FROM medicines WHERE name = ?', [med.name]);
    let medicineId = existing?.id;
    if (!medicineId) {
      const [res] = await pool.query(
        `INSERT INTO medicines (name, generic_name, category, dosage_form, strength, unit, reorder_level)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [med.name, med.generic_name, med.category, med.dosage_form, med.strength, med.unit, med.reorder_level]
      );
      medicineId = res.insertId;
    }

    // Create a mix of resolved batches (for AI training) + active batches (for live scoring)
    const batchPlan = [
      ...Array.from({ length: 4 }, () => ({ outcome: 'expired' })),
      ...Array.from({ length: 4 }, () => ({ outcome: 'depleted' })),
      ...Array.from({ length: 3 }, () => ({ outcome: 'active' })),
    ];

    for (const plan of batchPlan) {
      const receivedDaysAgo = randInt(30, 150);
      const shelfLifeDays = randInt(60, 240);
      const receivedDate = daysAgo(receivedDaysAgo);
      const expiryDate = new Date(receivedDate);
      expiryDate.setDate(expiryDate.getDate() + shelfLifeDays);

      const qtyReceived = randInt(50, 200);
      const costPrice = (Math.random() * 5 + 2).toFixed(2);
      const sellingPrice = (costPrice * 1.4).toFixed(2);
      const batchNumber = `${med.name.slice(0, 3).toUpperCase()}-${randInt(1000, 9999)}`;

      let finalExpiry = expiryDate;
      let status = 'active';
      let qtyRemaining = qtyReceived;

      if (plan.outcome === 'expired') {
        finalExpiry = daysAgo(randInt(1, 30));
        status = 'expired';
        qtyRemaining = randInt(5, Math.floor(qtyReceived * 0.4));
      } else if (plan.outcome === 'depleted') {
        status = 'depleted';
        qtyRemaining = 0;
      }

      const [batchRes] = await pool.query(
        `INSERT INTO batches (medicine_id, supplier_id, batch_number, quantity_received, quantity_remaining,
           cost_price, selling_price, manufacture_date, expiry_date, date_received, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [medicineId, supplierId, batchNumber, qtyReceived, qtyRemaining, costPrice, sellingPrice,
         toSqlDate(receivedDate), toSqlDate(finalExpiry), toSqlDate(receivedDate), status]
      );
      const batchId = batchRes.insertId;

      // Generate sale transactions spread across the last 90 days for velocity + anomaly data
      const soldTotal = qtyReceived - qtyRemaining;
      let remaining = soldTotal;
      const numTransactions = randInt(5, 12);
      for (let i = 0; i < numTransactions && remaining > 0; i++) {
        const qty = i === numTransactions - 1 ? remaining : randInt(1, Math.max(1, Math.floor(remaining / (numTransactions - i))));
        remaining -= qty;
        const txnDate = daysAgo(randInt(0, Math.min(89, receivedDaysAgo)));
        await pool.query(
          `INSERT INTO stock_transactions (batch_id, user_id, transaction_type, quantity, reason, created_at)
           VALUES (?, ?, 'sale', ?, 'seeded demo sale', ?)`,
          [batchId, userId, -qty, txnDate]
        );
      }

      // Occasionally inject an anomalous oversized sale to demonstrate anomaly detection
      if (Math.random() < 0.15 && status === 'active') {
        await pool.query(
          `INSERT INTO stock_transactions (batch_id, user_id, transaction_type, quantity, reason, created_at)
           VALUES (?, ?, 'sale', ?, 'seeded anomaly', ?)`,
          [batchId, userId, -randInt(30, 60), daysAgo(randInt(0, 10))]
        );
      }
    }
  }

  console.log('✅ Demo data seeded: suppliers, medicines, batches, and 90 days of transaction history.');
  process.exit(0);
}

run().catch((err) => { console.error('❌ Seed failed:', err); process.exit(1); });
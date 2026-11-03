// Schema changes applied at start-up. Every step checks first, so running this
// on every boot (or twice in a row) is safe, and existing data is never lost.
const { pool } = require('./db');

async function columnType(table, column) {
  const [rows] = await pool.query(
    `SELECT DATA_TYPE AS type FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column]
  );
  return rows[0]?.type || null;
}

async function columnNullable(table, column) {
  const [rows] = await pool.query(
    `SELECT IS_NULLABLE AS nullable FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column]
  );
  return rows[0] ? rows[0].nullable === 'YES' : null;
}

async function addColumn(table, column, definition) {
  if (!(await columnType(table, column))) {
    await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  }
}

async function indexExists(table, name) {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1`,
    [table, name]
  );
  return rows.length > 0;
}

async function addIndex(table, name, columns, unique = false) {
  if (await indexExists(table, name)) return;
  await pool.query(`ALTER TABLE \`${table}\` ADD ${unique ? 'UNIQUE ' : ''}INDEX \`${name}\` (${columns})`);
}

async function runMigrations() {
  // 1. Branches — managed by administrators instead of being fixed in code.
  await pool.query(
    `CREATE TABLE IF NOT EXISTS branches (
       id INT AUTO_INCREMENT PRIMARY KEY,
       name VARCHAR(60) NOT NULL UNIQUE,
       address VARCHAR(255),
       is_active BOOLEAN NOT NULL DEFAULT TRUE,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
     )`
  );
  await pool.query(
    `INSERT IGNORE INTO branches (name, address) VALUES
       ('QMC', 'Quezon Avenue 10, Lucena City'),
       ('MT Carmel', 'Allarey Extension, Barangay 1 (Poblacion), Lucena City')`
  );

  // 2. medicines.branch: ENUM -> VARCHAR so new branches can be added.
  if ((await columnType('medicines', 'branch')) === 'enum') {
    await pool.query("ALTER TABLE medicines MODIFY branch VARCHAR(60) NOT NULL DEFAULT 'QMC'");
  }
  // Any branch name already used by a medicine must exist in `branches`.
  await pool.query(
    `INSERT IGNORE INTO branches (name) SELECT DISTINCT branch FROM medicines WHERE branch IS NOT NULL AND branch <> ''`
  );

  // 3. medicines.barcode: lets a scanned product code find its medicine.
  if (!(await columnType('medicines', 'barcode'))) {
    await pool.query('ALTER TABLE medicines ADD COLUMN barcode VARCHAR(64) NULL AFTER branch');
  }
  await addIndex('medicines', 'uq_medicine_branch_barcode', 'branch, barcode', true);

  // 4. Batches may be received before their medicine is in the catalog.
  // medicine_id becomes optional; until a batch is linked, what was scanned or
  // typed about its medicine is kept in the pending_* columns.
  if ((await columnNullable('batches', 'medicine_id')) === false) {
    await pool.query('ALTER TABLE batches MODIFY medicine_id INT NULL');
  }
  await addColumn('batches', 'pending_name', 'VARCHAR(150) NULL');
  await addColumn('batches', 'pending_strength', 'VARCHAR(50) NULL');
  await addColumn('batches', 'pending_dosage_form', 'VARCHAR(50) NULL');
  await addColumn('batches', 'pending_barcode', 'VARCHAR(64) NULL');
  await addColumn('batches', 'pending_branch', 'VARCHAR(60) NULL');

  // 5. Indexes for the queries the dashboard, alerts and history pages run most.
  await addIndex('batches', 'idx_batch_status_expiry', 'status, expiry_date');
  await addIndex('notifications', 'idx_notification_type_ref', 'type, reference_id');
  await addIndex('audit_logs', 'idx_audit_created', 'created_at');
  await addIndex('stock_transactions', 'idx_tx_type_created', 'transaction_type, created_at');
  await addIndex('medicines', 'idx_medicine_branch', 'branch');
}

module.exports = { runMigrations };

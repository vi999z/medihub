const { pool } = require('../config/db');
require('dotenv').config();

async function addMedicineImageColumn() {
  try {
    const [existing] = await pool.query(
      `SELECT COUNT(*) AS count FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'medicines' AND column_name = 'image_url'`
    );
    if (existing[0].count > 0) {
      console.log('✅ medicines.image_url already exists, nothing to do');
      process.exit(0);
    }
    await pool.query('ALTER TABLE medicines ADD COLUMN image_url VARCHAR(255) AFTER requires_prescription');
    console.log('✅ Added medicines.image_url');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error adding medicines.image_url:', err.message);
    process.exit(1);
  }
}

addMedicineImageColumn();

const { pool } = require('../config/db');
const fs = require('fs');
require('dotenv').config();

async function createViews() {
  try {

    const sql = fs.readFileSync('../database/create_ai_views.sql', 'utf8');
    
    // Split by semicolon and execute each statement
    const statements = sql.split(';').filter(s => s.trim());
    
    for (const statement of statements) {
      if (statement.trim()) {
        await pool.query(statement);
        console.log('✅ Executed SQL statement');
      }
    }
    
    console.log('✅ All views created successfully');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error creating views:', err.message);
    process.exit(1);
  }
}

createViews();

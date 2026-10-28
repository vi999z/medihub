const mysql = require('mysql2/promise');
const fs = require('fs');
require('dotenv').config();

// Keep in step with APP_TIMEZONE in utils/dates.js (Asia/Manila = +08:00).
const DB_TIME_ZONE = process.env.DB_TIME_ZONE || '+08:00';

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: {
    ca: fs.readFileSync(process.env.DB_SSL_CA),
    rejectUnauthorized: true
  },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // Run on the pharmacy's clock (Philippines, UTC+8, no DST) so CURDATE(),
  // DATE(created_at) and "today" mean the local calendar day, not UTC's.
  // `timezone` tells the driver the same offset when reading TIMESTAMPs,
  // and DATE columns come back as plain 'YYYY-MM-DD' strings so no
  // timezone shift can move an expiry date by a day.
  timezone: DB_TIME_ZONE,
  dateStrings: ['DATE']
});

pool.on('connection', (connection) => {
  connection.query('SET time_zone = ?', [DB_TIME_ZONE]);
});

async function testConnection() {
  try {
    const conn = await pool.getConnection();
    console.log('✅ Connected to Aiven MySQL');
    conn.release();
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
  }
}

module.exports = { pool, testConnection };
'use strict';
const mysql = require('mysql2/promise');
require('dotenv').config({ path: __dirname + '/.env' });

async function run() {
  const pool = mysql.createPool({
    host: process.env.MAIN_DB_HOST || 'srv1412.hstgr.io',
    port: process.env.MAIN_DB_PORT || 3306,
    user: process.env.MAIN_DB_USER || 'u294320793_adminmain',
    password: process.env.MAIN_DB_PASSWORD || 'Wishnunexa2026!',
    database: process.env.MAIN_DB_NAME || 'u294320793_nexamain',
  });

  try {
    console.log('1. Creating beta_applications table in Main DB...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS beta_applications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        brand_name VARCHAR(100) NOT NULL,
        institution_type VARCHAR(100) NOT NULL,
        institution_address TEXT NOT NULL,
        team_size VARCHAR(50) NOT NULL,
        admin_name VARCHAR(100) NOT NULL,
        admin_email VARCHAR(100) NOT NULL,
        admin_password_hash VARCHAR(255) NOT NULL,
        whatsapp_number VARCHAR(30) NULL,
        status ENUM('PENDING', 'APPROVED', 'WAITLIST', 'REJECTED') NOT NULL DEFAULT 'PENDING',
        notes TEXT NULL,
        approved_tenant_id VARCHAR(50) NULL,
        reviewed_by VARCHAR(100) NULL,
        reviewed_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_status (status),
        INDEX idx_admin_email (admin_email),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='Tabel Antrean Kurasi & Kuesioner Pendaftaran Closed Beta NexaMOS'
    `);
    console.log('   OK: beta_applications table created/verified.');

    console.log('2. Verifying table structure:');
    const [columns] = await pool.query('DESCRIBE beta_applications');
    console.table(columns);

  } catch (err) {
    console.error('ERROR during migration:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();

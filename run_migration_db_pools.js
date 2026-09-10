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
    console.log('1. Creating db_pools table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS db_pools (
        id INT AUTO_INCREMENT PRIMARY KEY,
        db_host VARCHAR(100) NOT NULL DEFAULT 'srv1412.hstgr.io',
        db_port INT NOT NULL DEFAULT 3306,
        db_name VARCHAR(100) NOT NULL UNIQUE,
        db_user VARCHAR(100) NOT NULL,
        db_password VARCHAR(255) NOT NULL,
        status ENUM('AVAILABLE', 'IN_USE', 'MAINTENANCE') NOT NULL DEFAULT 'AVAILABLE',
        assigned_tenant_id VARCHAR(50) NULL,
        assigned_at DATETIME NULL,
        notes VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_status (status),
        INDEX idx_assigned_tenant (assigned_tenant_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
        COMMENT='Pool database kosong Hostinger untuk Instant Onboarding SaaS'
    `);
    console.log('   OK: db_pools table created/verified.');

    console.log('2. Inserting u294320793_tenant_001 into db_pools...');
    const [insertResult] = await pool.query(`
      INSERT INTO db_pools (db_host, db_port, db_name, db_user, db_password, status, notes)
      VALUES ('srv1412.hstgr.io', 3306, 'u294320793_tenant_001', 'u294320793_admin_001', 'Nexa001!', 'AVAILABLE', 'First provisioned pool DB for SaaS onboarding')
      ON DUPLICATE KEY UPDATE
        db_user = VALUES(db_user),
        db_password = VALUES(db_password),
        status = IF(status = 'IN_USE', status, 'AVAILABLE'),
        notes = VALUES(notes)
    `);
    console.log('   OK: Insert/Update affected rows:', insertResult.affectedRows);

    console.log('3. Verifying db_pools contents:');
    const [rows] = await pool.query('SELECT id, db_name, db_user, status, assigned_tenant_id, created_at FROM db_pools');
    console.table(rows);
  } catch (err) {
    console.error('ERROR:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();

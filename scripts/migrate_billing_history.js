'use strict';

const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrateBillingHistory() {
  const connection = await mysql.createConnection({
    host: process.env.MAIN_DB_HOST,
    port: parseInt(process.env.MAIN_DB_PORT || '3306'),
    user: process.env.MAIN_DB_USER,
    password: process.env.MAIN_DB_PASSWORD,
    database: process.env.MAIN_DB_NAME || 'u294320793_nexamain',
  });

  try {
    console.log('[Migration] Checking billing_history columns...');
    const [cols] = await connection.query('DESCRIBE billing_history');
    const existing = cols.map(c => c.Field);

    if (!existing.includes('plan_tier')) {
      console.log('[Migration] Adding column plan_tier...');
      await connection.query("ALTER TABLE billing_history ADD COLUMN plan_tier ENUM('PRO', 'BUSINESS', 'ENTERPRISE') NULL AFTER tenant_id");
    }

    if (!existing.includes('billing_cycle')) {
      console.log('[Migration] Adding column billing_cycle...');
      await connection.query("ALTER TABLE billing_history ADD COLUMN billing_cycle ENUM('MONTHLY', 'YEARLY', 'LIFETIME') NULL AFTER plan_tier");
    }

    if (!existing.includes('snap_token')) {
      console.log('[Migration] Adding column snap_token...');
      await connection.query("ALTER TABLE billing_history ADD COLUMN snap_token VARCHAR(255) NULL AFTER invoice_url");
    }

    if (!existing.includes('payment_type')) {
      console.log('[Migration] Adding column payment_type...');
      await connection.query("ALTER TABLE billing_history ADD COLUMN payment_type VARCHAR(50) NULL AFTER snap_token");
    }

    console.log('[Migration] Done. Columns verified.');
  } catch (err) {
    console.error('[Migration] Error:', err.message);
  } finally {
    await connection.end();
  }
}

migrateBillingHistory();

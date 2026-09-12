'use strict';

require('dotenv').config();
const { mainPool } = require('./src/config/database');

async function migrate() {
  console.log('--- Memulai Migrasi Kolom WhatsApp Registration di nexamain.tenants ---');

  try {
    // 1. Cek kolom yang sudah ada
    const [cols] = await mainPool.query("SHOW COLUMNS FROM tenants");
    const existingCols = cols.map(c => c.Field);

    const columnsToAdd = [
      { name: 'whatsapp_number', ddl: "ADD COLUMN `whatsapp_number` VARCHAR(30) NULL AFTER `whatsapp_phone_id`" },
      { name: 'whatsapp_display_name', ddl: "ADD COLUMN `whatsapp_display_name` VARCHAR(100) NULL AFTER `whatsapp_number`" },
      { name: 'whatsapp_status', ddl: "ADD COLUMN `whatsapp_status` ENUM('NOT_CONFIGURED', 'PENDING_PROVISIONING', 'CONNECTED', 'REJECTED') DEFAULT 'NOT_CONFIGURED' AFTER `whatsapp_display_name`" },
      { name: 'whatsapp_business_category', ddl: "ADD COLUMN `whatsapp_business_category` VARCHAR(50) NULL AFTER `whatsapp_status`" },
      { name: 'whatsapp_requested_at', ddl: "ADD COLUMN `whatsapp_requested_at` DATETIME NULL AFTER `whatsapp_business_category`" },
      { name: 'whatsapp_connected_at', ddl: "ADD COLUMN `whatsapp_connected_at` DATETIME NULL AFTER `whatsapp_requested_at`" },
      { name: 'whatsapp_notes', ddl: "ADD COLUMN `whatsapp_notes` TEXT NULL AFTER `whatsapp_connected_at`" }
    ];

    for (const col of columnsToAdd) {
      if (!existingCols.includes(col.name)) {
        console.log(`Menambahkan kolom ${col.name}...`);
        await mainPool.query(`ALTER TABLE tenants ${col.ddl}`);
      } else {
        console.log(`Kolom ${col.name} sudah ada.`);
      }
    }

    // 2. Set default status untuk tenant yang sudah punya whatsapp_phone_id (contoh: derma-indonesia)
    console.log('Update status awal untuk tenant yang sudah terpasang...');
    await mainPool.query(`
      UPDATE tenants 
      SET whatsapp_status = 'CONNECTED',
          whatsapp_display_name = COALESCE(whatsapp_display_name, brand_name),
          whatsapp_connected_at = COALESCE(whatsapp_connected_at, NOW())
      WHERE whatsapp_phone_id IS NOT NULL AND (whatsapp_status IS NULL OR whatsapp_status = 'NOT_CONFIGURED')
    `);

    console.log('✅ Migrasi skema whatsapp registration sukses!');
  } catch (err) {
    console.error('❌ Error migrasi:', err.message);
  } finally {
    await mainPool.end();
    process.exit(0);
  }
}

migrate();

'use strict';
const mysql = require('mysql2/promise');
require('dotenv').config({ path: __dirname + '/.env' });

async function run() {
  const mainPool = mysql.createPool({
    host:     process.env.MAIN_DB_HOST || process.env.DB_HOST,
    port:     process.env.MAIN_DB_PORT || 3306,
    user:     process.env.MAIN_DB_USER || process.env.DB_USER,
    password: process.env.MAIN_DB_PASSWORD || process.env.DB_PASSWORD,
    database: process.env.MAIN_DB_NAME || 'u294320793_nexamain',
  });

  try {
    const [tenants] = await mainPool.query('SELECT tenant_id, db_host, db_port, db_name, db_user, db_password FROM tenant_databases');
    console.log(`Ditemukan ${tenants.length} tenant untuk dimigrasi:`, tenants.map(t => t.tenant_id));

    for (const t of tenants) {
      console.log(`\n======================================================`);
      console.log(`Migrasi Tenant: ${t.tenant_id} (${t.db_name})`);
      console.log(`======================================================`);
      
      const tPool = mysql.createPool({
        host: t.db_host,
        port: t.db_port || 3306,
        user: t.db_user,
        password: t.db_password,
        database: t.db_name,
      });

      const conn = await tPool.getConnection();
      try {
        console.log('Step 1: CREATE TABLE IF NOT EXISTS registration_tokens...');
        await conn.query(`
          CREATE TABLE IF NOT EXISTS \`registration_tokens\` (
            \`id\` int(11) NOT NULL AUTO_INCREMENT,
            \`token\` varchar(64) NOT NULL,
            \`id_siswa\` varchar(50) NOT NULL,
            \`nama_lengkap\` varchar(200) NOT NULL,
            \`no_wa\` varchar(20) NOT NULL,
            \`status\` enum('pending','paid','expired') DEFAULT 'pending',
            \`expires_at\` timestamp NOT NULL,
            \`created_at\` timestamp NULL DEFAULT current_timestamp(),
            PRIMARY KEY (\`id\`),
            UNIQUE KEY \`token\` (\`token\`),
            KEY \`idx_token\` (\`token\`),
            KEY \`idx_siswa\` (\`id_siswa\`)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        console.log('  OK: Tabel registration_tokens siap.');

        console.log('Step 2: CREATE TABLE IF NOT EXISTS payment_settings...');
        await conn.query(`
          CREATE TABLE IF NOT EXISTS \`payment_settings\` (
            \`id\` int(11) NOT NULL AUTO_INCREMENT,
            \`bank_name\` varchar(50) NOT NULL DEFAULT 'BCA',
            \`bank_account_number\` varchar(50) NOT NULL DEFAULT '',
            \`bank_account_holder\` varchar(100) NOT NULL DEFAULT '',
            \`bank_notes\` text DEFAULT NULL,
            \`registration_fee\` decimal(12,2) NOT NULL DEFAULT 500000.00,
            \`core_deposit_amount\` decimal(12,2) NOT NULL DEFAULT 1500000.00,
            \`total_program_fee\` decimal(12,2) NOT NULL DEFAULT 15000000.00,
            \`discount_amount\` decimal(12,2) NOT NULL DEFAULT 0.00,
            \`discount_label\` varchar(100) DEFAULT NULL,
            \`discount_end_date\` date DEFAULT NULL,
            \`program_names\` text DEFAULT NULL,
            \`qris_image_url\` varchar(255) DEFAULT NULL,
            \`updated_by\` varchar(100) DEFAULT NULL,
            \`created_at\` timestamp NULL DEFAULT current_timestamp(),
            \`updated_at\` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
            PRIMARY KEY (\`id\`)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        const [[psCount]] = await conn.query('SELECT COUNT(*) AS c FROM payment_settings');
        if (psCount.c === 0) {
          await conn.query(`
            INSERT INTO payment_settings (bank_name, bank_account_number, bank_account_holder, bank_notes, registration_fee, core_deposit_amount, total_program_fee, discount_amount, discount_label)
            VALUES ('BCA', '1234567890', 'NexaMOS Demo Account', 'Sertakan nama lengkap saat transfer demo.', 500000, 1500000, 15000000, 0, 'Reguler');
          `);
          console.log('  OK: Default payment_settings inserted.');
        }
        console.log('  OK: Tabel payment_settings siap.');

        console.log('Step 3: CREATE TABLE IF NOT EXISTS pendaftaran_siswa...');
        await conn.query(`
          CREATE TABLE IF NOT EXISTS \`pendaftaran_siswa\` (
            \`id\` int(11) NOT NULL AUTO_INCREMENT,
            \`id_siswa\` varchar(50) NOT NULL,
            \`nik\` varchar(20) DEFAULT NULL,
            \`gender\` enum('Laki-laki','Perempuan') DEFAULT NULL,
            \`tanggal_lahir\` date DEFAULT NULL,
            \`alamat_lengkap\` text DEFAULT NULL,
            \`nama_program\` varchar(150) DEFAULT NULL,
            \`nama_ortu\` varchar(150) DEFAULT NULL,
            \`wa_ortu\` varchar(25) DEFAULT NULL,
            \`tgl_lahir_ortu\` date DEFAULT NULL,
            \`pekerjaan_ortu\` varchar(50) DEFAULT NULL,
            \`created_at\` timestamp NULL DEFAULT current_timestamp(),
            \`updated_at\` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
            PRIMARY KEY (\`id\`),
            UNIQUE KEY \`id_siswa\` (\`id_siswa\`),
            KEY \`idx_siswa\` (\`id_siswa\`)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        console.log('  OK: Tabel pendaftaran_siswa siap.');

      } catch (err) {
        console.error(`  ERROR pada tenant ${t.tenant_id}:`, err.message);
      } finally {
        conn.release();
        await tPool.end();
      }
    }
  } finally {
    await mainPool.end();
  }

  console.log('\n✅ Selesai migrasi registration tables untuk seluruh tenant.');
}

run().catch(console.error);

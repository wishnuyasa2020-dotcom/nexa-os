// migration_broadcast_run.js
// Jalankan: node migration_broadcast_run.js

'use strict';
require('dotenv').config();
const { pool } = require('./src/config/database');

(async () => {
  let conn;
  try {
    conn = await pool.getConnection();
    console.log('✅ DB connected to:', process.env.DB_NAME);

    // 1. Buat tabel broadcast_campaigns
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`broadcast_campaigns\` (
        \`id\`               VARCHAR(60)  NOT NULL,
        \`nama_campaign\`    VARCHAR(150) NOT NULL DEFAULT 'Campaign Broadcast',
        \`created_by\`       VARCHAR(100) NOT NULL,
        \`meta_template_id\` VARCHAR(100) NULL,
        \`crm_template_id\`  VARCHAR(100) NULL,
        \`target_count\`     INT          NOT NULL DEFAULT 0,
        \`sent_count\`       INT          NOT NULL DEFAULT 0,
        \`status\`           ENUM('pending','in_progress','completed','failed') NOT NULL DEFAULT 'pending',
        \`created_at\`       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\`       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        INDEX \`idx_status\` (\`status\`),
        INDEX \`idx_created_by\` (\`created_by\`),
        INDEX \`idx_created_at\` (\`created_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ broadcast_campaigns table: CREATE IF NOT EXISTS — OK');

    // 2. Opsional: tabel broadcast_templates_crm
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`broadcast_templates_crm\` (
        \`id\`           VARCHAR(50)  NOT NULL,
        \`name\`         VARCHAR(100) NOT NULL,
        \`preview_text\` TEXT         NULL,
        \`created_at\`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ broadcast_templates_crm table: CREATE IF NOT EXISTS — OK');

    // 3. Cek keberadaan broadcast_queue (dari GAS)
    const [queueCheck] = await conn.query(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'broadcast_queue'"
    );
    console.log('ℹ️  broadcast_queue table exists:', queueCheck.length > 0 ? 'YES (GAS Worker active)' : 'NO — perlu dibuat manual');

    // 4. Cek wa_templates
    try {
      const [wt] = await conn.query(
        "SELECT COUNT(*) as cnt FROM wa_templates"
      );
      console.log('ℹ️  wa_templates total rows:', wt[0].cnt);
      const [wtApproved] = await conn.query(
        "SELECT COUNT(*) as cnt FROM wa_templates WHERE status_meta = 'APPROVED'"
      );
      console.log('ℹ️  wa_templates APPROVED rows:', wtApproved[0].cnt);
    } catch (e) {
      console.log('⚠️  wa_templates tidak ditemukan:', e.message);
    }

    console.log('\n🎉 Migration selesai!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration error:', err.message);
    process.exit(1);
  } finally {
    if (conn) conn.release();
  }
})();

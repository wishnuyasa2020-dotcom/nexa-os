const mysql = require('mysql2/promise');

(async () => {
  const pool = mysql.createPool({
    host: 'srv1412.hstgr.io',
    port: 3306,
    user: 'u294320793_admin',
    password: '1379502026Ok!',
    database: 'u294320793_crmderma',
    waitForConnections: true,
    connectionLimit: 3,
  });

  try {
    // 1. Standarisasi status_crm: 'Aktif' -> 'ACTIVE', 'inaktif' -> 'INACTIVE'
    const [r1] = await pool.query("UPDATE wa_templates SET status_crm = 'ACTIVE' WHERE status_crm = 'Aktif'");
    console.log(`Converted 'Aktif' -> 'ACTIVE': ${r1.affectedRows} rows`);

    const [r2] = await pool.query("UPDATE wa_templates SET status_crm = 'INACTIVE' WHERE status_crm IN ('inaktif', 'Inaktif', 'inactive')");
    console.log(`Converted 'inaktif' -> 'INACTIVE': ${r2.affectedRows} rows`);

    // 2. Set meta_status = 'APPROVED' untuk semua template ACTIVE (asumsi template Aktif = sudah approved di Meta)
    const [r3] = await pool.query("UPDATE wa_templates SET meta_status = 'APPROVED' WHERE status_crm = 'ACTIVE' AND (meta_status IS NULL OR meta_status = '')");
    console.log(`Set meta_status='APPROVED' for ACTIVE templates: ${r3.affectedRows} rows`);

    // Verify
    const [rows] = await pool.query("SELECT id_template, nama_template, status_crm, meta_status FROM wa_templates ORDER BY status_crm, id_template");
    console.log('\nResult:', rows);

  } catch(e) {
    console.error('Error:', e.message);
  } finally {
    process.exit(0);
  }
})();

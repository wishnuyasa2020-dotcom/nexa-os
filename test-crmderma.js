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
    // Check tables
    const [tables] = await pool.query("SHOW TABLES");
    console.log('Tables in crmderma:', tables.map(r => Object.values(r)[0]));

    // Check wa_templates
    const [waT] = await pool.query("SHOW TABLES LIKE 'wa_templates'");
    if (waT.length > 0) {
      const [rows] = await pool.query("SELECT id_template, nama_template, status_crm, meta_status, template_name_api FROM wa_templates");
      console.log('\nwa_templates:', rows);
    } else {
      console.log('\n[!] Table wa_templates DOES NOT EXIST in crmderma!');
    }
  } catch(e) {
    console.error('Error:', e.message);
  } finally {
    process.exit(0);
  }
})();

const { getDynamicPool, tenantStorage } = require('./src/config/database');

tenantStorage.run('derma-indonesia', async () => {
  try {
    const pool = await getDynamicPool('derma-indonesia');

    // Check if wa_templates table exists
    const [tables] = await pool.query("SHOW TABLES LIKE 'wa_templates'");
    console.log('Table wa_templates exists:', tables.length > 0);

    if (tables.length > 0) {
      const [rows] = await pool.query("SELECT id_template, nama_template, status_crm, meta_status, template_name_api FROM wa_templates LIMIT 10");
      console.log('Templates:', rows);
    } else {
      console.log('Table wa_templates DOES NOT EXIST in Derma DB!');
      const [allTables] = await pool.query("SHOW TABLES");
      console.log('All tables:', allTables.map(r => Object.values(r)[0]));
    }
  } catch(e) {
    console.error('Error:', e.message);
  } finally {
    process.exit(0);
  }
});

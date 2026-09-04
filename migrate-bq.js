const mysql = require('mysql2/promise');
require('dotenv').config({ path: './.env' });

async function run() {
  let mainConn;
  try {
    console.log('Connecting to main DB...');
    mainConn = await mysql.createConnection({
      host: process.env.MAIN_DB_HOST,
      port: process.env.MAIN_DB_PORT,
      user: process.env.MAIN_DB_USER,
      password: process.env.MAIN_DB_PASSWORD,
      database: process.env.MAIN_DB_NAME
    });
    
    const [rows] = await mainConn.query("SELECT tenant_id, db_name, db_host, db_user, db_password FROM tenant_databases");
    console.log(rows.map(r => r.tenant_id + ' -> ' + r.db_name).join('\n'));

    // Check if any has db_name ending in crmderma
    const crmderma = rows.find(r => r.db_name.includes('crmderma'));
    if (crmderma) {
      console.log(`Connecting to tenant DB: ${crmderma.db_name}...`);
      const tenantConn = await mysql.createConnection({
        host: crmderma.db_host,
        user: crmderma.db_user,
        password: crmderma.db_password,
        database: crmderma.db_name
      });
      await tenantConn.query('ALTER TABLE broadcast_queue ADD COLUMN is_sw_open BOOLEAN DEFAULT FALSE, ADD COLUMN body_text TEXT');
      console.log('Success altering ' + crmderma.db_name);
      await tenantConn.end();
    }
  } catch (err) {
    if (err.code === 'ER_DUP_FIELDNAME') {
      console.log('Columns already exist in crmderma.');
    } else {
      console.error(err);
    }
  } finally {
    if (mainConn) await mainConn.end();
    process.exit();
  }
}

run();

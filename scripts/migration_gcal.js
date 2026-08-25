require('dotenv').config();
const mysql = require('mysql2/promise');

async function migrate() {
  let mainPool;
  try {
    mainPool = mysql.createPool({
      host: process.env.MAIN_DB_HOST,
      port: parseInt(process.env.MAIN_DB_PORT || '3306'),
      user: process.env.MAIN_DB_USER,
      password: process.env.MAIN_DB_PASSWORD,
      database: process.env.MAIN_DB_NAME,
      waitForConnections: true,
      connectionLimit: 5,
    });

    console.log('Fetching tenants...');
    const [tenants] = await mainPool.query('SELECT * FROM tenant_databases');
    
    console.log(`Found ${tenants.length} active tenants.`);

    for (const tenant of tenants) {
      console.log(`\nMigrating tenant DB: ${tenant.db_name}...`);
      const tPool = mysql.createPool({
        host: tenant.db_host,
        port: 3306,
        user: tenant.db_user,
        password: tenant.db_password,
        database: tenant.db_name,
        waitForConnections: true,
        connectionLimit: 2,
      });

      try {
        await tPool.query('ALTER TABLE users ADD COLUMN google_refresh_token TEXT DEFAULT NULL');
        console.log(' - Added google_refresh_token');
      } catch (err) {
        if (err.code === 'ER_DUP_FIELDNAME') console.log(' - google_refresh_token already exists');
        else throw err;
      }

      try {
        await tPool.query('ALTER TABLE users ADD COLUMN google_access_token TEXT DEFAULT NULL');
        console.log(' - Added google_access_token');
      } catch (err) {
        if (err.code === 'ER_DUP_FIELDNAME') console.log(' - google_access_token already exists');
        else throw err;
      }

      try {
        await tPool.query('ALTER TABLE users ADD COLUMN google_token_expiry BIGINT DEFAULT NULL');
        console.log(' - Added google_token_expiry');
      } catch (err) {
        if (err.code === 'ER_DUP_FIELDNAME') console.log(' - google_token_expiry already exists');
        else throw err;
      }

      await tPool.end();
      console.log(`Finished migrating ${tenant.db_name}`);
    }
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    if (mainPool) await mainPool.end();
    console.log('\nMigration script completed.');
    process.exit(0);
  }
}

migrate();

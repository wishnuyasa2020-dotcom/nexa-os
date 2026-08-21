const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
  const connection = await mysql.createConnection({
    host: process.env.MAIN_DB_HOST,
    user: process.env.MAIN_DB_USER,
    password: process.env.MAIN_DB_PASSWORD,
    database: process.env.MAIN_DB_NAME || 'u294320793_nexamain'
  });

  try {
    const [rows] = await connection.query(`
      SELECT t.tier, t.max_cro, t.max_admin, t.max_manager, t.max_chief_cro
      FROM tenants t 
      JOIN tenant_databases td ON t.tenant_id = td.tenant_id 
      WHERE td.db_name = 'u294320793_crmdemo'
    `);
    console.log("Tier & Role Limits:", rows);

    console.log("Fixing max_cro for all tiers...");
    await connection.query(`UPDATE tenants SET max_cro = 2 WHERE tier = 'PRO'`);
    await connection.query(`UPDATE tenants SET max_cro = 10 WHERE tier = 'Business'`);
    await connection.query(`UPDATE tenants SET max_cro = 30 WHERE tier = 'Enterprise'`);
    await connection.query(`UPDATE tenants SET max_cro = 1 WHERE tier = 'Free'`);
    
    console.log("max_cro updated!");
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await connection.end();
  }
}

run();

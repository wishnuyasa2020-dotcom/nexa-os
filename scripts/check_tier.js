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
      SELECT t.tier 
      FROM tenants t 
      JOIN tenant_databases td ON t.tenant_id = td.tenant_id 
      WHERE td.db_name = 'u294320793_crmdemo'
    `);
    console.log("Tier:", rows);
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await connection.end();
  }
}

run();

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
    console.log("Adding columns to tenants table...");
    await connection.query(`
      ALTER TABLE tenants 
      ADD COLUMN max_admin INT DEFAULT 1 AFTER max_cro,
      ADD COLUMN max_manager INT DEFAULT 1 AFTER max_admin,
      ADD COLUMN max_chief_cro INT DEFAULT 1 AFTER max_manager
    `);
    console.log("Columns added.");

    console.log("Syncing default values based on tier...");
    // Free & Pro already defaults to 1 for Admin, Manager, Chief CRO.
    
    // Update Business
    await connection.query(`
      UPDATE tenants SET 
        max_chief_cro = 3
      WHERE tier = 'Business'
    `);

    // Update Enterprise
    await connection.query(`
      UPDATE tenants SET 
        max_manager = 3,
        max_chief_cro = 5
      WHERE tier = 'Enterprise'
    `);

    console.log("Data synced successfully.");
  } catch (error) {
    if (error.code === 'ER_DUP_FIELDNAME') {
      console.log("Columns already exist, skipping ALTER TABLE.");
    } else {
      console.error("Error:", error);
    }
  } finally {
    await connection.end();
  }
}

run();

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
    console.log("Syncing limits for PRO tier...");
    await connection.query(`
      UPDATE tenants SET 
        limit_siswa = 1000,
        limit_sekolah = 20
      WHERE tier = 'PRO'
    `);

    console.log("Syncing limits for Business tier...");
    await connection.query(`
      UPDATE tenants SET 
        limit_siswa = 2500,
        limit_sekolah = 41
      WHERE tier = 'Business'
    `);

    console.log("Syncing limits for Enterprise tier...");
    await connection.query(`
      UPDATE tenants SET 
        limit_siswa = 8333,
        limit_sekolah = 166
      WHERE tier = 'Enterprise'
    `);

    console.log("Syncing limits for Free tier...");
    await connection.query(`
      UPDATE tenants SET 
        limit_siswa = 300,
        limit_sekolah = 10
      WHERE tier = 'Free'
    `);

    console.log("Limits successfully updated!");
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await connection.end();
  }
}

run();

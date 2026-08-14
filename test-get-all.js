const mysql = require('mysql2/promise');
const crmService = require('./src/modules/crm/crm.service');
require('dotenv').config();

async function test() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });
  
  try {
    const user = { nama: 'admindemo', role: 'Admin', selectedPeriod: '2024/2025' };
    const sum = await crmService.getDashboardSummary(user);
    console.log("getDashboardSummary output:", JSON.stringify(sum, null, 2));
  } catch(err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
test();

require('dotenv').config();
const mysql = require('mysql2/promise');

async function debug() {
  const connection = await mysql.createConnection({
    host: process.env.MAIN_DB_HOST,
    user: process.env.MAIN_DB_USER,
    password: process.env.MAIN_DB_PASSWORD,
    database: process.env.MAIN_DB_NAME,
  });

  const [rows] = await connection.query("SELECT * FROM tenant_databases");
  console.log("Tenant Databases:", rows);
  
  const [tenants] = await connection.query("SELECT * FROM tenants");
  console.log("Tenants:", tenants);

  await connection.end();
}
debug();

require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  console.log('Connecting to Main Registry Database...');
  
  try {
    const connection = await mysql.createConnection({
      host: process.env.MAIN_DB_HOST,
      port: process.env.MAIN_DB_PORT || 3306,
      user: process.env.MAIN_DB_USER,
      password: process.env.MAIN_DB_PASSWORD,
      database: process.env.MAIN_DB_NAME,
      multipleStatements: true // VERY IMPORTANT for running SQL file
    });

    console.log('Connected successfully!');

    // Read SQL file
    const sqlPath = path.join(__dirname, 'migration_tiering.sql');
    const sqlQueries = fs.readFileSync(sqlPath, 'utf8');

    console.log('Executing migration_tiering.sql...');
    const [results] = await connection.query(sqlQueries);

    console.log('Migration completed successfully!');
    console.log(results);

    await connection.end();
  } catch (err) {
    console.error('Migration failed:', err.message);
  }
}

runMigration();

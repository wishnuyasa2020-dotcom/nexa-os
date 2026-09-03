const mysql = require('mysql2/promise');

async function checkDb() {
  const conn = await mysql.createConnection({
    host: 'srv1412.hstgr.io',
    user: 'u294320793_admin',
    password: '1379502026Ok!',
    database: 'u294320793_crmderma',
    port: 3306
  });

  console.log("Connected to legacy DB.");
  const [tables] = await conn.query('SHOW TABLES');
  
  for (const tableObj of tables) {
    const tableName = Object.values(tableObj)[0];
    console.log(`\n=== Table: ${tableName} ===`);
    const [cols] = await conn.query(`SHOW COLUMNS FROM \`${tableName}\``);
    cols.forEach(c => console.log(` - ${c.Field} (${c.Type})`));
    
    // get a few rows for context
    const [rows] = await conn.query(`SELECT * FROM \`${tableName}\` LIMIT 1`);
    if (rows.length > 0) {
      console.log(' Sample data:');
      console.log(JSON.stringify(rows));
    }
  }

  await conn.end();
}

checkDb().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});

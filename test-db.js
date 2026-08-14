const mysql = require('mysql2/promise');

async function test() {
  try {
    const conn = await mysql.createConnection({
      host: 'srv1412.hstgr.io',
      port: 3306,
      user: 'u294320793_admindemo',
      password: '1379502026Ok!',
      database: 'u294320793_crmdemo'
    });
    console.log('Success connection!');
    const [rows] = await conn.query('SHOW TABLES');
    console.log('Tables:', rows);
    await conn.end();
  } catch (err) {
    console.error('Error:', err.message);
  }
}
test();

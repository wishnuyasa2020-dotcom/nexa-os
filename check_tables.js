// check_tables.js
require('dotenv').config();
const { pool } = require('./src/config/database');
(async () => {
  const conn = await pool.getConnection();
  const [tables] = await conn.query('SHOW TABLES');
  tables.forEach(t => console.log(Object.values(t)[0]));
  conn.release();
  pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });

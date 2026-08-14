const { pool } = require('./src/config/database');
async function run() {
  await pool.query("UPDATE sekolah_periode SET pj_sekolah = 'admindemo' WHERE pj_sekolah IS NULL");
  console.log("Fixed!");
  process.exit(0);
}
run();

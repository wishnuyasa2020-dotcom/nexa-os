const mysql = require('mysql2/promise');

async function copyDatabase() {
  console.log('🔄 Memulai proses copy schema database...');

  // Koneksi ke DB Lama (Derma)
  const dbLama = await mysql.createConnection({
    host: 'srv1412.hstgr.io',
    port: 3306,
    user: 'u294320793_admin',
    password: '1379502026Ok!',
    database: 'u294320793_crmderma'
  });

  // Koneksi ke DB Baru (Demo)
  const dbBaru = await mysql.createConnection({
    host: 'srv1412.hstgr.io',
    port: 3306,
    user: 'u294320793_admindemo',
    password: '1379502026Ok!',
    database: 'u294320793_crmdemo'
  });

  try {
    // 1. Ambil semua tabel dari DB lama
    const [tables] = await dbLama.query('SHOW TABLES');
    const tableKey = Object.keys(tables[0])[0];

    for (const row of tables) {
      const tableName = row[tableKey];
      console.log(`📦 Copying schema tabel: ${tableName}`);

      // 2. Ambil struktur tabel (CREATE TABLE)
      const [createRes] = await dbLama.query(`SHOW CREATE TABLE \`${tableName}\``);
      let createSql = createRes[0]['Create Table'];

      // 3. Eksekusi struktur di DB Baru
      await dbBaru.query(`DROP TABLE IF EXISTS \`${tableName}\``);
      await dbBaru.query(createSql);
    }

    console.log('✅ Semua schema tabel berhasil dicopy ke DB Demo!');

    // 4. Bikin 1 User Admin Dummy biar bisa login
    console.log('👤 Membuat user admin dummy...');
    // Gunakan password hashing yang sama dengan auth system (SHA256 bawaan GAS yg kita porting)
    // Atau insert langsung, pass: "demo123"
    // Note: Karena password di auth system kita pakai SHA256(password + salt) / bcrypt,
    // kita copy aja 1 user admin dari DB lama ke DB baru (misal username: admin)

    const [users] = await dbLama.query("SELECT * FROM users WHERE role = 'Admin' OR username = 'admin' LIMIT 1");
    if (users.length > 0) {
      const u = users[0];
      const cols = Object.keys(u).map(k => `\`${k}\``).join(', ');
      const vals = Object.values(u);
      const placeholders = vals.map(() => '?').join(', ');

      await dbBaru.query(`INSERT INTO users (${cols}) VALUES (${placeholders})`, vals);
      console.log(`✅ Berhasil menyalin user login (Username: ${u.username}) ke DB Demo!`);
    } else {
      console.log('⚠️ Tidak menemukan user Admin di DB lama buat dicopy.');
    }

  } catch (err) {
    console.error('❌ GAGAL:', err.message);
  } finally {
    await dbLama.end();
    await dbBaru.end();
  }
}

copyDatabase();

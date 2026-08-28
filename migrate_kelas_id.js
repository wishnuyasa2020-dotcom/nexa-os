const { pool } = require('./src/config/database');

async function migrateKelasId() {
  const conn = await pool.getConnection();
  try {
    console.log('Starting migration for kelas -> kelas_id...');
    await conn.beginTransaction();

    // 1. Add kelas_id column if not exists
    const [cols] = await conn.query("SHOW COLUMNS FROM master_siswa LIKE 'kelas_id'");
    if (cols.length === 0) {
      console.log('Adding kelas_id column to master_siswa...');
      await conn.query("ALTER TABLE master_siswa ADD COLUMN kelas_id INT AFTER wa");
    }

    // 2. Fetch distinct 'kelas' string values from master_siswa that don't have kelas_id
    const [oldCol] = await conn.query("SHOW COLUMNS FROM master_siswa LIKE 'kelas'");
    if (oldCol.length > 0) {
        const [rows] = await conn.query("SELECT DISTINCT kelas FROM master_siswa WHERE kelas IS NOT NULL AND kelas != '' AND kelas_id IS NULL");
        console.log(`Found ${rows.length} unique string classes to migrate.`);

        for (const row of rows) {
          const kelasString = row.kelas;
          let kelasId = null;
          const [kRows] = await conn.query("SELECT id FROM master_kelas WHERE nama_kelas = ?", [kelasString]);
          
          if (kRows.length > 0) {
            kelasId = kRows[0].id;
          } else {
            const [insResult] = await conn.query("INSERT INTO master_kelas (nama_kelas) VALUES (?)", [kelasString]);
            kelasId = insResult.insertId;
            console.log(`Created new master_kelas: ${kelasString} (ID: ${kelasId})`);
          }

          // 4. Update master_siswa rows
          await conn.query("UPDATE master_siswa SET kelas_id = ? WHERE kelas = ?", [kelasId, kelasString]);
        }

        console.log('Dropping old string kelas column...');
        await conn.query("ALTER TABLE master_siswa DROP COLUMN kelas");
    } else {
        console.log('Old string kelas column already dropped.');
    }

    await conn.commit();
    console.log('Migration completed successfully.');
  } catch (err) {
    await conn.rollback();
    console.error('Migration failed:', err);
  } finally {
    conn.release();
    process.exit();
  }
}

migrateKelasId();

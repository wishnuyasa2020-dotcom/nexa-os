const { mainPool, getDynamicPool } = require('./src/config/database');

async function migrate() {
  try {
    const [tenant] = await mainPool.query('SELECT * FROM tenant_databases WHERE tenant_id = ?', ['derma-indonesia']);
    if (tenant.length === 0) throw new Error("Tenant derma-indonesia not found in main DB");
    
    const pool = getDynamicPool({
      host: tenant[0].db_host,
      user: tenant[0].db_user,
      password: tenant[0].db_password,
      database: tenant[0].db_name
    });

    console.log(`Connected to tenant DB: ${tenant[0].db_name}`);
    
    // Add bsuid column if it doesn't exist
    const [rows] = await pool.query(`SHOW COLUMNS FROM master_siswa LIKE 'bsuid'`);
    if (rows.length === 0) {
      console.log('Adding bsuid column to master_siswa...');
      await pool.query('ALTER TABLE master_siswa ADD COLUMN bsuid VARCHAR(128) UNIQUE DEFAULT NULL');
      console.log('Column bsuid added successfully.');
    } else {
      console.log('Column bsuid already exists in master_siswa.');
    }
    
    // Check if wa is nullable, and change it to nullable if it isn't
    const [waRows] = await pool.query(`SHOW COLUMNS FROM master_siswa LIKE 'wa'`);
    if (waRows.length > 0 && waRows[0].Null === 'NO') {
      console.log('Making wa column nullable...');
      await pool.query('ALTER TABLE master_siswa MODIFY COLUMN wa VARCHAR(20) NULL');
      console.log('Column wa is now nullable.');
    } else {
      console.log('Column wa is already nullable or does not exist.');
    }

  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    process.exit();
  }
}

migrate();

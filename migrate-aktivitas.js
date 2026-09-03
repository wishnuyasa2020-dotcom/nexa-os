const { mainPool, getDynamicPool } = require('./src/config/database');

async function migrate() {
  let pool;
  try {
    const [tenant] = await mainPool.query('SELECT * FROM tenant_databases WHERE tenant_id = ?', ['derma-indonesia']);
    if (tenant.length === 0) throw new Error("Tenant derma-indonesia not found in main DB");
    
    pool = getDynamicPool({
      host: tenant[0].db_host,
      user: tenant[0].db_user,
      password: tenant[0].db_password,
      database: tenant[0].db_name
    });

    console.log(`Connected to tenant DB: ${tenant[0].db_name}`);
    
    // helper to check if a column exists
    const hasCol = async (col) => {
      const [rows] = await pool.query(`SHOW COLUMNS FROM aktivitas_siswa LIKE ?`, [col]);
      return rows.length > 0;
    };

    if (await hasCol('id_siswa_nama')) {
      console.log('Renaming id_siswa_nama -> id_siswa...');
      await pool.query('ALTER TABLE aktivitas_siswa RENAME COLUMN id_siswa_nama TO id_siswa');
    }
    
    if (await hasCol('aktivitas')) {
      console.log('Renaming aktivitas -> jenis_aktivitas...');
      await pool.query('ALTER TABLE aktivitas_siswa RENAME COLUMN aktivitas TO jenis_aktivitas');
    }
    
    if (await hasCol('hasil')) {
      console.log('Renaming hasil -> hasil_aktivitas...');
      await pool.query('ALTER TABLE aktivitas_siswa RENAME COLUMN hasil TO hasil_aktivitas');
    }
    
    if (await hasCol('status_terkini')) {
      console.log('Renaming status_terkini -> status_sesudah...');
      await pool.query('ALTER TABLE aktivitas_siswa RENAME COLUMN status_terkini TO status_sesudah');
    }
    
    if (await hasCol('timestamp')) {
      console.log('Renaming timestamp -> created_at...');
      await pool.query('ALTER TABLE aktivitas_siswa CHANGE COLUMN \`timestamp\` \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
    }

    if (!(await hasCol('pj_cro'))) {
      console.log('Adding pj_cro...');
      await pool.query('ALTER TABLE aktivitas_siswa ADD COLUMN pj_cro VARCHAR(255) DEFAULT NULL');
    }

    if (!(await hasCol('status_sebelum'))) {
      console.log('Adding status_sebelum...');
      await pool.query('ALTER TABLE aktivitas_siswa ADD COLUMN status_sebelum VARCHAR(255) DEFAULT NULL');
    }

    console.log('aktivitas_siswa migration complete.');

  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    process.exit();
  }
}

migrate();

'use strict';

/**
 * saas.service.js
 * Engine SaaS: Manajemen DB Pool & Self-Service Onboarding (Free Tier)
 * Berdasarkan Roadmap Modul SaaS (roadmap-modul-saas.md) Bab 1 & 2
 */

const crypto = require('crypto');
const mysql = require('mysql2/promise');
const nodemailer = require('nodemailer');
const { pool, mainPool } = require('../../config/database');

// ── Transporter Email (Opsional & Non-Blocking) ──────────────────────────────
let transporter = null;
if (process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

// ── Token Helper (Kompatibel dengan Nexa Auth) ───────────────────────────────
function toBase64WebSafe(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function generateTenantJwt(payload) {
  const secret = process.env.JWT_SECRET_KEY;
  if (!secret) throw new Error('JWT_SECRET_KEY belum diset di .env!');

  if (!payload.expires) {
    payload.expires = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 hari
  }

  const payloadStr = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', secret).update(payloadStr).digest();
  return toBase64WebSafe(payloadStr) + '.' + toBase64WebSafe(signature);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. STATISTIK & DAFTAR DB POOL (Untuk Super Admin & Monitoring)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mengambil ringkasan kapasitas pool database
 */
async function getPoolStats() {
  if (!mainPool) throw new Error('Main DB pool tidak terhubung.');

  const [rows] = await mainPool.query(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'AVAILABLE' THEN 1 ELSE 0 END) AS available,
      SUM(CASE WHEN status = 'IN_USE' THEN 1 ELSE 0 END) AS in_use,
      SUM(CASE WHEN status = 'MAINTENANCE' THEN 1 ELSE 0 END) AS maintenance
    FROM db_pools
  `);

  const stat = rows[0] || {};
  return {
    total: parseInt(stat.total || 0, 10),
    available: parseInt(stat.available || 0, 10),
    in_use: parseInt(stat.in_use || 0, 10),
    maintenance: parseInt(stat.maintenance || 0, 10),
    is_ready_for_signup: parseInt(stat.available || 0, 10) > 0,
  };
}

/**
 * Mengambil seluruh daftar database di DB Pool (Super Admin)
 */
async function listPools() {
  if (!mainPool) throw new Error('Main DB pool tidak terhubung.');

  const [rows] = await mainPool.query(`
    SELECT
      p.id,
      p.db_host,
      p.db_port,
      p.db_name,
      p.db_user,
      p.status,
      p.assigned_tenant_id,
      p.assigned_at,
      p.notes,
      p.created_at,
      t.brand_name
    FROM db_pools p
    LEFT JOIN tenants t ON t.tenant_id = p.assigned_tenant_id
    ORDER BY
      CASE p.status
        WHEN 'AVAILABLE' THEN 1
        WHEN 'IN_USE' THEN 2
        ELSE 3
      END,
      p.created_at DESC
  `);

  return rows;
}

/**
 * Mendaftarkan database kosong baru ke DB Pool (Super Admin)
 */
async function addDatabaseToPool({ dbHost, dbPort, dbName, dbUser, dbPassword, notes }) {
  if (!mainPool) throw new Error('Main DB pool tidak terhubung.');

  if (!dbHost || !dbName || !dbUser || !dbPassword) {
    throw new Error('Host, DB Name, DB User, dan DB Password wajib diisi.');
  }

  const port = parseInt(dbPort || 3306, 10);

  // 1. Uji koneksi sebelum disimpan ke pool untuk memastikan kredensial valid
  let testConn;
  try {
    testConn = await mysql.createConnection({
      host: dbHost,
      port,
      user: dbUser,
      password: dbPassword,
      database: dbName,
      connectTimeout: 5000,
    });
    await testConn.query('SELECT 1');
  } catch (connErr) {
    throw new Error(`Gagal menghubungkan ke database ${dbName}: ${connErr.message}`);
  } finally {
    if (testConn) await testConn.end();
  }

  // 2. Simpan ke db_pools
  const [result] = await mainPool.query(`
    INSERT INTO db_pools (db_host, db_port, db_name, db_user, db_password, status, notes)
    VALUES (?, ?, ?, ?, ?, 'AVAILABLE', ?)
    ON DUPLICATE KEY UPDATE
      db_host = VALUES(db_host),
      db_port = VALUES(db_port),
      db_user = VALUES(db_user),
      db_password = VALUES(db_password),
      status = IF(status = 'IN_USE', status, 'AVAILABLE'),
      notes = VALUES(notes)
  `, [dbHost, port, dbName, dbUser, dbPassword, notes || null]);

  return { id: result.insertId, dbName, status: 'AVAILABLE' };
}

/**
 * Menghapus database dari DB Pool (hanya boleh jika masih AVAILABLE)
 */
async function removeDatabaseFromPool(id) {
  if (!mainPool) throw new Error('Main DB pool tidak terhubung.');

  const [existing] = await mainPool.query('SELECT id, status, db_name FROM db_pools WHERE id = ?', [id]);
  if (existing.length === 0) {
    throw new Error('Database pool tidak ditemukan.');
  }

  if (existing[0].status === 'IN_USE') {
    throw new Error(`Database ${existing[0].db_name} sedang aktif digunakan oleh tenant. Tidak dapat dihapus.`);
  }

  await mainPool.query('DELETE FROM db_pools WHERE id = ?', [id]);
  return { id, dbName: existing[0].db_name, deleted: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. SELF-SERVICE ONBOARDING ENGINE (Sign-Up Mandiri Free Tier)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pendaftaran Klien SaaS Mandiri (Public Self-Registration)
 *
 * Mengambil 1 database AVAILABLE secara atomik dari DB Pool,
 * membuat profil tenant baru (Free Tier), menginjeksi tabel & skema lengkap,
 * membuat akun Super Admin pertama, dan menghasilkan token login seketika.
 */
async function registerTenantSelfService({ brand_name, admin_name, admin_email, admin_password, whatsapp_number }) {
  if (!mainPool) throw new Error('Main DB pool tidak terhubung.');

  // 1. Validasi Input
  if (!brand_name || !brand_name.trim()) {
    throw new Error('Nama Brand / LPK wajib diisi.');
  }
  if (!admin_email || !admin_email.trim() || !admin_email.includes('@')) {
    throw new Error('Email Admin tidak valid.');
  }
  if (!admin_password || admin_password.length < 6) {
    throw new Error('Password minimal 6 karakter.');
  }

  const brand = brand_name.trim();
  const email = admin_email.trim().toLowerCase();
  const adminDisplayName = (admin_name && admin_name.trim()) || 'Super Admin';
  const wa = whatsapp_number ? String(whatsapp_number).replace(/\D/g, '') : null;

  // 2. Cek apakah brand_name atau email sudah terdaftar di nexamain
  const [existTenants] = await mainPool.query('SELECT tenant_id FROM tenants WHERE brand_name = ?', [brand]);
  if (existTenants.length > 0) {
    throw new Error(`Nama brand "${brand}" sudah terdaftar. Silakan gunakan nama lain atau login.`);
  }

  // Generate tenant_id yang bersih
  let tenantId = brand.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  if (!tenantId) tenantId = 'tenant-' + Date.now();

  const [existId] = await mainPool.query('SELECT tenant_id FROM tenants WHERE tenant_id = ?', [tenantId]);
  if (existId.length > 0) {
    tenantId += '-' + Math.floor(1000 + Math.random() * 9000);
  }

  // 3. ATOMIC CLAIM DATABASE DARI DB POOL (TRANSACTION + FOR UPDATE)
  const mainConn = await mainPool.getConnection();
  let claimedPoolDb = null;

  try {
    await mainConn.beginTransaction();

    const [poolRows] = await mainConn.query(`
      SELECT id, db_host, db_port, db_name, db_user, db_password
      FROM db_pools
      WHERE status = 'AVAILABLE'
      ORDER BY id ASC
      LIMIT 1
      FOR UPDATE
    `);

    if (poolRows.length === 0) {
      await mainConn.rollback();
      const err = new Error('Kapasitas pendaftaran instan saat ini sedang penuh. Tim kami sedang menyiapkan database baru, silakan coba beberapa saat lagi.');
      err.statusCode = 503;
      throw err;
    }

    claimedPoolDb = poolRows[0];

    // Tandai status database menjadi IN_USE
    await mainConn.query(`
      UPDATE db_pools
      SET status = 'IN_USE', assigned_tenant_id = ?, assigned_at = NOW()
      WHERE id = ?
    `, [tenantId, claimedPoolDb.id]);

    // Insert ke tabel tenants (Tier: Free)
    await mainConn.query(`
      INSERT INTO tenants (
        tenant_id, brand_name, tier, status,
        limit_siswa, limit_sekolah,
        max_admin, max_manager, max_chief_cro, max_cro,
        whatsapp_phone_id
      ) VALUES (?, ?, 'FREE', 'ACTIVE', 300, 10, 1, 1, 1, 1, ?)
    `, [tenantId, brand, wa || null]);

    // Insert ke tabel tenant_databases
    await mainConn.query(`
      INSERT INTO tenant_databases (
        tenant_id, db_host, db_port, db_name, db_user, db_password
      ) VALUES (?, ?, ?, ?, ?, ?)
    `, [
      tenantId,
      claimedPoolDb.db_host,
      claimedPoolDb.db_port || 3306,
      claimedPoolDb.db_name,
      claimedPoolDb.db_user,
      claimedPoolDb.db_password
    ]);

    await mainConn.commit();
  } catch (txErr) {
    await mainConn.rollback();
    throw txErr;
  } finally {
    mainConn.release();
  }

  // 4. AUTO-MIGRATION & INJEKSI SKEMA KE DATABASE TENANT
  console.log(`[SaaS Onboarding] Inisialisasi skema ke DB tenant: ${claimedPoolDb.db_name}...`);
  const tenantConn = await mysql.createConnection({
    host: claimedPoolDb.db_host,
    port: claimedPoolDb.db_port || 3306,
    user: claimedPoolDb.db_user,
    password: claimedPoolDb.db_password,
    database: claimedPoolDb.db_name,
  });

  let createdUser = null;

  try {
    // 4a. Cek apakah tabel sudah ada
    const [existingTables] = await tenantConn.query('SHOW TABLES');
    const tableNames = existingTables.map(t => Object.values(t)[0]);

    // Jika database kosong, salin seluruh DDL dari referensi (default pool)
    if (!tableNames.includes('users') || !tableNames.includes('master_siswa')) {
      console.log(`[SaaS Onboarding] Menyalin struktur tabel dari DB referensi ke ${claimedPoolDb.db_name}...`);
      await tenantConn.query('SET FOREIGN_KEY_CHECKS = 0');

      const [refTables] = await pool.query('SHOW TABLES');
      const tableKey = Object.keys(refTables[0])[0];

      for (const row of refTables) {
        const tableName = row[tableKey];
        const [createRes] = await pool.query(`SHOW CREATE TABLE \`${tableName}\``);
        let createSql = createRes[0]['Create Table'];
        
        // Pastikan collation seragam utf8mb4_unicode_ci
        createSql = createSql.replace(/COLLATE=[a-zA-Z0-9_]+/g, 'COLLATE=utf8mb4_unicode_ci');
        
        await tenantConn.query(`DROP TABLE IF EXISTS \`${tableName}\``);
        await tenantConn.query(createSql);
      }

      await tenantConn.query('SET FOREIGN_KEY_CHECKS = 1');
    }

    // 4b. Pastikan tabel student_current_state ada
    await tenantConn.query(`
      CREATE TABLE IF NOT EXISTS student_current_state (
        id_siswa         VARCHAR(50)  NOT NULL,
        nama_siswa       VARCHAR(150) NULL,
        cro_assignee     VARCHAR(100) NULL COMMENT 'Nama CRO yang handle siswa ini',
        pipeline_state   VARCHAR(50)  NULL COMMENT 'commercial_state terkini: Lead/Prospect/Opportunity/Customer',
        status_label     VARCHAR(50)  NULL COMMENT 'status_terkini legacy',
        marketing_period VARCHAR(20)  NULL,
        updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id_siswa),
        INDEX idx_cro_assignee (cro_assignee),
        INDEX idx_pipeline_state (pipeline_state)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
        COMMENT='Read-Model Projection snapshot status siswa per CRO'
    `);

    // 4c. Injeksi Akun Admin Pertama
    const adminUsername = 'admin_' + tenantId.replace(/[^a-z0-9]/g, '');
    const salt = crypto.randomBytes(10).toString('hex');
    const hash = crypto.createHash('sha256').update(String(admin_password) + String(salt)).digest('hex');

    // Cek jika username sudah ada
    const [existingUsers] = await tenantConn.query('SELECT id FROM users WHERE username = ? OR email = ?', [adminUsername, email]);
    let adminUserId;

    if (existingUsers.length > 0) {
      adminUserId = existingUsers[0].id;
      await tenantConn.query(`
        UPDATE users
        SET username = ?, email = ?, password = ?, salt = ?, nama = ?, role = 'Admin', status = 'aktif'
        WHERE id = ?
      `, [adminUsername, email, hash, salt, adminDisplayName, adminUserId]);
    } else {
      const [insertUser] = await tenantConn.query(`
        INSERT INTO users (username, email, password, salt, nama, role, status)
        VALUES (?, ?, ?, ?, ?, 'Admin', 'aktif')
      `, [adminUsername, email, hash, salt, adminDisplayName]);
      adminUserId = insertUser.insertId;
    }

    createdUser = {
      id: adminUserId,
      username: adminUsername,
      email,
      nama: adminDisplayName,
      role: 'Admin',
      tenantId,
    };

    // 4d. Injeksi Periode Marketing Default
    const [periods] = await tenantConn.query('SELECT id FROM marketing_period WHERE is_active = 1');
    if (periods.length === 0) {
      await tenantConn.query(`
        INSERT INTO marketing_period (nama_periode, is_active, created_date)
        VALUES ('2026/2027', 1, NOW())
      `);
    }

    // 4e. Catat event awal ke events_log
    try {
      const eventId = `EVT-TENANT-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      await tenantConn.query(`
        INSERT INTO events_log (event_id, aggregate_type, aggregate_id, event_type, payload, actor_id, created_at)
        VALUES (?, 'tenant', ?, 'TenantSelfRegistered', ?, ?, NOW())
      `, [
        eventId,
        tenantId,
        JSON.stringify({ brand, tier: 'FREE', admin_email: email }),
        adminUsername
      ]);
    } catch (evtErr) {
      console.warn('[SaaS Onboarding] Gagal catat event log:', evtErr.message);
    }

  } finally {
    await tenantConn.end();
  }

  // 5. Generate Token Auto-Login JWT
  const authToken = generateTenantJwt({
    id: createdUser.id,
    username: createdUser.username,
    nama: createdUser.nama,
    role: createdUser.role,
    tenantId,
    tier: 'FREE',
  });

  // 6. Kirim Welcome Email (Non-Blocking)
  if (transporter) {
    transporter.sendMail({
      from: `"Nexa OS" <${process.env.SMTP_USER}>`,
      to: email,
      subject: `Selamat Datang di Nexa CRM - Akun ${brand} Siap Digunakan!`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; rounded: 8px;">
          <h2 style="color: #0f172a;">Halo, ${adminDisplayName}!</h2>
          <p>Pendaftaran tenant <strong>${brand}</strong> di Nexa OS berhasil diproses. Sistem CRM Anda siap beroperasi seketika.</p>
          <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 4px 0;"><strong>Tenant ID:</strong> <code>${tenantId}</code></p>
            <p style="margin: 4px 0;"><strong>Username:</strong> <code>${createdUser.username}</code></p>
            <p style="margin: 4px 0;"><strong>Paket:</strong> Free Tier (300 Siswa / 10 Sekolah)</p>
          </div>
          <p>Silakan login ke dashboard Anda dengan mengklik tautan di bawah ini:</p>
          <p><a href="https://nexa-crm-web.vercel.app/login" style="display: inline-block; background-color: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold;">Masuk ke Dashboard Nexa CRM</a></p>
          <p style="font-size: 12px; color: #64748b; margin-top: 30px;">Email ini dikirim secara otomatis oleh Nexa OS SaaS Engine.</p>
        </div>
      `
    }).catch(mailErr => {
      console.warn('[SaaS Onboarding] Gagal kirim welcome email:', mailErr.message);
    });
  }

  return {
    tenantId,
    brandName: brand,
    tier: 'FREE',
    user: {
      id: createdUser.id,
      username: createdUser.username,
      nama: createdUser.nama,
      email: createdUser.email,
      role: 'Admin',
    },
    token: authToken,
    loginUrl: '/login',
  };
}

module.exports = {
  getPoolStats,
  listPools,
  addDatabaseToPool,
  removeDatabaseFromPool,
  registerTenantSelfService,
};

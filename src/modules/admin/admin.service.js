'use strict';

const crypto = require('crypto');
const mysql = require('mysql2/promise');
const { pool, mainPool } = require('../../config/database');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER, 
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Nexa Control Centre — Admin Service
 *
 * Port dari NexaControlAPI.gs ke Express.
 * Query sama persis dengan GAS agar hasilnya identik.
 */

async function getOverview() {
  // Active period
  const [[periodRows]] = await pool.query(
    'SELECT nama_period FROM marketing_period WHERE status = ? ORDER BY created_date DESC LIMIT 1',
    ['aktif']
  );
  const activePeriod = periodRows?.nama_period || '-';

  const [
    [userRows],
    [croRows],
    [siswaRows],
    [sekolahRows],
    [siswaAktifRows],
    [chatMsgRows],
    [convRows],
    [bcastMonthRows],
    [bcastSuccessRows],
    [hvRows],
  ] = await Promise.all([
    pool.query('SELECT status, COUNT(*) AS cnt FROM users GROUP BY status'),
    pool.query("SELECT COUNT(*) AS cnt FROM users WHERE LOWER(role) = 'cro' AND LOWER(status) = 'aktif'"),
    pool.query('SELECT COUNT(*) AS cnt FROM master_siswa'),
    pool.query('SELECT COUNT(*) AS cnt FROM master_sekolah'),
    activePeriod !== '-'
      ? pool.query('SELECT COUNT(*) AS cnt FROM siswa_periode WHERE marketing_period = ?', [activePeriod])
      : Promise.resolve([[{ cnt: 0 }]]),
    pool.query('SELECT COUNT(*) AS cnt FROM chat_messages WHERE datetime >= DATE_SUB(NOW(), INTERVAL 24 HOUR)'),
    pool.query("SELECT COUNT(*) AS cnt FROM conversations WHERE status = 'active'"),
    pool.query("SELECT COUNT(*) AS cnt FROM broadcast WHERE created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')"),
    pool.query('SELECT COALESCE(SUM(total_success), 0) AS cnt FROM broadcast'),
    activePeriod !== '-'
      ? pool.query('SELECT COUNT(*) AS cnt FROM home_visit WHERE marketing_period = ?', [activePeriod])
      : Promise.resolve([[{ cnt: 0 }]]),
  ]);

  // totalUsers = semua status, activeUsers = yang status 'aktif'
  let totalUsers = 0, activeUsers = 0;
  userRows.forEach(r => {
    const c = parseInt(r.cnt) || 0;
    totalUsers += c;
    if ((r.status || '').toLowerCase() === 'aktif') activeUsers = c;
  });

  const [[tenantCount]] = await mainPool.query('SELECT COUNT(*) AS cnt FROM tenants');

  return {
    tenants:              parseInt(tenantCount?.cnt)         || 0,
    totalUsers,
    activeUsers,
    activeCro:            parseInt(croRows[0]?.cnt)          || 0,
    totalSiswa:           parseInt(siswaRows[0]?.cnt)        || 0,
    totalSekolah:         parseInt(sekolahRows[0]?.cnt)      || 0,
    siswaAktifPeriode:    parseInt(siswaAktifRows[0]?.cnt)   || 0,
    messagesLast24h:      parseInt(chatMsgRows[0]?.cnt)      || 0,
    activeConversations:  parseInt(convRows[0]?.cnt)         || 0,
    broadcastsMonth:      parseInt(bcastMonthRows[0]?.cnt)   || 0,
    totalBroadcastSuccess: parseInt(bcastSuccessRows[0]?.cnt) || 0,
    homeVisitsAktif:      parseInt(hvRows[0]?.cnt)           || 0,
    activePeriod,
    generatedAt:          new Date().toISOString(),
  };
}

async function getTenant() {
  // Ambil profil semua tenant dari Main DB
  const [rows] = await mainPool.query(`
    SELECT tenant_id, brand_name, tier, status, max_cro, current_period_start, current_period_end 
    FROM tenants 
    ORDER BY created_at ASC
  `);
  
  if (rows.length === 0) return [];

  const results = [];
  
  for (const d of rows) {
    let croCnt = 0, siswaCnt = 0, sekolahCnt = 0;
    
    try {
      const [[dbInfo]] = await mainPool.query("SELECT db_host, db_name, db_user, db_password FROM tenant_databases WHERE tenant_id = ?", [d.tenant_id]);
      if (dbInfo) {
         const tDb = await mysql.createConnection({
            host: dbInfo.db_host, user: dbInfo.db_user, password: dbInfo.db_password, database: dbInfo.db_name
         });
         const [[cro]] = await tDb.query("SELECT COUNT(*) AS cnt FROM users WHERE LOWER(role)='cro' AND LOWER(status)='aktif'");
         const [[siswa]] = await tDb.query("SELECT COUNT(*) AS cnt FROM master_siswa");
         const [[sekolah]] = await tDb.query("SELECT COUNT(*) AS cnt FROM master_sekolah");
         croCnt = parseInt(cro.cnt) || 0;
         siswaCnt = parseInt(siswa.cnt) || 0;
         sekolahCnt = parseInt(sekolah.cnt) || 0;
         await tDb.end();
      }
    } catch (e) {
      console.error("Error fetching stats for tenant " + d.tenant_id, e);
    }
    
    let activePeriod = '2025/2026';
    if (d.current_period_start) {
      const yr = new Date(d.current_period_start).getFullYear();
      activePeriod = yr + '/' + (yr + 1);
    }

    results.push({
      tenantId: d.tenant_id,
      brandName: d.brand_name,
      appName: 'Derma CRM',
      tier: d.tier,
      status: d.status,
      primaryColor: '#0066cc',
      activeCro: croCnt,
      totalCro: croCnt,
      maxCro: d.max_cro || 10,
      activePeriod: activePeriod,
      periodStart: d.current_period_start,
      periodEnd: d.current_period_end,
      siswaAktif: siswaCnt,
      sekolahAktif: sekolahCnt,
      activeTemplates: 3,
      lastIncomingMsg: null,
      whatsappStatus: 'CONNECTED'
    });
  }

  return results;
}

async function getUsageStats() {
  return {
    activePeriod: '2025/2026',
    siswaByStatus: [],
    sekolahByStatus: [],
    broadcast: { campaigns: 0, success: 0, failed: 0, pending: 0 },
    homeVisits: 0,
    msgByDay: [],
    croActivity: []
  };
}

async function getUserList() {
  const [rows] = await pool.query(
    "SELECT id, username, nama, role, status FROM users ORDER BY FIELD(role,'Admin','Manager','CRO','Visitor'), nama ASC"
  );
  return rows.map(r => ({
    id: r.id,
    username: r.username,
    nama: r.nama,
    role: r.role,
    status: r.status
  }));
}

async function getSystemHealth() {
  try {
    const [[{ dbTime }]] = await pool.query('SELECT NOW() AS dbTime');
    return {
      database: { status: 'ok', serverTime: dbTime },
      uptime:   process.uptime(),
      memory:   process.memoryUsage(),
    };
  } catch (err) {
    return {
      database: { status: 'error', message: err.message },
    };
  }
}

async function getActivity() {
  const activities = [];

  // Recent broadcasts (24h)
  const [bcRows] = await pool.query(
    'SELECT id_broadcast, template_display_name, total_target, total_success, total_failed, status, created_by, created_at ' +
    'FROM broadcast WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) ORDER BY created_at DESC LIMIT 8'
  );
  bcRows.forEach(r => {
    activities.push({
      type:  'broadcast',
      icon:  '📢',
      title: 'Broadcast: ' + (r.template_display_name || '-'),
      desc:  'Target ' + r.total_target + ' • Terkirim ' + r.total_success + ' • Gagal ' + r.total_failed,
      badge: r.status,
      user:  r.created_by || 'System',
      ts:    r.created_at
    });
  });

  // Recent new siswa (24h)
  const [siswaRows] = await pool.query(
    'SELECT nama_lengkap, created_date FROM master_siswa WHERE created_date >= DATE_SUB(NOW(), INTERVAL 24 HOUR) ORDER BY created_date DESC LIMIT 5'
  );
  siswaRows.forEach(r => {
    activities.push({
      type:  'siswa_baru',
      icon:  '👤',
      title: 'Siswa Baru: ' + r.nama_lengkap,
      desc:  'Terdaftar via form sosialisasi',
      badge: 'Baru',
      user:  'System',
      ts:    r.created_date
    });
  });

  // Recent incoming chat (24h)
  const [chatRows] = await pool.query(
    "SELECT from_name, datetime FROM chat_messages WHERE direction = 'incoming' AND datetime >= DATE_SUB(NOW(), INTERVAL 24 HOUR) ORDER BY datetime DESC LIMIT 5"
  );
  chatRows.forEach(r => {
    activities.push({
      type:  'chat',
      icon:  '💬',
      title: 'Chat masuk: ' + (r.from_name || 'Unknown'),
      desc:  'Pesan WhatsApp masuk',
      badge: 'Chat',
      user:  'WhatsApp',
      ts:    r.datetime
    });
  });

  // Recent home visits (24h)
  const [hvRows] = await pool.query(
    'SELECT id_siswa_nama, tanggal_hv, hasil_hv FROM home_visit WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 24 HOUR) ORDER BY timestamp DESC LIMIT 5'
  );
  hvRows.forEach(r => {
    activities.push({
      type:  'homevisit',
      icon:  '🏠',
      title: 'Home Visit: ' + (r.id_siswa_nama ? r.id_siswa_nama.split('|').pop().trim() : '-'),
      desc:  'Hasil: ' + (r.hasil_hv || '-'),
      badge: 'HV',
      user:  'CRO',
      ts:    r.tanggal_hv
    });
  });

  // Sort descending
  activities.sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0));
  return activities.slice(0, 10);
}

async function provisionNewTenant(payload) {
  const { brand, tier, maxCro, dbHost, dbName, dbUser, dbPass, adminEmail } = payload;
  
  // 1. Generate tenant_id from brand name
  let tenantId = brand.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  if (!tenantId) tenantId = 'tenant-' + Date.now();
  
  // 2. Determine limits based on Tier
  let limitSiswa = 1000;
  let limitSekolah = 20;
  let maxAdmin = 1, maxManager = 1, maxChiefCro = 1;
  
  if (tier === 'Free') { limitSiswa = 300; limitSekolah = 10; maxAdmin=1; maxManager=1; maxChiefCro=1; }
  else if (tier === 'Pro') { limitSiswa = 1000; limitSekolah = 20; maxAdmin=1; maxManager=1; maxChiefCro=1; }
  else if (tier === 'Business') { limitSiswa = 2500; limitSekolah = 41; maxAdmin=1; maxManager=1; maxChiefCro=3; }
  else if (tier === 'Enterprise') { limitSiswa = 8333; limitSekolah = 166; maxAdmin=1; maxManager=3; maxChiefCro=5; }
  
  // Check if tenant_id already exists
  const [exist] = await mainPool.query("SELECT tenant_id FROM tenants WHERE tenant_id = ?", [tenantId]);
  if (exist.length > 0) {
    tenantId += '-' + Math.floor(Math.random()*1000);
  }

  // Insert into tenants
  await mainPool.query(`
    INSERT INTO tenants (tenant_id, brand_name, tier, status, limit_siswa, limit_sekolah, max_admin, max_manager, max_chief_cro, max_cro)
    VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?)
  `, [tenantId, brand, tier, limitSiswa, limitSekolah, maxAdmin, maxManager, maxChiefCro, maxCro]);
  
  // Insert into tenant_databases
  await mainPool.query(`
    INSERT INTO tenant_databases (tenant_id, db_host, db_name, db_user, db_password)
    VALUES (?, ?, ?, ?, ?)
  `, [tenantId, dbHost, dbName, dbUser, dbPass]);
  
  // 3. Auto-Migration (Copy Schema from default DB)
  console.log(`[Provisioning] Connecting to new tenant DB: ${dbName} at ${dbHost}...`);
  const dbBaru = await mysql.createConnection({
    host: dbHost, port: 3306, user: dbUser, password: dbPass, database: dbName
  });
  let adminUsername, adminPassword;
  try {
    const [tables] = await pool.query('SHOW TABLES');
    const tableKey = Object.keys(tables[0])[0];
    
    // Disable foreign key checks to prevent errno 150
    await dbBaru.query('SET FOREIGN_KEY_CHECKS = 0');
    
    for (const row of tables) {
      const tableName = row[tableKey];
      console.log(`[Provisioning] Copying schema for table: ${tableName}`);
      const [createRes] = await pool.query(`SHOW CREATE TABLE \`${tableName}\``);
      let createSql = createRes[0]['Create Table'];
      
      await dbBaru.query(`DROP TABLE IF EXISTS \`${tableName}\``);
      await dbBaru.query(createSql);
    }
    
    // Re-enable foreign key checks
    await dbBaru.query('SET FOREIGN_KEY_CHECKS = 1');
    
    // Create Admin user with generated credentials
    adminUsername = 'admin_' + brand.toLowerCase().replace(/[^a-z0-9]/g, '');
    adminPassword = 'Nexa' + Math.floor(1000 + Math.random() * 9000) + '!';
    
    // Generate salt and hash (SHA256) compatible with Nexa Auth (varchar 20 limit)
    const salt = crypto.randomBytes(10).toString('hex');
    const hash = crypto.createHash('sha256').update(String(adminPassword) + String(salt)).digest('hex');

    await dbBaru.query(
      `INSERT INTO users (username, email, password, salt, nama, role, status) VALUES (?, ?, ?, ?, 'Super Admin', 'Admin', 'aktif')`,
      [adminUsername, adminEmail, hash, salt]
    );

  } finally {
    await dbBaru.end();
  }

  // Kirim email kredensial ke Admin
  try {
    const mailOptions = {
      from: `"Nexa OS Support" <${process.env.SMTP_USER}>`,
      to: adminEmail,
      subject: `Selamat Datang di Nexa CRM - Kredensial Akses ${brand}`,
      html: `
        <h2>Halo, Admin ${brand}!</h2>
        <p>Tenant Anda berhasil dibuat dan telah aktif. Berikut adalah kredensial akses untuk akun Super Admin Anda:</p>
        <ul>
          <li><strong>URL Login:</strong> <a href="http://localhost:3000/login">http://localhost:3000/login</a></li>
          <li><strong>Username:</strong> ${adminUsername}</li>
          <li><strong>Password:</strong> ${adminPassword}</li>
        </ul>
        <p>Harap segera login dan ubah password Anda demi keamanan.</p>
        <br/>
        <p>Terima kasih,</p>
        <p>Tim Nexa OS</p>
      `
    };
    await transporter.sendMail(mailOptions);
    console.log(`[Provisioning] Kredensial admin berhasil dikirim ke ${adminEmail}`);
  } catch (err) {
    console.error(`[Provisioning] Gagal mengirim email kredensial ke ${adminEmail}:`, err.message);
  }
  
  return { tenantId, brand, adminUsername, adminPassword };
}

async function addCroQuota(payload) {
  const { tenantId, tambahanCro } = payload;
  const num = parseInt(tambahanCro);
  
  if (!num || num <= 0) throw new Error("Jumlah tambahan tidak valid");
  
  // Ambil data sekarang
  const [rows] = await mainPool.query("SELECT max_cro FROM tenants WHERE tenant_id = ?", [tenantId]);
  if (rows.length === 0) throw new Error("Tenant tidak ditemukan");
  
  const currentMax = rows[0].max_cro || 0;
  const newMax = currentMax + num;
  
  await mainPool.query("UPDATE tenants SET max_cro = ? WHERE tenant_id = ?", [newMax, tenantId]);
  return { tenantId, previousMax: currentMax, newMax };
}

module.exports = { getOverview, getTenant, getUsageStats, getUserList, getSystemHealth, getActivity, provisionNewTenant, addCroQuota };

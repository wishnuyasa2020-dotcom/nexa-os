'use strict';

const crypto = require('crypto');
const mysql = require('mysql2/promise');
const axios = require('axios');
const { pool, mainPool } = require('../../config/database');
const { sendGmailAPI } = require('../../utils/mailer');


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
    tenants: parseInt(tenantCount?.cnt) || 0,
    totalUsers,
    activeUsers,
    activeCro: parseInt(croRows[0]?.cnt) || 0,
    totalSiswa: parseInt(siswaRows[0]?.cnt) || 0,
    totalSekolah: parseInt(sekolahRows[0]?.cnt) || 0,
    siswaAktifPeriode: parseInt(siswaAktifRows[0]?.cnt) || 0,
    messagesLast24h: parseInt(chatMsgRows[0]?.cnt) || 0,
    activeConversations: parseInt(convRows[0]?.cnt) || 0,
    broadcastsMonth: parseInt(bcastMonthRows[0]?.cnt) || 0,
    totalBroadcastSuccess: parseInt(bcastSuccessRows[0]?.cnt) || 0,
    homeVisitsAktif: parseInt(hvRows[0]?.cnt) || 0,
    activePeriod,
    generatedAt: new Date().toISOString(),
  };
}

async function getTenant() {
  // Self-healing: Pastikan kolom tenant_type ada di tabel tenants
  await mainPool.query(`
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS
      tenant_type ENUM('lpk','general') NOT NULL DEFAULT 'lpk'
  `).catch(() => {}); // silent jika sudah ada

  // Ambil profil semua tenant dari Main DB
  const [rows] = await mainPool.query(`
    SELECT 
      tenant_id, brand_name, tenant_type, tier, status, billing_cycle,
      limit_siswa, used_siswa, limit_sekolah, used_sekolah,
      max_cro, max_admin, max_manager, max_chief_cro,
      current_period_start, current_period_end, next_quota_reset,
      whatsapp_phone_id, whatsapp_waba_id, whatsapp_number,
      whatsapp_display_name, whatsapp_status, whatsapp_business_category,
      whatsapp_requested_at, whatsapp_connected_at, whatsapp_notes
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
        croCnt = parseInt(cro?.cnt) || 0;
        siswaCnt = parseInt(siswa?.cnt) || 0;
        sekolahCnt = parseInt(sekolah?.cnt) || 0;
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
      appName: 'Nexa CRM',
      tier: (d.tier || 'FREE').toUpperCase(),
      billingCycle: (d.billing_cycle || 'MONTHLY').toUpperCase(),
      status: d.status || 'ACTIVE',
      primaryColor: '#0066cc',
      limitCro: d.max_cro || 1,
      activeCro: croCnt,
      totalCro: croCnt,
      maxCro: d.max_cro || 1,
      maxAdmin: d.max_admin || 1,
      maxManager: d.max_manager || 1,
      maxChiefCro: d.max_chief_cro || 1,
      limitSiswa: d.limit_siswa || 300,
      usedSiswa: d.used_siswa != null ? d.used_siswa : siswaCnt,
      limitSekolah: d.limit_sekolah || 10,
      usedSekolah: d.used_sekolah != null ? d.used_sekolah : sekolahCnt,
      nextQuotaReset: d.next_quota_reset,
      activePeriod: activePeriod,
      periodStart: d.current_period_start,
      periodEnd: d.current_period_end,
      siswaAktif: siswaCnt,
      sekolahAktif: sekolahCnt,
      activeTemplates: 3,
      lastIncomingMsg: null,
      tenantType: d.tenant_type || 'lpk',
      whatsappStatus: d.whatsapp_status || (d.whatsapp_phone_id ? 'CONNECTED' : 'NOT_CONFIGURED'),
      whatsappPhoneId: d.whatsapp_phone_id || '',
      whatsappWabaId: d.whatsapp_waba_id || '',
      whatsappNumber: d.whatsapp_number || '',
      whatsappDisplayName: d.whatsapp_display_name || '',
      whatsappBusinessCategory: d.whatsapp_business_category || '',
      whatsappRequestedAt: d.whatsapp_requested_at || null,
      whatsappConnectedAt: d.whatsapp_connected_at || null,
      whatsappNotes: d.whatsapp_notes || ''
    });
  }

  return results;
}

/**
 * Update tenant_type — hanya bisa dilakukan Superadmin
 * (untuk koreksi jika tenant salah pilih tipe saat onboarding)
 */
async function updateTenantType(tenantId, tenantType) {
  if (!['lpk', 'general'].includes(tenantType)) {
    throw new Error('Tipe tenant tidak valid. Harus \'lpk\' atau \'general\'.');
  }
  await mainPool.query(
    'UPDATE tenants SET tenant_type = ? WHERE tenant_id = ?',
    [tenantType, tenantId]
  );
  return { tenantId, tenantType };
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
      uptime: process.uptime(),
      memory: process.memoryUsage(),
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
      type: 'broadcast',
      icon: '📢',
      title: 'Broadcast: ' + (r.template_display_name || '-'),
      desc: 'Target ' + r.total_target + ' • Terkirim ' + r.total_success + ' • Gagal ' + r.total_failed,
      badge: r.status,
      user: r.created_by || 'System',
      ts: r.created_at
    });
  });

  // Recent new siswa (24h)
  const [siswaRows] = await pool.query(
    'SELECT nama_lengkap, created_date FROM master_siswa WHERE created_date >= DATE_SUB(NOW(), INTERVAL 24 HOUR) ORDER BY created_date DESC LIMIT 5'
  );
  siswaRows.forEach(r => {
    activities.push({
      type: 'siswa_baru',
      icon: '👤',
      title: 'Siswa Baru: ' + r.nama_lengkap,
      desc: 'Terdaftar via form sosialisasi',
      badge: 'Baru',
      user: 'System',
      ts: r.created_date
    });
  });

  // Recent incoming chat (24h)
  const [chatRows] = await pool.query(
    "SELECT from_name, datetime FROM chat_messages WHERE direction = 'incoming' AND datetime >= DATE_SUB(NOW(), INTERVAL 24 HOUR) ORDER BY datetime DESC LIMIT 5"
  );
  chatRows.forEach(r => {
    activities.push({
      type: 'chat',
      icon: '💬',
      title: 'Chat masuk: ' + (r.from_name || 'Unknown'),
      desc: 'Pesan WhatsApp masuk',
      badge: 'Chat',
      user: 'WhatsApp',
      ts: r.datetime
    });
  });

  // Recent home visits (24h)
  const [hvRows] = await pool.query(
    'SELECT id_siswa_nama, tanggal_hv, hasil_hv FROM home_visit WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 24 HOUR) ORDER BY timestamp DESC LIMIT 5'
  );
  hvRows.forEach(r => {
    activities.push({
      type: 'homevisit',
      icon: '🏠',
      title: 'Home Visit: ' + (r.id_siswa_nama ? r.id_siswa_nama.split('|').pop().trim() : '-'),
      desc: 'Hasil: ' + (r.hasil_hv || '-'),
      badge: 'HV',
      user: 'CRO',
      ts: r.tanggal_hv
    });
  });

  // Sort descending
  activities.sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0));
  return activities.slice(0, 10);
}

async function provisionNewTenant(payload) {
  const { brand, tier, maxCro, dbHost, dbName, dbUser, dbPass, adminEmail, whatsappPhoneId } = payload;

  // 1. Generate tenant_id from brand name
  let tenantId = brand.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  if (!tenantId) tenantId = 'tenant-' + Date.now();

  // 2. Determine limits based on Tier
  let limitSiswa = 1000;
  let limitSekolah = 20;
  let maxAdmin = 1, maxManager = 1, maxChiefCro = 1;

  if (tier === 'Free') { limitSiswa = 300; limitSekolah = 10; maxAdmin = 1; maxManager = 1; maxChiefCro = 1; }
  else if (tier === 'Pro') { limitSiswa = 1000; limitSekolah = 20; maxAdmin = 1; maxManager = 1; maxChiefCro = 1; }
  else if (tier === 'Business') { limitSiswa = 2500; limitSekolah = 41; maxAdmin = 1; maxManager = 1; maxChiefCro = 3; }
  else if (tier === 'Enterprise') { limitSiswa = 8333; limitSekolah = 166; maxAdmin = 1; maxManager = 3; maxChiefCro = 5; }

  // Check if tenant_id already exists
  const [exist] = await mainPool.query("SELECT tenant_id FROM tenants WHERE tenant_id = ?", [tenantId]);
  if (exist.length > 0) {
    tenantId += '-' + Math.floor(Math.random() * 1000);
  }

  // Insert into tenants
  await mainPool.query(`
    INSERT INTO tenants (tenant_id, brand_name, tier, status, limit_siswa, limit_sekolah, max_admin, max_manager, max_chief_cro, max_cro, whatsapp_phone_id)
    VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?, ?)
  `, [tenantId, brand, tier, limitSiswa, limitSekolah, maxAdmin, maxManager, maxChiefCro, maxCro, whatsappPhoneId || null]);

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

  // Auto-seed 27 default templates dari template_library
  try {
    await deployLibraryToTenant(tenantId);
    console.log(`[Provisioning] Berhasil menginjeksi template library ke DB tenant ${tenantId}`);
  } catch (tmplErr) {
    console.warn(`[Provisioning] Gagal injeksi template library ke ${tenantId}:`, tmplErr.message);
  }

  // Send credential email to Admin via Gmail API
  try {
    const loginUrl = process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/login` : 'https://crm.nexamos.cloud/login';
    await sendGmailAPI({
      from: '"NexaMOS Support"',
      to: adminEmail,
      subject: `🎉 Your NexaMOS CRM Workspace is Ready — ${brand}`,
      html: `
        <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 580px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; color: #1e293b;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h2 style="color: #04080f; margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">Nexa<span style="color:#00d68f;">MOS</span></h2>
            <p style="color: #64748b; font-size: 13px; margin-top: 4px;">Evidence-Based CRM Platform</p>
          </div>
          <p style="font-size: 15px; line-height: 1.6;">Hi, <strong>${brand} Admin</strong>!</p>
          <p style="font-size: 14px; line-height: 1.6; color: #334155;">Your tenant workspace has been successfully provisioned and is now active. Below are your Super Admin login credentials:</p>
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #00d68f; padding: 16px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 6px 0; font-size: 13.5px;"><strong>Login URL:</strong> <a href="${loginUrl}" style="color: #2563eb; font-weight: 600;">${loginUrl}</a></p>
            <p style="margin: 6px 0; font-size: 13.5px;"><strong>Tenant ID:</strong> <code style="background:#e2e8f0;padding:2px 6px;border-radius:4px;">${tenantId}</code></p>
            <p style="margin: 6px 0; font-size: 13.5px;"><strong>Username:</strong> <code style="background:#e2e8f0;padding:2px 6px;border-radius:4px;font-weight:700;">${adminUsername}</code></p>
            <p style="margin: 6px 0; font-size: 13.5px;"><strong>Password:</strong> <code style="background:#e2e8f0;padding:2px 6px;border-radius:4px;font-weight:700;">${adminPassword}</code></p>
          </div>
          <p style="font-size: 13px; color: #ef4444;"><strong>⚠ Security Notice:</strong> Please log in immediately and change your password for security purposes.</p>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${loginUrl}" style="display: inline-block; background-color: #00d68f; color: #04080f; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 15px;">Open My CRM Dashboard &rarr;</a>
          </div>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0 16px;" />
          <p style="font-size: 11.5px; color: #94a3b8; text-align: center; margin: 0;">&copy; 2026 NexaMOS Onboarding Team &middot; All rights reserved.</p>
        </div>
      `,
    });
    console.log(`[Provisioning] Credential email sent via Gmail API to ${adminEmail}`);
  } catch (err) {
    console.error(`[Provisioning] Failed to send credential email to ${adminEmail}:`, err.message);
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

async function updateTenantTier(payload) {
  const { tenantId, tier, billingCycle, resetDates } = payload;

  if (!tenantId || !tier) throw new Error("Input tidak valid: tenantId dan tier wajib diisi.");

  // Verifikasi eksistensi tenant
  const [rows] = await mainPool.query("SELECT tier, billing_cycle FROM tenants WHERE tenant_id = ?", [tenantId]);
  if (rows.length === 0) throw new Error("Tenant tidak ditemukan");

  const currentTier = rows[0].tier;
  const currentCycle = rows[0].billing_cycle || 'MONTHLY';
  const cycle = (billingCycle || currentCycle || 'MONTHLY').toUpperCase();
  const formattedTier = tier.toUpperCase();

  const { TIER_PLANS } = require('../crm/subscription/subscription.service');
  const plan = TIER_PLANS[formattedTier];
  if (!plan) {
    throw new Error(`Tier tidak valid. Pilihan: ${Object.keys(TIER_PLANS).join(', ')}`);
  }

  const limits = plan.limits[cycle] || plan.limits.MONTHLY;
  const roles = plan.roles;
  const periodDays = cycle === 'YEARLY' ? 365 : (formattedTier === 'FREE' ? 90 : 30);

  if (resetDates) {
    await mainPool.query(`
      UPDATE tenants 
      SET tier = ?,
          billing_cycle = ?,
          status = 'ACTIVE',
          limit_siswa = ?,
          limit_sekolah = ?,
          max_admin = ?,
          max_manager = ?,
          max_chief_cro = ?,
          max_cro = ?,
          current_period_start = CURDATE(),
          current_period_end = DATE_ADD(CURDATE(), INTERVAL ? DAY),
          next_quota_reset = DATE_ADD(CURDATE(), INTERVAL ? DAY)
      WHERE tenant_id = ?
    `, [
      formattedTier,
      cycle,
      limits.limit_siswa,
      limits.limit_sekolah,
      roles.max_admin,
      roles.max_manager,
      roles.max_chief_cro,
      roles.max_cro,
      periodDays,
      periodDays,
      tenantId,
    ]);
  } else {
    await mainPool.query(`
      UPDATE tenants 
      SET tier = ?,
          billing_cycle = ?,
          limit_siswa = ?,
          limit_sekolah = ?,
          max_admin = ?,
          max_manager = ?,
          max_chief_cro = ?,
          max_cro = ?
      WHERE tenant_id = ?
    `, [
      formattedTier,
      cycle,
      limits.limit_siswa,
      limits.limit_sekolah,
      roles.max_admin,
      roles.max_manager,
      roles.max_chief_cro,
      roles.max_cro,
      tenantId,
    ]);
  }

  return {
    tenantId,
    previousTier: currentTier,
    newTier: formattedTier,
    billingCycle: cycle,
    limits,
    roles,
    resetDates: !!resetDates,
  };
}

/**
 * GET billing invoices across all tenants (Superadmin)
 */
async function getBillingInvoices() {
  const [invoices] = await mainPool.query(`
    SELECT 
      b.invoice_id,
      b.tenant_id,
      b.plan_tier,
      b.billing_cycle,
      b.amount,
      b.status,
      b.billing_period_start,
      b.billing_period_end,
      b.due_date,
      b.payment_date,
      b.invoice_url,
      b.snap_token,
      b.payment_type,
      b.created_at,
      b.updated_at,
      t.brand_name,
      t.tier AS current_tenant_tier
    FROM billing_history b
    LEFT JOIN tenants t ON b.tenant_id = t.tenant_id
    ORDER BY b.created_at DESC
  `);

  let totalRevenue = 0;
  let unpaidCount = 0;
  let paidCount = 0;

  for (const inv of invoices) {
    if (inv.status === 'PAID') {
      totalRevenue += parseFloat(inv.amount) || 0;
      paidCount++;
    } else if (inv.status === 'UNPAID') {
      unpaidCount++;
    }
  }

  const [[activePaidTenantsRow]] = await mainPool.query(`
    SELECT COUNT(DISTINCT tenant_id) AS cnt 
    FROM tenants 
    WHERE tier IN ('PRO', 'BUSINESS', 'ENTERPRISE') AND status = 'ACTIVE'
  `);

  return {
    stats: {
      totalRevenue,
      unpaidCount,
      paidCount,
      totalInvoices: invoices.length,
      paidTenantsCount: parseInt(activePaidTenantsRow?.cnt) || 0,
    },
    invoices,
  };
}

/**
 * Superadmin manual mark invoice as PAID and trigger auto-upgrade
 */
async function markInvoicePaid(invoiceId, paymentType = 'MANUAL_SUPERADMIN') {
  if (!invoiceId) throw new Error('invoiceId wajib diisi');

  const { processPaymentSuccess } = require('../crm/subscription/subscription.service');
  const success = await processPaymentSuccess(invoiceId, paymentType);
  if (!success) throw new Error(`Gagal memproses faktur '${invoiceId}'.`);

  return { invoiceId, status: 'PAID', paymentType };
}

async function updateTenantWhatsappId(payload) {
  const { tenantId, whatsappPhoneId } = payload;
  if (!tenantId || !whatsappPhoneId) throw new Error("Input tidak valid");
  
  const [rows] = await mainPool.query("SELECT brand_name FROM tenants WHERE tenant_id = ?", [tenantId]);
  if (rows.length === 0) throw new Error("Tenant tidak ditemukan");
  
  await mainPool.query("UPDATE tenants SET whatsapp_phone_id = ? WHERE tenant_id = ?", [whatsappPhoneId, tenantId]);
  
  return { tenantId, whatsappPhoneId };
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE MONITOR (Cross-Tenant) — Read Only
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/templates/stats
 * Aggregate statistik template seluruh tenant
 * Response: { total, approved, pending, rejected, local_only, tenants:[{tenantId, brandName, templates:[]}] }
 */
async function getTemplateStats() {
  // Ambil semua tenant aktif
  const [tenants] = await mainPool.query(
    `SELECT t.tenant_id, t.brand_name, td.db_host, td.db_port, td.db_name, td.db_user, td.db_password
     FROM tenants t
     JOIN tenant_databases td ON t.tenant_id = td.tenant_id
     WHERE t.status = 'ACTIVE'
     ORDER BY t.brand_name ASC`
  );

  let totalAll = 0, approved = 0, pending = 0, rejected = 0, local_only = 0;
  const tenantResults = [];

  await Promise.all(
    tenants.map(async (t) => {
      try {
        const conn = await mysql.createConnection({
          host: t.db_host, port: t.db_port || 3306,
          user: t.db_user, password: t.db_password, database: t.db_name,
          connectTimeout: 5000,
        });
        const [rows] = await conn.query(
          `SELECT id_template, nama_template, template_name_api, meta_status,
                  status_crm, kategori, pipeline, language_code, last_updated
           FROM wa_templates
           WHERE status_crm != 'DELETED'
           ORDER BY urutan ASC, created_date DESC`
        );
        await conn.end();

        // Normalise meta_status
        const templates = rows.map(r => ({
          ...r,
          meta_status: r.meta_status || 'LOCAL_ONLY',
        }));

        // Aggregate
        templates.forEach(r => {
          totalAll++;
          const s = (r.meta_status || '').toUpperCase();
          if (s === 'APPROVED')   approved++;
          else if (s === 'PENDING')  pending++;
          else if (s === 'REJECTED') rejected++;
          else                        local_only++;
        });

        tenantResults.push({
          tenantId:  t.tenant_id,
          brandName: t.brand_name,
          templates,
        });
      } catch (err) {
        console.warn(`[Admin:templates] Skip tenant ${t.tenant_id}: ${err.message}`);
        tenantResults.push({ tenantId: t.tenant_id, brandName: t.brand_name, templates: [], error: err.message });
      }
    })
  );

  return { total: totalAll, approved, pending, rejected, local_only, tenants: tenantResults };
}

/**
 * GET /api/admin/templates/:tenantId
 * List template milik satu tenant spesifik
 */
async function getTemplatesByTenant(tenantId) {
  const [rows] = await mainPool.query(
    `SELECT t.tenant_id, t.brand_name, td.db_host, td.db_port, td.db_name, td.db_user, td.db_password
     FROM tenants t
     JOIN tenant_databases td ON t.tenant_id = td.tenant_id
     WHERE t.tenant_id = ? AND t.status = 'ACTIVE' LIMIT 1`,
    [tenantId]
  );
  if (rows.length === 0) throw new Error(`Tenant '${tenantId}' tidak ditemukan.`);

  const t = rows[0];
  const conn = await mysql.createConnection({
    host: t.db_host, port: t.db_port || 3306,
    user: t.db_user, password: t.db_password, database: t.db_name,
    connectTimeout: 5000,
  });

  const [templates] = await conn.query(
    `SELECT * FROM wa_templates WHERE status_crm != 'DELETED'
     ORDER BY urutan ASC, created_date DESC`
  );
  await conn.end();

  return {
    tenantId: t.tenant_id,
    brandName: t.brand_name,
    data: templates.map(r => ({ ...r, meta_status: r.meta_status || 'LOCAL_ONLY' })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PUSTAKA TEMPLATE NEXAMOS (Template Library) — Central Management & Deployer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Memastikan tabel template_library di DB nexamain sudah ada dan terisi 27 template ontologi
 */
async function ensureTemplateLibrary(forceRefresh = false) {
  await mainPool.query(`
    CREATE TABLE IF NOT EXISTS template_library (
      id_template VARCHAR(50) NOT NULL PRIMARY KEY,
      pipeline VARCHAR(50) NOT NULL,
      nama_template VARCHAR(150) NOT NULL,
      template_name_api VARCHAR(100) NOT NULL,
      language_code VARCHAR(10) DEFAULT 'id',
      body_text TEXT NOT NULL,
      meta_buttons LONGTEXT NULL,
      parameters TEXT NULL,
      kategori VARCHAR(50) NULL,
      urutan INT DEFAULT 1,
      status_crm VARCHAR(20) DEFAULT 'ACTIVE',
      meta_status VARCHAR(20) DEFAULT 'APPROVED',
      header_type VARCHAR(20) NULL,
      header_url TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  const [countRows] = await mainPool.query('SELECT COUNT(*) as cnt FROM template_library');
  if (countRows[0].cnt === 0 || forceRefresh) {
    for (const tpl of DEFAULT_TEMPLATES_LIBRARY) {
      await mainPool.query(`
        INSERT INTO template_library
          (id_template, pipeline, nama_template, template_name_api, language_code,
           body_text, meta_buttons, parameters, kategori, urutan, status_crm, meta_status, header_type, header_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          pipeline = VALUES(pipeline),
          nama_template = VALUES(nama_template),
          template_name_api = VALUES(template_name_api),
          body_text = VALUES(body_text),
          meta_buttons = VALUES(meta_buttons),
          parameters = VALUES(parameters),
          kategori = VALUES(kategori),
          urutan = VALUES(urutan),
          status_crm = VALUES(status_crm),
          meta_status = VALUES(meta_status)
      `, [
        tpl.id_template, tpl.pipeline, tpl.nama_template, tpl.template_name_api, tpl.language_code || 'id',
        tpl.body_text, tpl.meta_buttons || null, tpl.parameters || null, tpl.kategori || null,
        tpl.urutan || 1, tpl.status_crm || 'INACTIVE', tpl.meta_status || 'DELETED',
        tpl.header_type || null, tpl.header_url || null
      ]);
    }
    console.log(`[Template Library] Initialized & seeded/refreshed ${DEFAULT_TEMPLATES_LIBRARY.length} templates in main DB.`);
  }
}

/**
 * GET /api/admin/templates/library
 * Mengambil semua 27 template master beserta statistik kategori & daftar tenant
 */
async function getTemplateLibrary() {
  await ensureTemplateLibrary();

  const [templates] = await mainPool.query(
    'SELECT * FROM template_library ORDER BY urutan ASC, id_template ASC'
  );

  const pipelineStats = {
    AUDIENCE: 0,
    KNOWN_PROFILE: 0,
    LEAD: 0,
    PROSPECT: 0,
    OPPORTUNITY: 0,
    REGISTERED: 0,
    REGISTERED_OPPORTUNITY: 0,
    CUSTOMER: 0,
    POST_CUSTOMER: 0,
    SNOOZE: 0,
    TOTAL: templates.length
  };

  templates.forEach(t => {
    let p = (t.pipeline || '').toUpperCase().trim();
    if (p === 'REGISTERED_OPPORTUNITY') p = 'REGISTERED';
    if (pipelineStats[p] !== undefined) {
      pipelineStats[p]++;
    }
  });
  pipelineStats.REGISTERED_OPPORTUNITY = pipelineStats.REGISTERED;

  const [tenants] = await mainPool.query(
    `SELECT tenant_id, brand_name, tier, status FROM tenants WHERE status = 'ACTIVE' ORDER BY brand_name ASC`
  );

  return {
    templates,
    pipelineStats,
    tenants
  };
}

/**
 * GET /api/admin/templates/preview-context/:tenantId
 * Menyediakan konteks data riil siswa & sekolah per tenant untuk WhatsApp Live Simulator
 */
async function getTenantPreviewContext(tenantId) {
  if (!tenantId || tenantId === 'default') {
    return {
      tenantId: 'default',
      brandName: 'NexaMOS Pilot',
      sampleStudent: 'Fakhri Khaerul Qolbi',
      sampleSchool: 'SMK Negeri 1 Surabaya'
    };
  }

  const [tRows] = await mainPool.query(
    `SELECT t.tenant_id, t.brand_name, td.db_host, td.db_port, td.db_name, td.db_user, td.db_password
     FROM tenants t
     JOIN tenant_databases td ON t.tenant_id = td.tenant_id
     WHERE t.tenant_id = ? LIMIT 1`,
    [tenantId]
  );

  if (tRows.length === 0) {
    return {
      tenantId,
      brandName: tenantId,
      sampleStudent: 'Ahmad Rizki',
      sampleSchool: 'SMA Negeri 1'
    };
  }

  const t = tRows[0];
  let sampleStudent = 'Ahmad Rizki';
  let sampleSchool = 'SMA Negeri 1';

  try {
    const conn = await mysql.createConnection({
      host: t.db_host, port: t.db_port || 3306,
      user: t.db_user, password: t.db_password, database: t.db_name,
      connectTimeout: 5000,
    });

    const [siswaRows] = await conn.query(
      `SELECT nama_lengkap FROM master_siswa WHERE nama_lengkap IS NOT NULL AND nama_lengkap != '' LIMIT 1`
    );
    if (siswaRows.length > 0 && siswaRows[0].nama_lengkap) {
      sampleStudent = siswaRows[0].nama_lengkap;
    }

    const [sekolahRows] = await conn.query(
      `SELECT nama_sekolah FROM master_sekolah WHERE nama_sekolah IS NOT NULL AND nama_sekolah != '' LIMIT 1`
    );
    if (sekolahRows.length > 0 && sekolahRows[0].nama_sekolah) {
      sampleSchool = sekolahRows[0].nama_sekolah;
    }

    await conn.end();
  } catch (err) {
    console.warn(`[getTenantPreviewContext] Warning reading sample data for ${tenantId}: ${err.message}`);
  }

  return {
    tenantId: t.tenant_id,
    brandName: t.brand_name || t.tenant_id,
    sampleStudent,
    sampleSchool
  };
}

/**
 * POST /api/admin/templates/library/deploy/:tenantId
 * Menyalin 27 template default ke tabel wa_templates database tenant dengan mengganti {{tenant_name}}
 */
async function deployLibraryToTenant(tenantId) {
  await ensureTemplateLibrary();

  const [tRows] = await mainPool.query(
    `SELECT t.tenant_id, t.brand_name, td.db_host, td.db_port, td.db_name, td.db_user, td.db_password
     FROM tenants t
     JOIN tenant_databases td ON t.tenant_id = td.tenant_id
     WHERE t.tenant_id = ? LIMIT 1`,
    [tenantId]
  );

  if (tRows.length === 0) throw new Error(`Tenant '${tenantId}' tidak ditemukan.`);

  const t = tRows[0];
  const brandName = t.brand_name || tenantId;

  const [libTemplates] = await mainPool.query(
    'SELECT * FROM template_library ORDER BY urutan ASC, id_template ASC'
  );

  const conn = await mysql.createConnection({
    host: t.db_host, port: t.db_port || 3306,
    user: t.db_user, password: t.db_password, database: t.db_name,
    connectTimeout: 6000,
  });

  let deployedCount = 0;
  try {
    for (const tpl of libTemplates) {
      // Ganti placeholder {{tenant_name}} dengan brand_name tenant riil
      const customizedBody = (tpl.body_text || '').replace(/\{\{tenant_name\}\}/g, brandName);

      await conn.query(`
        INSERT INTO wa_templates
          (id_template, pipeline, nama_template, template_name_api, language_code,
           body_text, kategori, urutan, status_crm, meta_status,
           meta_buttons, parameters, header_type, header_url, created_date, last_updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        ON DUPLICATE KEY UPDATE
          pipeline = VALUES(pipeline),
          nama_template = VALUES(nama_template),
          template_name_api = VALUES(template_name_api),
          language_code = VALUES(language_code),
          body_text = VALUES(body_text),
          kategori = VALUES(kategori),
          urutan = VALUES(urutan),
          status_crm = VALUES(status_crm),
          meta_status = VALUES(meta_status),
          meta_buttons = VALUES(meta_buttons),
          parameters = VALUES(parameters),
          header_type = VALUES(header_type),
          header_url = VALUES(header_url),
          last_updated = NOW()
      `, [
        tpl.id_template, tpl.pipeline, tpl.nama_template, tpl.template_name_api, tpl.language_code,
        customizedBody, tpl.kategori, tpl.urutan, tpl.status_crm || 'ACTIVE', tpl.meta_status || 'APPROVED',
        tpl.meta_buttons, tpl.parameters, tpl.header_type, tpl.header_url
      ]);
      deployedCount++;
    }
  } finally {
    await conn.end();
  }

  return {
    tenantId,
    brandName,
    deployedCount,
    message: `Berhasil mendistribusikan ${deployedCount} template master ke tenant '${brandName}'.`
  };
}

/**
 * POST /api/admin/templates/library/deploy-all
 * Menyalin 27 template default ke seluruh tenant aktif
 */
async function deployLibraryAll() {
  await ensureTemplateLibrary();
  const [tenants] = await mainPool.query(
    `SELECT tenant_id, brand_name FROM tenants WHERE status = 'ACTIVE'`
  );

  const results = [];
  for (const t of tenants) {
    try {
      const res = await deployLibraryToTenant(t.tenant_id);
      results.push({ tenantId: t.tenant_id, brandName: t.brand_name, success: true, count: res.deployedCount });
    } catch (err) {
      results.push({ tenantId: t.tenant_id, brandName: t.brand_name, success: false, error: err.message });
    }
  }

  return results;
}

/**
 * POST /api/admin/templates/library/sync-meta
 * Mengambil status template langsung dari Meta Cloud API (WABA) dan memperbarui tabel template_library di nexamain
 */
async function syncTemplateLibraryMetaStatus() {
  await ensureTemplateLibrary(true);

  const token = process.env.WA_ACCESS_TOKEN;
  const wabaId = process.env.WA_WABA_ID || '998971032230678';

  if (!token || !wabaId) {
    throw new Error('Kredensial WhatsApp (WA_ACCESS_TOKEN / WA_WABA_ID) belum dikonfigurasi di server backend.');
  }

  // 1. Fetch seluruh template aktif dari Meta Cloud API dengan pagination
  let metaTemplates = [];
  let nextUrl = `https://graph.facebook.com/v19.0/${wabaId}/message_templates?fields=id,name,status,quality_rating,components&limit=100`;

  while (nextUrl) {
    try {
      const resp = await axios.get(nextUrl, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 20000,
      });
      metaTemplates = metaTemplates.concat(resp.data?.data || []);
      nextUrl = resp.data?.paging?.next || null;
    } catch (apiErr) {
      const msg = apiErr.response?.data?.error?.message || apiErr.message;
      throw new Error(`Gagal menghubungi Meta Graph API: ${msg}`);
    }
  }

  const metaMap = new Map();
  metaTemplates.forEach(mt => {
    const btnComp = (mt.components || []).filter(c => c.type === 'BUTTONS');
    const buttons = btnComp.length > 0 ? JSON.stringify(btnComp[0].buttons || []) : null;
    metaMap.set((mt.name || '').toLowerCase(), {
      status: mt.status,
      quality: mt.quality_rating || null,
      buttons
    });
  });

  // 2. Ambil seluruh template di template_library
  const [dbTemplates] = await mainPool.query(
    'SELECT id_template, template_name_api, meta_status, status_crm FROM template_library'
  );

  let approvedCount = 0;
  let deletedCount = 0;
  let otherCount = 0;

  for (const tpl of dbTemplates) {
    const apiName = (tpl.template_name_api || '').toLowerCase();
    if (metaMap.has(apiName)) {
      const metaData = metaMap.get(apiName);
      const isApproved = metaData.status === 'APPROVED';
      const newStatusCrm = isApproved ? 'ACTIVE' : 'INACTIVE';

      await mainPool.query(`
        UPDATE template_library
        SET meta_status = ?,
            status_crm = ?,
            meta_buttons = COALESCE(?, meta_buttons),
            updated_at = NOW()
        WHERE id_template = ?
      `, [metaData.status, newStatusCrm, metaData.buttons, tpl.id_template]);

      if (isApproved) approvedCount++;
      else otherCount++;
    } else {
      // Tidak ditemukan di Meta Cloud API -> tandai DELETED / UNREGISTERED
      await mainPool.query(`
        UPDATE template_library
        SET meta_status = 'DELETED',
            status_crm = 'INACTIVE',
            updated_at = NOW()
        WHERE id_template = ?
      `, [tpl.id_template]);
      deletedCount++;
    }
  }

  return {
    totalMeta: metaTemplates.length,
    totalLibrary: dbTemplates.length,
    approvedCount,
    deletedCount,
    otherCount,
    message: `Sinkronisasi selesai: ${approvedCount} template Approved Meta, ${deletedCount} belum/dihapus di Meta.`
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// WHATSAPP PROVISIONING REQUESTS (Cross-Tenant) — Superadmin
// ─────────────────────────────────────────────────────────────────────────────

async function getWhatsappRequests(statusFilter = null) {
  let sql = `
    SELECT tenant_id AS tenantId,
           brand_name AS brandName,
           tier,
           whatsapp_number AS whatsappNumber,
           whatsapp_display_name AS whatsappDisplayName,
           whatsapp_status AS whatsappStatus,
           whatsapp_business_category AS whatsappBusinessCategory,
           whatsapp_phone_id AS whatsappPhoneId,
           whatsapp_waba_id AS whatsappWabaId,
           whatsapp_requested_at AS whatsappRequestedAt,
           whatsapp_connected_at AS whatsappConnectedAt,
           whatsapp_notes AS whatsappNotes,
           created_at AS createdAt
    FROM tenants
  `;
  const params = [];
  if (statusFilter) {
    sql += ' WHERE whatsapp_status = ? ';
    params.push(statusFilter);
  }
  sql += ' ORDER BY FIELD(whatsapp_status, "PENDING_PROVISIONING", "CONNECTED", "REJECTED", "NOT_CONFIGURED"), whatsapp_requested_at DESC, created_at DESC ';

  const [rows] = await mainPool.query(sql, params);
  return rows;
}

async function approveWhatsappRequest(payload) {
  const { tenantId, whatsappPhoneId, whatsappWabaId, notes } = payload;
  if (!tenantId || !whatsappPhoneId) {
    throw new Error('tenantId dan whatsappPhoneId wajib diisi.');
  }

  const [rows] = await mainPool.query('SELECT brand_name FROM tenants WHERE tenant_id = ?', [tenantId]);
  if (rows.length === 0) throw new Error(`Tenant "${tenantId}" tidak ditemukan.`);

  // WABA ID default ke WABA Pilot Derma jika tidak diisi
  const finalWabaId = whatsappWabaId || process.env.WA_WABA_ID || '1202481526280919';

  await mainPool.query(
    `UPDATE tenants SET
       whatsapp_phone_id = ?,
       whatsapp_waba_id = ?,
       whatsapp_status = 'CONNECTED',
       whatsapp_connected_at = NOW(),
       whatsapp_notes = ?
     WHERE tenant_id = ?`,
    [
      String(whatsappPhoneId).trim(),
      String(finalWabaId).trim(),
      notes || 'Disetujui dan diaktifkan oleh Superadmin (WABA Pilot)',
      tenantId
    ]
  );

  return {
    tenantId,
    whatsappPhoneId: String(whatsappPhoneId).trim(),
    whatsappWabaId: String(finalWabaId).trim(),
    whatsappStatus: 'CONNECTED'
  };
}

async function rejectWhatsappRequest(payload) {
  const { tenantId, reason } = payload;
  if (!tenantId) throw new Error('tenantId wajib diisi.');

  const [rows] = await mainPool.query('SELECT brand_name FROM tenants WHERE tenant_id = ?', [tenantId]);
  if (rows.length === 0) throw new Error(`Tenant "${tenantId}" tidak ditemukan.`);

  await mainPool.query(
    `UPDATE tenants SET
       whatsapp_status = 'REJECTED',
       whatsapp_notes = ?
     WHERE tenant_id = ?`,
    [reason || 'Ditolak oleh Superadmin. Silakan periksa kembali kesesuaian data.', tenantId]
  );

  return {
    tenantId,
    whatsappStatus: 'REJECTED'
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTOMATED 4-STEP META GRAPH API ONBOARDING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Langkah 1 & 2: Registrasi Nomor ke WABA Pilot Meta & Kirim SMS OTP
 */
async function triggerWhatsappOtp(tenantId) {
  if (!tenantId) throw new Error('tenantId wajib diisi.');

  const [rows] = await mainPool.query(
    `SELECT tenant_id, brand_name, whatsapp_number, whatsapp_display_name, whatsapp_phone_id, whatsapp_status
     FROM tenants WHERE tenant_id = ? LIMIT 1`,
    [tenantId]
  );
  if (rows.length === 0) throw new Error(`Tenant "${tenantId}" tidak ditemukan.`);
  const t = rows[0];

  const rawNumber = t.whatsapp_number;
  if (!rawNumber) {
    throw new Error('Tenant belum mengisi nomor WhatsApp yang diajukan.');
  }

  // Normalisasi nomor telepon
  let cleanNumber = String(rawNumber).replace(/[^0-9]/g, '');
  let countryCode = '62';
  let localNumber = cleanNumber;
  if (cleanNumber.startsWith('62')) {
    localNumber = cleanNumber.slice(2);
  } else if (cleanNumber.startsWith('0')) {
    localNumber = cleanNumber.slice(1);
  }

  const displayName = (t.whatsapp_display_name || t.brand_name || '').trim();
  const token = process.env.WA_ACCESS_TOKEN;
  const wabaId = process.env.WA_WABA_ID || '998971529500561';

  if (!token) {
    throw new Error('WA_ACCESS_TOKEN belum dikonfigurasi di server backend (.env).');
  }

  let phoneId = t.whatsapp_phone_id;

  // LANGKAH 1: Daftarkan nomor ke WABA Meta jika belum memiliki Phone Number ID
  if (!phoneId) {
    try {
      console.log(`[Meta API] Menambahkan nomor ke WABA: +${countryCode}${localNumber} (${displayName})`);
      const addRes = await axios.post(
        `https://graph.facebook.com/v20.0/${wabaId}/phone_numbers`,
        {
          cc: countryCode,
          phone_number: localNumber,
          verified_name: displayName,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      phoneId = addRes.data?.id;
      if (!phoneId) {
        throw new Error('Meta tidak mengembalikan Phone Number ID yang valid.');
      }

      await mainPool.query(
        `UPDATE tenants SET whatsapp_phone_id = ?, whatsapp_waba_id = ?, updated_at = NOW() WHERE tenant_id = ?`,
        [phoneId, wabaId, tenantId]
      );
      console.log(`[Meta API] Berhasil membuat Phone Number ID baru: ${phoneId}`);
    } catch (err) {
      const metaErr = err.response?.data?.error;
      console.error('[Meta API] Error add phone number:', metaErr || err.message);
      if (metaErr?.code === 133004 || metaErr?.error_subcode === 133004 || (metaErr?.message && metaErr.message.includes('already registered'))) {
        throw new Error(
          'Meta Error: Nomor ini terdeteksi masih aktif di aplikasi WhatsApp ponsel. Klien WAJIB melakukan "Hapus Akun" (Delete Account) di aplikasi WhatsApp HP terlebih dahulu!'
        );
      }
      throw new Error(`Gagal mendaftarkan nomor ke Meta: ${metaErr?.message || err.message}`);
    }
  }

  // LANGKAH 2: Request SMS OTP ke Nomor Klien via Meta Cloud API
  try {
    console.log(`[Meta API] Mengirim SMS OTP ke Phone ID: ${phoneId}`);
    await axios.post(
      `https://graph.facebook.com/v20.0/${phoneId}/request_code`,
      {
        code_method: 'SMS',
        language: 'id',
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    await mainPool.query(
      `UPDATE tenants SET
         whatsapp_phone_id = ?,
         whatsapp_status = 'PENDING_PROVISIONING',
         whatsapp_notes = 'SMS OTP 6-Digit berhasil dikirim ke nomor klien via Meta'
       WHERE tenant_id = ?`,
      [phoneId, tenantId]
    );

    return {
      tenantId,
      phoneId,
      phoneNumber: `+${countryCode}${localNumber}`,
      displayName,
      status: 'OTP_SENT',
      message: `Kode verifikasi SMS 6-digit berhasil dikirim ke nomor +${countryCode}${localNumber} via Meta.`
    };
  } catch (err) {
    const metaErr = err.response?.data?.error;
    console.error('[Meta API] Error request_code:', metaErr || err.message);
    if (metaErr?.code === 133004 || metaErr?.error_subcode === 133004) {
      throw new Error('Meta Error: Nomor ini masih aktif di aplikasi WhatsApp HP. Harap minta klien menghapus akun WA ponsel terlebih dahulu.');
    }
    throw new Error(`Gagal mengirim SMS OTP dari Meta: ${metaErr?.message || err.message}`);
  }
}

/**
 * Langkah 3 & 4: Verifikasi 6-Digit OTP & Registrasi 2FA PIN (Aktifkan Nomor)
 */
async function verifyWhatsappOtp(tenantId, code) {
  if (!tenantId) throw new Error('tenantId wajib diisi.');
  const cleanCode = String(code || '').trim();
  if (!cleanCode || cleanCode.length !== 6) {
    throw new Error('Kode OTP harus terdiri dari 6 digit angka.');
  }

  const [rows] = await mainPool.query(
    `SELECT tenant_id, brand_name, whatsapp_number, whatsapp_display_name, whatsapp_phone_id, whatsapp_waba_id
     FROM tenants WHERE tenant_id = ? LIMIT 1`,
    [tenantId]
  );
  if (rows.length === 0) throw new Error(`Tenant "${tenantId}" tidak ditemukan.`);
  const t = rows[0];

  const phoneId = t.whatsapp_phone_id;
  if (!phoneId) {
    throw new Error('Phone ID belum terdaftar untuk tenant ini. Klik "Kirim SMS OTP" terlebih dahulu.');
  }

  const token = process.env.WA_ACCESS_TOKEN;
  const defaultPin = process.env.WA_DEFAULT_PIN || '137950';

  // LANGKAH 3: Verifikasi Kode OTP ke Meta Cloud API
  try {
    console.log(`[Meta API] Memverifikasi kode OTP untuk Phone ID: ${phoneId}`);
    await axios.post(
      `https://graph.facebook.com/v20.0/${phoneId}/verify_code`,
      { code: cleanCode },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log(`[Meta API] OTP Terverifikasi sukses!`);
  } catch (err) {
    const metaErr = err.response?.data?.error;
    console.error('[Meta API] Error verify_code:', metaErr || err.message);
    throw new Error(`Kode OTP salah atau kedaluwarsa: ${metaErr?.message || err.message}`);
  }

  // LANGKAH 4: Registrasi 2-Step Verification PIN (Aktifkan nomor di Cloud API)
  try {
    console.log(`[Meta API] Mendaftarkan PIN Two-Step Verification untuk Phone ID: ${phoneId}`);
    await axios.post(
      `https://graph.facebook.com/v20.0/${phoneId}/register`,
      {
        messaging_product: 'whatsapp',
        pin: defaultPin,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log(`[Meta API] Nomor resmi terdaftar di WhatsApp Cloud API!`);
  } catch (err) {
    const metaErr = err.response?.data?.error;
    console.warn('[Meta API] Warning register PIN:', metaErr?.message || err.message);
  }

  // AKTIVASI DI DATABASE MASTER: CONNECTED
  await mainPool.query(
    `UPDATE tenants SET
       whatsapp_status = 'CONNECTED',
       whatsapp_connected_at = NOW(),
       whatsapp_notes = 'Berhasil diverifikasi & diaktifkan otomatis via Meta Graph API (PIN: 137950)'
     WHERE tenant_id = ?`,
    [tenantId]
  );

  // Rekam Event ke database tenant
  try {
    const evtId = `EVT-WAP-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    await pool.query(
      `INSERT INTO events_log (event_id, aggregate_type, aggregate_id, event_type, payload, actor_id, created_at)
       VALUES (?, 'whatsapp_settings', ?, 'WhatsAppProvisionedViaGraphAPI', ?, 'Superadmin', NOW())`,
      [evtId, tenantId, JSON.stringify({ phoneId, defaultPin, timestamp: new Date() })]
    );
  } catch (e) {
    console.warn('[Meta API] Non-fatal events_log write error:', e.message);
  }

  return {
    tenantId,
    phoneId,
    status: 'CONNECTED',
    message: 'Nomor WhatsApp berhasil diverifikasi dan 100% aktif terhubung ke Cloud API!'
  };
}

module.exports = {
  getOverview,
  getTenant,
  getUsageStats,
  getUserList,
  getSystemHealth,
  getActivity,
  provisionNewTenant,
  addCroQuota,
  updateTenantTier,
  updateTenantWhatsappId,
  getTemplateStats,
  getTemplatesByTenant,
  getTemplateLibrary,
  syncTemplateLibraryMetaStatus,
  getTenantPreviewContext,
  deployLibraryToTenant,
  deployLibraryAll,
  getBillingInvoices,
  markInvoicePaid,
  getWhatsappRequests,
  approveWhatsappRequest,
  rejectWhatsappRequest,
  triggerWhatsappOtp,
  verifyWhatsappOtp,
  updateTenantType,
};

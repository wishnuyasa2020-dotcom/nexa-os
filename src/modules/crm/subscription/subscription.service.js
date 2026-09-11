'use strict';

const axios = require('axios');
const crypto = require('crypto');
const { mainPool, pool } = require('../../../config/database');

/**
 * Matriks Paket & Harga Nexa CRM SaaS (Pedoman Tier & Feature Classification)
 */
const TIER_PLANS = {
  PRO: {
    tier: 'PRO',
    name: 'Pro Tenant',
    description: 'Cocok untuk LPK berkembang dengan tim CRO aktif',
    badge: 'Paling Populer',
    pricing: {
      MONTHLY: {
        price: 500000,
        periodDays: 30,
        label: 'Rp 500.000 / bln',
        discount: null,
      },
      YEARLY: {
        price: 5000000,
        periodDays: 365,
        label: 'Rp 5.000.000 / thn',
        originalPrice: 6000000,
        discount: 'Hemat 2 Bulan (Rp 1 Juta)',
      },
    },
    limits: {
      MONTHLY: { limit_siswa: 1000, limit_sekolah: 20 },
      YEARLY:  { limit_siswa: 12000, limit_sekolah: 240 },
    },
    roles: {
      max_admin: 1,
      max_manager: 1,
      max_chief_cro: 1,
      max_cro: 2,
    },
    features: [
      'Batas Siswa: 1.000 / bln (12.000 / thn)',
      'Batas Sekolah: 20 / bln (240 / thn)',
      '1 Admin, 1 Manager, 1 Chief CRO, 2 CRO',
      'Integrasi WhatsApp Official Cloud API (BYOW)',
      'Smart Routing WhatsApp & Fallback Teks',
      'Auto-Nurturing & Snooze Campaign Bot',
      'Integrasi Google Calendar (Home Visit / Konseling)',
      'Support Prioritas & Panduan Setup',
    ],
  },
  BUSINESS: {
    tier: 'BUSINESS',
    name: 'Business Tenant',
    description: 'Untuk LPK mapan dengan volume siswa tinggi & tim CRO besar',
    badge: 'Terbaik untuk Skala',
    pricing: {
      MONTHLY: {
        price: 1500000,
        periodDays: 30,
        label: 'Rp 1.500.000 / bln',
        discount: null,
      },
      YEARLY: {
        price: 15000000,
        periodDays: 365,
        label: 'Rp 15.000.000 / thn',
        originalPrice: 18000000,
        discount: 'Hemat Rp 3 Juta',
      },
    },
    limits: {
      MONTHLY: { limit_siswa: 2500, limit_sekolah: 41 },
      YEARLY:  { limit_siswa: 30000, limit_sekolah: 500 },
    },
    roles: {
      max_admin: 1,
      max_manager: 1,
      max_chief_cro: 3,
      max_cro: 10,
    },
    features: [
      'Batas Siswa: 2.500 / bln (30.000 / thn)',
      'Batas Sekolah: 41 / bln (500 / thn)',
      '1 Admin, 1 Manager, 3 Chief CRO, 10 CRO',
      'Semua fitur Tier Pro',
      'Add-on Seat CRO tersedia',
      'Export & Import Data Excel Massal',
      'Funnel Velocity & Conversion Denominator Analytics',
      'Prioritas Antrean Broadcast WhatsApp',
    ],
  },
  ENTERPRISE: {
    tier: 'ENTERPRISE',
    name: 'Enterprise Tenant',
    description: 'Solusi tanpa batas untuk jaringan LPK multi-cabang nasional',
    badge: 'Enterprise',
    pricing: {
      MONTHLY: {
        price: 4000000,
        periodDays: 30,
        label: 'Rp 4.000.000 / bln',
        discount: null,
      },
      YEARLY: {
        price: 40000000,
        periodDays: 365,
        label: 'Rp 40.000.000 / thn',
        originalPrice: 48000000,
        discount: 'Hemat Rp 8 Juta',
      },
    },
    limits: {
      MONTHLY: { limit_siswa: 8333, limit_sekolah: 166 },
      YEARLY:  { limit_siswa: 100000, limit_sekolah: 2000 },
    },
    roles: {
      max_admin: 1,
      max_manager: 3,
      max_chief_cro: 5,
      max_cro: 30,
    },
    features: [
      'Batas Siswa: 8.333 / bln (100.000 / thn)',
      'Batas Sekolah: 166 / bln (2.000 / thn)',
      '1 Admin, 3 Manager, 5 Chief CRO, 30 CRO',
      'Semua fitur Tier Business',
      'Opsi White-Label (Brand Custom LPK)',
      'Dedicated Account Manager 24/7',
      'Jaminan Uptime SLA 99.9%',
      'Kustomisasi integrasi sistem internal',
    ],
  },
};

/**
 * Dapatkan konfigurasi Midtrans dari environment
 */
function getMidtransConfig() {
  const isProd = process.env.MIDTRANS_IS_PRODUCTION === 'true';
  const serverKey = process.env.MIDTRANS_SERVER_KEY || 'SB-Mid-server-YOUR_SERVER_KEY';
  const clientKey = process.env.MIDTRANS_CLIENT_KEY || 'SB-Mid-client-YOUR_CLIENT_KEY';

  return {
    isProd,
    serverKey,
    clientKey,
    snapUrl: isProd
      ? 'https://app.midtrans.com/snap/v1/transactions'
      : 'https://app.sandbox.midtrans.com/snap/v1/transactions',
    statusBaseUrl: isProd
      ? 'https://api.midtrans.com/v2'
      : 'https://api.sandbox.midtrans.com/v2',
  };
}

/**
 * Ambil daftar paket yang tersedia untuk ditampilkan di UI
 */
function getPlans() {
  return Object.values(TIER_PLANS);
}

/**
 * Ambil overview langganan tenant saat ini beserta histori faktur
 */
async function getBillingOverview(tenantId) {
  if (!tenantId) {
    throw new Error('Tenant ID wajib disertakan.');
  }

  // 1. Ambil detail tenant dari nexamain
  const [tenantRows] = await mainPool.query(
    `SELECT 
      tenant_id, brand_name, tier, status, billing_cycle,
      limit_siswa, used_siswa, limit_sekolah, used_sekolah,
      max_cro, max_admin, max_manager, max_chief_cro, addon_cro,
      current_period_start, current_period_end, next_quota_reset
     FROM tenants 
     WHERE tenant_id = ?`,
    [tenantId]
  );

  if (!tenantRows.length) {
    throw new Error(`Tenant '${tenantId}' tidak ditemukan di central database.`);
  }

  const tenant = tenantRows[0];

  // Hitung sisa hari aktif
  let daysRemaining = 0;
  if (tenant.current_period_end) {
    const end = new Date(tenant.current_period_end);
    const now = new Date();
    const diff = end.getTime() - now.getTime();
    daysRemaining = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  // Hitung jumlah user aktif dari DB tenant
  let usedUser = 0;
  try {
    const [uRows] = await pool.query("SELECT COUNT(*) as total FROM users WHERE LOWER(status) = 'aktif'");
    usedUser = uRows[0]?.total || 0;
  } catch (err) {
    console.warn('[BillingOverview] Gagal mengambil total user tenant:', err.message);
  }

  const limitUser = (tenant.max_admin || 1) + 
                    (tenant.max_manager || 1) + 
                    (tenant.max_chief_cro || 1) + 
                    (tenant.max_cro || 1) + 
                    (tenant.addon_cro || 0);

  // 2. Ambil riwayat faktur / invoice dari billing_history
  const [invoices] = await mainPool.query(
    `SELECT 
      invoice_id, amount, status, plan_tier, billing_cycle,
      billing_period_start, billing_period_end, due_date,
      payment_date, payment_type, invoice_url, created_at
     FROM billing_history 
     WHERE tenant_id = ? 
     ORDER BY created_at DESC 
     LIMIT 20`,
    [tenantId]
  );

  return {
    subscription: {
      tenantId: tenant.tenant_id,
      brandName: tenant.brand_name,
      tier: tenant.tier || 'FREE',
      status: tenant.status || 'ACTIVE',
      billingCycle: tenant.billing_cycle || 'MONTHLY',
      currentPeriodStart: tenant.current_period_start,
      currentPeriodEnd: tenant.current_period_end,
      nextQuotaReset: tenant.next_quota_reset,
      daysRemaining,
      limits: {
        siswa: { limit: tenant.limit_siswa, used: tenant.used_siswa },
        sekolah: { limit: tenant.limit_sekolah, used: tenant.used_sekolah },
        users: { limit: limitUser, used: usedUser },
      },
    },
    invoices,
    plans: getPlans(),
  };
}

/**
 * Buat transaksi Midtrans Snap untuk upgrade tier
 */
async function createSnapTransaction({ tenantId, targetTier, billingCycle, user }) {
  if (!tenantId) {
    throw new Error('Tenant ID tidak terdeteksi.');
  }

  const tierKey = (targetTier || '').toUpperCase();
  const cycleKey = (billingCycle || 'MONTHLY').toUpperCase();

  const plan = TIER_PLANS[tierKey];
  if (!plan) {
    throw new Error(`Paket '${targetTier}' tidak valid.`);
  }

  const pricing = plan.pricing[cycleKey];
  if (!pricing) {
    throw new Error(`Siklus tagihan '${billingCycle}' tidak valid.`);
  }

  const grossAmount = pricing.price;
  const periodDays = pricing.periodDays; // 30 hari untuk MONTHLY, 365 hari untuk YEARLY

  // Format Order ID: INV-{TENANT}-{TIER}-{TIMESTAMP}
  const cleanTenant = tenantId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const invoiceId = `INV-${cleanTenant}-${tierKey}-${Date.now()}`;

  const config = getMidtransConfig();

  // Payload Midtrans Snap
  const snapPayload = {
    transaction_details: {
      order_id: invoiceId,
      gross_amount: grossAmount,
    },
    customer_details: {
      first_name: user?.nama || tenantId,
      email: user?.email || `${cleanTenant.toLowerCase()}@nexa.id`,
      phone: user?.no_wa || '081234567890',
    },
    item_details: [
      {
        id: `TIER_${tierKey}_${cycleKey}`,
        price: grossAmount,
        quantity: 1,
        name: `Nexa CRM ${plan.name} (${cycleKey === 'YEARLY' ? 'Tahunan 365 Hari' : 'Bulanan 30 Hari'})`,
      },
    ],
  };

  let snapToken = null;
  let redirectUrl = null;

  try {
    const authHeader = 'Basic ' + Buffer.from(config.serverKey + ':').toString('base64');
    const midtransRes = await axios.post(config.snapUrl, snapPayload, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
      timeout: 15000,
    });

    snapToken = midtransRes.data.token;
    redirectUrl = midtransRes.data.redirect_url;
  } catch (err) {
    const errData = err.response?.data || err.message;
    console.error('[Midtrans Snap API Error]', errData);
    throw new Error(`Gagal membuat transaksi Midtrans: ${typeof errData === 'object' ? JSON.stringify(errData) : errData}`);
  }

  // Hitung estimasi periode awal & akhir (akan disahkan saat PAID)
  const now = new Date();
  const startDateStr = now.toISOString().split('T')[0];
  const endDate = new Date(now.getTime() + periodDays * 24 * 60 * 60 * 1000);
  const endDateStr = endDate.toISOString().split('T')[0];

  // Jatuh tempo bayar 24 jam ke depan
  const dueDate = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Simpan record UNPAID ke billing_history
  await mainPool.query(
    `INSERT INTO billing_history 
      (invoice_id, tenant_id, plan_tier, billing_cycle, amount, status, 
       billing_period_start, billing_period_end, due_date, invoice_url, snap_token) 
     VALUES (?, ?, ?, ?, ?, 'UNPAID', ?, ?, ?, ?, ?)`,
    [
      invoiceId,
      tenantId,
      tierKey,
      cycleKey,
      grossAmount,
      startDateStr,
      endDateStr,
      dueDate,
      redirectUrl,
      snapToken,
    ]
  );

  return {
    invoiceId,
    token: snapToken,
    redirectUrl,
    amount: grossAmount,
    tier: tierKey,
    billingCycle: cycleKey,
    periodDays,
    planName: plan.name,
  };
}

/**
 * Proses eksekusi upgrade saat pembayaran sukses terverifikasi
 */
async function processPaymentSuccess({ invoiceId, paymentType, midtransData }) {
  // 1. Ambil invoice dari billing_history
  const [invRows] = await mainPool.query(
    `SELECT * FROM billing_history WHERE invoice_id = ?`,
    [invoiceId]
  );

  if (!invRows.length) {
    console.error(`[ProcessPayment] Invoice '${invoiceId}' tidak ditemukan di billing_history.`);
    return false;
  }

  const inv = invRows[0];
  if (inv.status === 'PAID') {
    console.log(`[ProcessPayment] Invoice '${invoiceId}' sudah berstatus PAID sebelumnya.`);
    return true;
  }

  const tenantId = inv.tenant_id;
  const tierKey = (inv.plan_tier || 'PRO').toUpperCase();
  const cycleKey = (inv.billing_cycle || 'MONTHLY').toUpperCase();
  const plan = TIER_PLANS[tierKey] || TIER_PLANS.PRO;

  // Tentukan batas durasi locked: 30 hari untuk MONTHLY, 365 hari untuk YEARLY
  const periodDays = cycleKey === 'YEARLY' ? 365 : 30;

  // 2. Update status invoice di billing_history menjadi PAID
  await mainPool.query(
    `UPDATE billing_history 
     SET status = 'PAID', 
         payment_date = NOW(), 
         payment_type = ? 
     WHERE invoice_id = ?`,
    [paymentType || inv.payment_type || 'midtrans', invoiceId]
  );

  // 3. Ambil konfigurasi limits & roles baru dari plan
  const limits = plan.limits[cycleKey] || plan.limits.MONTHLY;
  const roles = plan.roles;

  // 4. Eksekusi Auto-Upgrade pada tabel tenants:
  // - used_siswa & used_sekolah TETAP DIPERTAHANKAN (tidak di-reset ke 0)
  // - limit_siswa & limit_sekolah diperbesar sesuai tier baru
  // - current_period_end & next_quota_reset dikunci tepat +30 hari (MONTHLY) atau +365 hari (YEARLY) sejak PAID
  await mainPool.query(
    `UPDATE tenants 
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
     WHERE tenant_id = ?`,
    [
      tierKey,
      cycleKey,
      limits.limit_siswa,
      limits.limit_sekolah,
      roles.max_admin,
      roles.max_manager,
      roles.max_chief_cro,
      roles.max_cro,
      periodDays,
      periodDays,
      tenantId,
    ]
  );

  console.log(`[AutoUpgrade Success] Tenant '${tenantId}' berhasil di-upgrade ke Tier ${tierKey} (${cycleKey} - ${periodDays} Hari).`);
  return true;
}

/**
 * Handle Webhook Notification dari Midtrans
 */
async function handleWebhookNotification(notification) {
  const {
    order_id,
    status_code,
    gross_amount,
    signature_key,
    transaction_status,
    fraud_status,
    payment_type,
  } = notification;

  if (!order_id || !signature_key) {
    throw new Error('Invalid notification payload: order_id atau signature_key kosong.');
  }

  const config = getMidtransConfig();

  // Verifikasi SHA512 Signature Key
  const rawSignature = `${order_id}${status_code}${gross_amount}${config.serverKey}`;
  const calculatedSignature = crypto.createHash('sha512').update(rawSignature).digest('hex');

  if (calculatedSignature !== signature_key) {
    console.error('[Midtrans Webhook] Signature verification failed!');
    throw new Error('Signature key tidak valid.');
  }

  console.log(`[Midtrans Webhook] Menerima event order: ${order_id} | Status: ${transaction_status} | Fraud: ${fraud_status}`);

  // Status sukses pembayaran:
  // - settlement (semua pembayaran non-kartu atau kartu yang sudah settle)
  // - capture dengan fraud_status accept (kartu kredit)
  const isPaid = (transaction_status === 'settlement') ||
                 (transaction_status === 'capture' && fraud_status === 'accept');

  if (isPaid) {
    await processPaymentSuccess({
      invoiceId: order_id,
      paymentType,
      midtransData: notification,
    });
    return { status: 'ok', message: 'Payment successfully processed and tenant upgraded.' };
  }

  // Status gagal / dibatalkan
  if (['cancel', 'expire', 'deny'].includes(transaction_status)) {
    await mainPool.query(
      `UPDATE billing_history SET status = 'CANCELLED' WHERE invoice_id = ?`,
      [order_id]
    );
    return { status: 'ok', message: `Transaction marked as CANCELLED (${transaction_status}).` };
  }

  return { status: 'ok', message: `Transaction status '${transaction_status}' recorded.` };
}

/**
 * Cek status transaksi langsung ke Midtrans API (Fallback jika webhook lokal terhambat)
 */
async function checkTransactionStatus(invoiceId, tenantId) {
  if (!invoiceId) {
    throw new Error('Invoice ID wajib disertakan.');
  }

  const config = getMidtransConfig();
  const authHeader = 'Basic ' + Buffer.from(config.serverKey + ':').toString('base64');

  try {
    const res = await axios.get(`${config.statusBaseUrl}/${invoiceId}/status`, {
      headers: {
        'Accept': 'application/json',
        'Authorization': authHeader,
      },
      timeout: 10000,
    });

    const data = res.data;
    const { transaction_status, fraud_status, payment_type } = data;

    const isPaid = (transaction_status === 'settlement') ||
                   (transaction_status === 'capture' && fraud_status === 'accept');

    if (isPaid) {
      await processPaymentSuccess({
        invoiceId,
        paymentType,
        midtransData: data,
      });
    } else if (['cancel', 'expire', 'deny'].includes(transaction_status)) {
      await mainPool.query(
        `UPDATE billing_history SET status = 'CANCELLED' WHERE invoice_id = ?`,
        [invoiceId]
      );
    }

    // Ambil update billing overview terkini
    const overview = tenantId ? await getBillingOverview(tenantId) : null;

    return {
      invoiceId,
      transactionStatus: transaction_status,
      isPaid,
      overview,
    };
  } catch (err) {
    const errData = err.response?.data || err.message;
    console.error('[CheckTransactionStatus Error]', errData);
    throw new Error(`Gagal memeriksa status ke Midtrans: ${typeof errData === 'object' ? JSON.stringify(errData) : errData}`);
  }
}

module.exports = {
  TIER_PLANS,
  getPlans,
  getBillingOverview,
  createSnapTransaction,
  processPaymentSuccess,
  handleWebhookNotification,
  checkTransactionStatus,
};

'use strict';

/**
 * billing.service.js
 * NexaMOS — Credit-Based Messaging Billing Service
 *
 * Mekanisme:
 *  - Setiap tenant wajib memiliki saldo kredit (tenant_credits) sebelum
 *    dapat mengirim template message berbayar ke Meta WA API.
 *  - Saldo dipotong SETELAH pesan berhasil dikirim (post-delivery).
 *  - Jika saldo tenant <= threshold (default Rp 350.000), outbound
 *    template message diblokir (is_blocked = 1).
 *  - Service message (SW Open / teks bebas) selalu GRATIS, tidak dipotong.
 *
 * Struktur Harga (per pesan terkirim, berlaku mulai Meta per-message pricing Juli 2025):
 *  - Marketing      : Rp 1.250
 *  - Utility        : Rp   600
 *  - Authentication : Rp   600
 *  - Service        : Rp     0 (GRATIS — Smart Routing SW Open)
 *
 * Top-Up (Fase Beta — Manual):
 *  - Top-up pertama  : Minimum Rp 500.000
 *  - Top-up berikut  : Minimum Rp 200.000
 *  - Tenant submit bukti transfer → Admin approve di superadmin panel
 */

const { pool } = require('../../config/database');

// ─────────────────────────────────────────────────────────────────────────────
// Harga per pesan (IDR) — bisa di-override via environment variable
// ─────────────────────────────────────────────────────────────────────────────
const MESSAGE_PRICES = {
  marketing:      parseInt(process.env.PRICE_MARKETING,      10) || 1250,
  utility:        parseInt(process.env.PRICE_UTILITY,        10) || 600,
  authentication: parseInt(process.env.PRICE_AUTHENTICATION, 10) || 600,
  service:        0,  // Selalu gratis — Smart Routing SW Open
};

const DEFAULT_THRESHOLD = parseFloat(process.env.BILLING_THRESHOLD) || 350000;
const MIN_TOPUP_FIRST   = 500000;
const MIN_TOPUP_NEXT    = 200000;

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Tentukan message_type dari tipe pesan yang dikirim
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Menentukan kategori billing dari konteks pengiriman.
 *
 * @param {object} ctx
 * @param {boolean} ctx.isSwOpen       - Apakah Service Window terbuka?
 * @param {boolean} ctx.sentAsTemplate - Apakah dikirim sebagai Meta Template?
 * @param {string}  ctx.templateCategory - Kategori template Meta (MARKETING/UTILITY/AUTHENTICATION)
 * @returns {'marketing'|'utility'|'authentication'|'service'}
 */
function resolveMessageType({ isSwOpen, sentAsTemplate, templateCategory }) {
  // SW Open: semua pesan gratis (service/interactive/text)
  if (isSwOpen && !sentAsTemplate) return 'service';

  // Template Meta → map kategori Meta ke billing category
  if (sentAsTemplate && templateCategory) {
    const cat = (templateCategory || '').toUpperCase();
    if (cat === 'MARKETING')       return 'marketing';
    if (cat === 'UTILITY')         return 'utility';
    if (cat === 'AUTHENTICATION')  return 'authentication';
  }

  // Default untuk template tanpa kategori eksplisit → marketing (lebih aman)
  if (sentAsTemplate) return 'marketing';

  // SW Open + template simulasi (freeTemplate via interactive) → service gratis
  return 'service';
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. checkBalance — Cek apakah tenant diizinkan kirim pesan
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @param {string} tenantId
 * @param {'marketing'|'utility'|'authentication'|'service'} messageType
 * @returns {Promise<{allowed: boolean, balance: number, threshold: number, reason?: string}>}
 */
async function checkBalance(tenantId, messageType) {
  // Service message selalu diizinkan (gratis)
  if (messageType === 'service' || MESSAGE_PRICES[messageType] === 0) {
    return { allowed: true, balance: null, threshold: null, free: true };
  }

  let rows;
  try {
    [rows] = await pool.query(
      'SELECT balance, threshold, is_blocked FROM tenant_credits WHERE tenant_id = ? LIMIT 1',
      [tenantId]
    );
  } catch (e) {
    // Jika tabel belum ada (tenant lama), izinkan dulu sambil log warning
    console.warn(`[Billing] tenant_credits not found for ${tenantId}:`, e.message);
    return { allowed: true, balance: null, threshold: null, warn: 'billing_table_missing' };
  }

  if (rows.length === 0) {
    // Tenant belum punya baris kredit → buat otomatis dengan saldo 0 (langsung blokir)
    await pool.query(
      'INSERT IGNORE INTO tenant_credits (tenant_id, balance, threshold, is_blocked) VALUES (?, 0.00, ?, 1)',
      [tenantId, DEFAULT_THRESHOLD]
    );
    return {
      allowed: false,
      balance: 0,
      threshold: DEFAULT_THRESHOLD,
      reason: 'CREDIT_NOT_INITIALIZED',
    };
  }

  const { balance, threshold, is_blocked } = rows[0];
  const bal = parseFloat(balance);
  const thr = parseFloat(threshold);

  if (is_blocked) {
    return { allowed: false, balance: bal, threshold: thr, reason: 'CREDIT_BLOCKED' };
  }

  if (bal <= thr) {
    // Saldo sudah di bawah/sama dengan threshold → update blokir
    await pool.query(
      'UPDATE tenant_credits SET is_blocked = 1 WHERE tenant_id = ?',
      [tenantId]
    );
    return { allowed: false, balance: bal, threshold: thr, reason: 'CREDIT_BELOW_THRESHOLD' };
  }

  return { allowed: true, balance: bal, threshold: thr };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. deductCredit — Potong saldo setelah pesan berhasil dikirim (post-delivery)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @param {string} tenantId
 * @param {'marketing'|'utility'|'authentication'|'service'} messageType
 * @param {string} waMessageId  - Message ID dari Meta API (untuk reconcile)
 * @param {string} phoneNumber  - Nomor tujuan
 * @returns {Promise<{success: boolean, newBalance: number, charged: number}>}
 */
async function deductCredit(tenantId, messageType, waMessageId, phoneNumber) {
  const price = MESSAGE_PRICES[messageType] || 0;

  // Pesan gratis tidak perlu dicatat deduction
  if (price === 0) {
    return { success: true, newBalance: null, charged: 0, free: true };
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Lock baris agar atomic
    const [[credit]] = await conn.query(
      'SELECT balance, threshold FROM tenant_credits WHERE tenant_id = ? LIMIT 1 FOR UPDATE',
      [tenantId]
    );

    if (!credit) {
      await conn.rollback();
      console.warn(`[Billing] Tidak ada baris kredit untuk tenant ${tenantId}. Deduction dilewati.`);
      return { success: false, newBalance: 0, charged: price, reason: 'NO_CREDIT_ROW' };
    }

    const balanceBefore = parseFloat(credit.balance);
    const balanceAfter  = Math.max(0, balanceBefore - price);
    const threshold     = parseFloat(credit.threshold);

    // Update saldo
    const shouldBlock = balanceAfter <= threshold ? 1 : 0;
    await conn.query(
      `UPDATE tenant_credits
         SET balance = ?, is_blocked = ?, updated_at = NOW()
       WHERE tenant_id = ?`,
      [balanceAfter, shouldBlock, tenantId]
    );

    // Catat ke credit_transactions
    await conn.query(
      `INSERT INTO credit_transactions
         (tenant_id, type, amount, balance_before, balance_after, message_type, wa_message_id, phone_number)
       VALUES (?, 'deduction', ?, ?, ?, ?, ?, ?)`,
      [tenantId, -price, balanceBefore, balanceAfter, messageType, waMessageId || null, phoneNumber || null]
    );

    await conn.commit();

    // Jika saldo baru <= threshold, kirim warning notifikasi (non-blocking)
    if (shouldBlock) {
      _sendLowBalanceAlert(tenantId, balanceAfter).catch(e =>
        console.warn('[Billing] Gagal kirim alert saldo rendah:', e.message)
      );
    }

    console.log(`[Billing][${tenantId}] Deduct Rp ${price} (${messageType}) | Saldo: Rp ${balanceBefore} → Rp ${balanceAfter}${shouldBlock ? ' ⚠️ BLOKIR' : ''}`);

    return { success: true, newBalance: balanceAfter, charged: price, blocked: !!shouldBlock };

  } catch (err) {
    await conn.rollback();
    console.error(`[Billing] Gagal deductCredit untuk ${tenantId}:`, err.message);
    return { success: false, newBalance: null, charged: price, error: err.message };
  } finally {
    conn.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. refundCredit — Kembalikan saldo jika diperlukan (adjustment manual)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @param {string} tenantId
 * @param {number} amount       - Jumlah yang dikembalikan (positif)
 * @param {string} waMessageId  - Referensi pesan yang di-refund
 * @param {string} reason       - Alasan refund
 * @returns {Promise<{success: boolean, newBalance: number}>}
 */
async function refundCredit(tenantId, amount, waMessageId, reason) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[credit]] = await conn.query(
      'SELECT balance, threshold FROM tenant_credits WHERE tenant_id = ? LIMIT 1 FOR UPDATE',
      [tenantId]
    );

    if (!credit) {
      await conn.rollback();
      return { success: false, newBalance: 0, reason: 'NO_CREDIT_ROW' };
    }

    const balanceBefore = parseFloat(credit.balance);
    const balanceAfter  = balanceBefore + parseFloat(amount);
    const threshold     = parseFloat(credit.threshold);
    const shouldUnblock = balanceAfter > threshold ? 0 : 1;

    await conn.query(
      `UPDATE tenant_credits
         SET balance = ?, is_blocked = ?, updated_at = NOW()
       WHERE tenant_id = ?`,
      [balanceAfter, shouldUnblock, tenantId]
    );

    await conn.query(
      `INSERT INTO credit_transactions
         (tenant_id, type, amount, balance_before, balance_after, wa_message_id, note)
       VALUES (?, 'refund', ?, ?, ?, ?, ?)`,
      [tenantId, amount, balanceBefore, balanceAfter, waMessageId || null, reason || null]
    );

    await conn.commit();
    return { success: true, newBalance: balanceAfter };

  } catch (err) {
    await conn.rollback();
    console.error(`[Billing] refundCredit error:`, err.message);
    return { success: false, newBalance: null, error: err.message };
  } finally {
    conn.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. topupCredit — Tambah saldo setelah admin approve top-up request
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @param {string} tenantId
 * @param {number} amount       - Jumlah top-up dalam IDR
 * @param {string} reference    - No. referensi transfer
 * @param {string} processedBy  - Username admin yang approve
 * @returns {Promise<{success: boolean, newBalance: number}>}
 */
async function topupCredit(tenantId, amount, reference, processedBy) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Pastikan baris tenant_credits ada
    await conn.query(
      'INSERT IGNORE INTO tenant_credits (tenant_id, balance, threshold, is_blocked) VALUES (?, 0.00, ?, 0)',
      [tenantId, DEFAULT_THRESHOLD]
    );

    const [[credit]] = await conn.query(
      'SELECT balance, threshold FROM tenant_credits WHERE tenant_id = ? LIMIT 1 FOR UPDATE',
      [tenantId]
    );

    const balanceBefore = parseFloat(credit.balance);
    const balanceAfter  = balanceBefore + parseFloat(amount);
    const threshold     = parseFloat(credit.threshold);
    const shouldUnblock = balanceAfter > threshold ? 0 : 1;

    await conn.query(
      `UPDATE tenant_credits
         SET balance = ?, is_blocked = ?, last_topup_at = NOW(), updated_at = NOW()
       WHERE tenant_id = ?`,
      [balanceAfter, shouldUnblock, tenantId]
    );

    await conn.query(
      `INSERT INTO credit_transactions
         (tenant_id, type, amount, balance_before, balance_after, reference, note)
       VALUES (?, 'topup', ?, ?, ?, ?, ?)`,
      [tenantId, amount, balanceBefore, balanceAfter, reference || null, `Approved by: ${processedBy || 'admin'}`]
    );

    await conn.commit();

    console.log(`[Billing][${tenantId}] Top-up Rp ${amount} | Saldo: Rp ${balanceBefore} → Rp ${balanceAfter} | by: ${processedBy}`);
    return { success: true, newBalance: balanceAfter, unblocked: !shouldUnblock };

  } catch (err) {
    await conn.rollback();
    console.error(`[Billing] topupCredit error:`, err.message);
    return { success: false, newBalance: null, error: err.message };
  } finally {
    conn.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. getBalance — Baca saldo tenant (untuk API endpoint)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @param {string} tenantId
 * @returns {Promise<{balance: number, threshold: number, is_blocked: boolean, last_topup_at: string}>}
 */
async function getBalance(tenantId) {
  const [rows] = await pool.query(
    'SELECT balance, threshold, is_blocked, last_topup_at FROM tenant_credits WHERE tenant_id = ? LIMIT 1',
    [tenantId]
  );
  if (rows.length === 0) return { balance: 0, threshold: DEFAULT_THRESHOLD, is_blocked: true, last_topup_at: null };
  return rows[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. submitTopupRequest — Tenant request top-up (beta: manual transfer)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @param {string} tenantId
 * @param {number} amount
 * @param {string} transferRef    - No. referensi transfer
 * @param {string} transferProof  - URL foto bukti transfer
 * @returns {Promise<{success: boolean, requestId: number}>}
 */
async function submitTopupRequest(tenantId, amount, transferRef, transferProof) {
  // Validasi minimum top-up
  const [existing] = await pool.query(
    'SELECT COUNT(*) AS cnt FROM credit_transactions WHERE tenant_id = ? AND type = "topup"',
    [tenantId]
  );
  const isFirstTopup = parseInt(existing[0].cnt, 10) === 0;
  const minAmount = isFirstTopup ? MIN_TOPUP_FIRST : MIN_TOPUP_NEXT;

  if (amount < minAmount) {
    const err = new Error(`Minimum top-up ${isFirstTopup ? 'pertama' : 'berikutnya'} adalah Rp ${minAmount.toLocaleString('id-ID')}`);
    err.code = 'TOPUP_BELOW_MINIMUM';
    throw err;
  }

  const [result] = await pool.query(
    `INSERT INTO credit_topup_requests (tenant_id, amount, transfer_ref, transfer_proof, status)
     VALUES (?, ?, ?, ?, 'pending')`,
    [tenantId, amount, transferRef || null, transferProof || null]
  );

  return { success: true, requestId: result.insertId };
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. approveTopupRequest — Admin approve/reject (dipanggil dari superadmin API)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @param {number} requestId
 * @param {'approved'|'rejected'} action
 * @param {string} processedBy
 * @param {string} note
 * @returns {Promise<{success: boolean, newBalance?: number}>}
 */
async function approveTopupRequest(requestId, action, processedBy, note) {
  const [[req]] = await pool.query(
    'SELECT * FROM credit_topup_requests WHERE id = ? AND status = "pending" LIMIT 1',
    [requestId]
  );

  if (!req) throw new Error('Request tidak ditemukan atau sudah diproses.');

  await pool.query(
    `UPDATE credit_topup_requests
       SET status = ?, processed_at = NOW(), processed_by = ?, note = ?
     WHERE id = ?`,
    [action, processedBy, note || null, requestId]
  );

  if (action === 'approved') {
    return await topupCredit(req.tenant_id, req.amount, req.transfer_ref, processedBy);
  }

  return { success: true, action: 'rejected' };
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. getTransactionHistory — Riwayat transaksi kredit per tenant
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @param {string} tenantId
 * @param {object} opts - { page, limit }
 */
async function getTransactionHistory(tenantId, { page = 1, limit = 30 } = {}) {
  const offset = (Math.max(1, page) - 1) * limit;
  const [rows] = await pool.query(
    `SELECT id, type, amount, balance_before, balance_after, message_type,
            wa_message_id, phone_number, reference, note, created_at
     FROM credit_transactions
     WHERE tenant_id = ?
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [tenantId, limit, offset]
  );
  const [[{ total }]] = await pool.query(
    'SELECT COUNT(*) AS total FROM credit_transactions WHERE tenant_id = ?',
    [tenantId]
  );
  return { data: rows, total: parseInt(total, 10), page, limit };
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL: Kirim alert saldo rendah ke admin tenant (via WA / log)
// ─────────────────────────────────────────────────────────────────────────────
async function _sendLowBalanceAlert(tenantId, currentBalance) {
  // Log ke console (minimal) — bisa di-extend kirim WA ke admin tenant nanti
  console.warn(
    `[Billing] ⚠️ SALDO RENDAH — Tenant: ${tenantId} | Saldo: Rp ${currentBalance.toLocaleString('id-ID')} | Outbound DIBLOKIR. Silakan top-up.`
  );
  // TODO: Kirim WA notifikasi ke nomor admin tenant (dari tabel tenant_settings / users)
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  MESSAGE_PRICES,
  resolveMessageType,
  checkBalance,
  deductCredit,
  refundCredit,
  topupCredit,
  getBalance,
  submitTopupRequest,
  approveTopupRequest,
  getTransactionHistory,
};

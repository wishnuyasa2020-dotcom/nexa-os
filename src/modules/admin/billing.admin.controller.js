'use strict';

/**
 * billing.admin.controller.js
 * Superadmin API — Manajemen Kredit Pesan per Tenant
 *
 * Endpoint (semua di bawah /api/admin/credits):
 *  GET  /credits                          — Daftar semua tenant + status kredit
 *  GET  /credits/:tenantId/transactions   — Riwayat transaksi tenant tertentu
 *  GET  /credits/topup-requests           — Semua pending top-up request
 *  POST /credits/topup-requests/:id/approve — Approve top-up request
 *  POST /credits/topup-requests/:id/reject  — Reject top-up request
 *  POST /credits/:tenantId/adjustment     — Manual adjustment saldo (add/subtract)
 */

const billingService = require('../billing/billing.service');

// ─────────────────────────────────────────────────────────────────────────────
// Helper: baca pool tenant berdasarkan tenantId dari mainPool → tenant_databases
// ─────────────────────────────────────────────────────────────────────────────
async function _getTenantPool(tenantId) {
  const { mainPool } = require('../../config/database');
  const mysql = require('mysql2/promise');

  const [rows] = await mainPool.query(
    'SELECT db_host, db_port, db_name, db_user, db_password FROM tenant_databases WHERE tenant_id = ? LIMIT 1',
    [tenantId]
  );
  if (!rows[0]) throw new Error(`Tenant database tidak ditemukan: ${tenantId}`);
  const cfg = rows[0];

  // Gunakan pool sementara (bukan cache, karena ini admin one-off query)
  const pool = mysql.createPool({
    host: cfg.db_host, port: cfg.db_port || 3306,
    user: cfg.db_user, password: cfg.db_password,
    database: cfg.db_name, connectionLimit: 2,
  });
  return pool;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/credits
// Daftar semua tenant aktif + status kredit masing-masing
// ─────────────────────────────────────────────────────────────────────────────
async function getAllTenantsCredit(req, res) {
  try {
    const { mainPool } = require('../../config/database');

    // Ambil semua tenant aktif
    const [tenants] = await mainPool.query(
      `SELECT t.tenant_id, t.brand_name, t.status,
              td.db_host, td.db_port, td.db_name, td.db_user, td.db_password
       FROM tenants t
       JOIN tenant_databases td ON t.tenant_id = td.tenant_id
       WHERE t.status = 'ACTIVE'
       ORDER BY t.brand_name`
    );

    const mysql = require('mysql2/promise');
    const results = [];

    for (const tenant of tenants) {
      let creditData = { balance: 0, threshold: 350000, is_blocked: true, last_topup_at: null, error: null };
      try {
        const pool = mysql.createPool({
          host: tenant.db_host, port: tenant.db_port || 3306,
          user: tenant.db_user, password: tenant.db_password,
          database: tenant.db_name, connectionLimit: 1,
        });
        const [rows] = await pool.query(
          'SELECT balance, threshold, is_blocked, last_topup_at FROM tenant_credits WHERE tenant_id = ? LIMIT 1',
          [tenant.tenant_id]
        );
        await pool.end();
        if (rows[0]) {
          creditData = {
            balance:      parseFloat(rows[0].balance),
            threshold:    parseFloat(rows[0].threshold),
            is_blocked:   Boolean(rows[0].is_blocked),
            last_topup_at: rows[0].last_topup_at,
          };
        } else {
          creditData.error = 'no_credit_row';
        }
      } catch (e) {
        creditData.error = e.message;
      }

      results.push({
        tenant_id:   tenant.tenant_id,
        brand_name:  tenant.brand_name,
        status_label: creditData.is_blocked ? 'BLOCKED' :
                      (creditData.balance <= creditData.threshold ? 'WARNING' : 'OK'),
        ...creditData,
      });
    }

    res.json({ status: 'ok', data: results });
  } catch (err) {
    console.error('[Admin/Credits] getAllTenantsCredit:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/credits/topup-requests
// Semua pending top-up request dari seluruh tenant (untuk approval panel)
// ─────────────────────────────────────────────────────────────────────────────
async function getAllTopupRequests(req, res) {
  try {
    const { mainPool } = require('../../config/database');
    const mysql = require('mysql2/promise');
    const statusFilter = req.query.status || 'pending'; // pending | approved | rejected | all

    // Ambil semua tenant aktif dan query request dari masing-masing DB
    const [tenants] = await mainPool.query(
      `SELECT t.tenant_id, t.brand_name,
              td.db_host, td.db_port, td.db_name, td.db_user, td.db_password
       FROM tenants t
       JOIN tenant_databases td ON t.tenant_id = td.tenant_id
       WHERE t.status = 'ACTIVE'`
    );

    const allRequests = [];
    for (const tenant of tenants) {
      try {
        const pool = mysql.createPool({
          host: tenant.db_host, port: tenant.db_port || 3306,
          user: tenant.db_user, password: tenant.db_password,
          database: tenant.db_name, connectionLimit: 1,
        });
        const whereStatus = statusFilter === 'all' ? '' : 'WHERE status = ?';
        const params = [tenant.tenant_id, ...(statusFilter !== 'all' ? [statusFilter] : [])];
        const [rows] = await pool.query(
          `SELECT id, tenant_id, amount, transfer_ref, transfer_proof,
                  status, requested_at, processed_at, processed_by, note
           FROM credit_topup_requests
           ${whereStatus ? 'WHERE status = ?' : ''}
           ORDER BY requested_at DESC
           LIMIT 100`,
          statusFilter !== 'all' ? [statusFilter] : []
        );
        await pool.end();
        rows.forEach(r => allRequests.push({ ...r, brand_name: tenant.brand_name, tenant_id: tenant.tenant_id }));
      } catch (e) {
        // Skip tenant jika DB error
      }
    }

    // Sort semua hasil by requested_at desc
    allRequests.sort((a, b) => new Date(b.requested_at) - new Date(a.requested_at));

    res.json({ status: 'ok', data: allRequests, total: allRequests.length });
  } catch (err) {
    console.error('[Admin/Credits] getAllTopupRequests:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/credits/topup-requests/:tenantId/:requestId/approve
// Approve top-up request — tambah saldo tenant
// Body: { note? }
// ─────────────────────────────────────────────────────────────────────────────
async function approveTopupRequest(req, res) {
  try {
    const { tenantId, requestId } = req.params;
    const { note } = req.body;
    const processedBy = req.adminUser || 'superadmin';

    // Inject pool tenant ke billingService via override sementara
    // Gunakan tenant pool langsung
    const pool = await _getTenantPool(tenantId);

    // Ambil request
    const [[reqRow]] = await pool.query(
      'SELECT * FROM credit_topup_requests WHERE id = ? AND tenant_id = ? AND status = "pending" LIMIT 1',
      [requestId, tenantId]
    );
    if (!reqRow) {
      await pool.end();
      return res.status(404).json({ status: 'error', message: 'Request tidak ditemukan atau sudah diproses.' });
    }

    // Update status request
    await pool.query(
      'UPDATE credit_topup_requests SET status = "approved", processed_at = NOW(), processed_by = ?, note = ? WHERE id = ?',
      [processedBy, note || null, requestId]
    );

    // Tambah saldo tenant (atomic)
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        'INSERT IGNORE INTO tenant_credits (tenant_id, balance, threshold, is_blocked) VALUES (?, 0.00, 350000.00, 0)',
        [tenantId]
      );
      const [[credit]] = await conn.query(
        'SELECT balance, threshold FROM tenant_credits WHERE tenant_id = ? FOR UPDATE',
        [tenantId]
      );
      const balBefore = parseFloat(credit.balance);
      const balAfter  = balBefore + parseFloat(reqRow.amount);
      const threshold = parseFloat(credit.threshold);
      const shouldUnblock = balAfter > threshold ? 0 : 1;

      await conn.query(
        'UPDATE tenant_credits SET balance = ?, is_blocked = ?, last_topup_at = NOW() WHERE tenant_id = ?',
        [balAfter, shouldUnblock, tenantId]
      );
      await conn.query(
        `INSERT INTO credit_transactions (tenant_id, type, amount, balance_before, balance_after, reference, note)
         VALUES (?, 'topup', ?, ?, ?, ?, ?)`,
        [tenantId, reqRow.amount, balBefore, balAfter, reqRow.transfer_ref || null, `Approved by: ${processedBy}`]
      );
      await conn.commit();

      console.log(`[Admin/Credits] ✅ Top-up approved: ${tenantId} +Rp ${reqRow.amount} | Saldo: ${balBefore} → ${balAfter}`);
      res.json({
        status: 'ok',
        message: `Top-up Rp ${parseFloat(reqRow.amount).toLocaleString('id-ID')} berhasil disetujui.`,
        data: { new_balance: balAfter, unblocked: !shouldUnblock },
      });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
      await pool.end();
    }
  } catch (err) {
    console.error('[Admin/Credits] approveTopupRequest:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/credits/topup-requests/:tenantId/:requestId/reject
// Reject top-up request
// Body: { note }
// ─────────────────────────────────────────────────────────────────────────────
async function rejectTopupRequest(req, res) {
  try {
    const { tenantId, requestId } = req.params;
    const { note } = req.body;
    const processedBy = req.adminUser || 'superadmin';

    const pool = await _getTenantPool(tenantId);
    const [result] = await pool.query(
      `UPDATE credit_topup_requests
         SET status = 'rejected', processed_at = NOW(), processed_by = ?, note = ?
       WHERE id = ? AND tenant_id = ? AND status = 'pending'`,
      [processedBy, note || 'Ditolak oleh admin.', requestId, tenantId]
    );
    await pool.end();

    if (result.affectedRows === 0) {
      return res.status(404).json({ status: 'error', message: 'Request tidak ditemukan atau sudah diproses.' });
    }

    res.json({ status: 'ok', message: 'Permintaan top-up ditolak.' });
  } catch (err) {
    console.error('[Admin/Credits] rejectTopupRequest:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/credits/:tenantId/adjustment
// Manual adjustment saldo tenant (tambah atau kurangi)
// Body: { amount, note } — amount positif = tambah, negatif = kurangi
// ─────────────────────────────────────────────────────────────────────────────
async function manualAdjustment(req, res) {
  try {
    const { tenantId } = req.params;
    const { amount, note } = req.body;
    const processedBy = req.adminUser || 'superadmin';

    if (!amount || isNaN(amount)) {
      return res.status(400).json({ status: 'error', message: 'Jumlah adjustment tidak valid.' });
    }

    const pool = await _getTenantPool(tenantId);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        'INSERT IGNORE INTO tenant_credits (tenant_id, balance, threshold, is_blocked) VALUES (?, 0.00, 350000.00, 0)',
        [tenantId]
      );
      const [[credit]] = await conn.query(
        'SELECT balance, threshold FROM tenant_credits WHERE tenant_id = ? FOR UPDATE', [tenantId]
      );
      const balBefore = parseFloat(credit.balance);
      const balAfter  = Math.max(0, balBefore + parseFloat(amount));
      const threshold = parseFloat(credit.threshold);
      const shouldBlock = balAfter <= threshold ? 1 : 0;

      await conn.query(
        'UPDATE tenant_credits SET balance = ?, is_blocked = ?, updated_at = NOW() WHERE tenant_id = ?',
        [balAfter, shouldBlock, tenantId]
      );
      await conn.query(
        `INSERT INTO credit_transactions (tenant_id, type, amount, balance_before, balance_after, note)
         VALUES (?, 'adjustment', ?, ?, ?, ?)`,
        [tenantId, parseFloat(amount), balBefore, balAfter, note ? `${note} (by: ${processedBy})` : `Manual adjustment by: ${processedBy}`]
      );
      await conn.commit();

      res.json({
        status: 'ok',
        message: `Adjustment berhasil. Saldo ${tenantId}: Rp ${balBefore} → Rp ${balAfter}`,
        data: { balance_before: balBefore, balance_after: balAfter, is_blocked: !!shouldBlock },
      });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
      await pool.end();
    }
  } catch (err) {
    console.error('[Admin/Credits] manualAdjustment:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/credits/:tenantId/transactions
// Riwayat transaksi kredit tenant tertentu
// ─────────────────────────────────────────────────────────────────────────────
async function getTenantTransactions(req, res) {
  try {
    const { tenantId } = req.params;
    const page  = Math.max(1, parseInt(req.query.page  || '1',  10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '30', 10)));

    const pool = await _getTenantPool(tenantId);
    const offset = (page - 1) * limit;
    const [rows] = await pool.query(
      `SELECT id, type, amount, balance_before, balance_after, message_type,
              wa_message_id, phone_number, reference, note, created_at
       FROM credit_transactions
       WHERE tenant_id = ?
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [tenantId, limit, offset]
    );
    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) AS total FROM credit_transactions WHERE tenant_id = ?', [tenantId]
    );
    await pool.end();
    res.json({ status: 'ok', data: rows, total: parseInt(total, 10), page, limit });
  } catch (err) {
    console.error('[Admin/Credits] getTenantTransactions:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

module.exports = {
  getAllTenantsCredit,
  getAllTopupRequests,
  approveTopupRequest,
  rejectTopupRequest,
  manualAdjustment,
  getTenantTransactions,
};

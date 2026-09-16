'use strict';

/**
 * billing.controller.js
 * HTTP handlers untuk Modul Kredit Pesan (Messaging Credit Billing)
 *
 * Endpoint (semua di bawah /api/v1/billing):
 *  GET  /balance              — Saldo kredit + status blokir tenant saat ini
 *  GET  /transactions         — Riwayat transaksi (deduction/topup/refund)
 *  POST /topup/request        — Tenant ajukan top-up manual (upload bukti)
 *  GET  /topup/requests       — List pengajuan top-up tenant sendiri
 *  GET  /prices               — Daftar harga per kategori pesan
 */

const billingService = require('./billing.service');
const { tenantStorage } = require('../../config/database');

// ─────────────────────────────────────────────────────────────────────────────
// Helper: ambil tenantId dari AsyncLocalStorage context
// ─────────────────────────────────────────────────────────────────────────────
function _getTenantId(req) {
  return (tenantStorage ? tenantStorage.getStore() : null) || req.user?.tenantId || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/billing/balance
// Saldo kredit + status blokir tenant saat ini
// ─────────────────────────────────────────────────────────────────────────────
async function getBalance(req, res) {
  try {
    const tenantId = _getTenantId(req);
    if (!tenantId) return res.status(400).json({ status: 'error', message: 'Tenant tidak teridentifikasi.' });

    const data = await billingService.getBalance(tenantId);
    res.json({
      status: 'ok',
      data: {
        balance:      parseFloat(data.balance),
        threshold:    parseFloat(data.threshold),
        is_blocked:   Boolean(data.is_blocked),
        last_topup_at: data.last_topup_at || null,
        // Pesan informatif untuk UI
        status_label: data.is_blocked ? 'BLOCKED' : (parseFloat(data.balance) <= parseFloat(data.threshold) ? 'WARNING' : 'OK'),
      },
    });
  } catch (err) {
    console.error('[Billing] getBalance:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/billing/transactions
// Riwayat transaksi kredit — deduction, topup, refund, adjustment
// ─────────────────────────────────────────────────────────────────────────────
async function getTransactions(req, res) {
  try {
    const tenantId = _getTenantId(req);
    if (!tenantId) return res.status(400).json({ status: 'error', message: 'Tenant tidak teridentifikasi.' });

    const page  = Math.max(1, parseInt(req.query.page  || '1',  10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '30', 10)));

    const result = await billingService.getTransactionHistory(tenantId, { page, limit });
    res.json({ status: 'ok', ...result });
  } catch (err) {
    console.error('[Billing] getTransactions:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/billing/topup/request
// Tenant ajukan permintaan top-up manual
// Body: { amount, transfer_ref, transfer_proof }
// ─────────────────────────────────────────────────────────────────────────────
async function submitTopupRequest(req, res) {
  try {
    const tenantId = _getTenantId(req);
    if (!tenantId) return res.status(400).json({ status: 'error', message: 'Tenant tidak teridentifikasi.' });

    const { amount, transfer_ref, transfer_proof } = req.body;

    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
      return res.status(400).json({ status: 'error', message: 'Nominal top-up tidak valid.' });
    }

    const result = await billingService.submitTopupRequest(
      tenantId,
      parseFloat(amount),
      transfer_ref || null,
      transfer_proof || null
    );

    res.status(201).json({
      status:  'ok',
      message: 'Permintaan top-up berhasil dikirim. Menunggu konfirmasi admin NexaMOS.',
      data:    result,
    });
  } catch (err) {
    console.error('[Billing] submitTopupRequest:', err.message);
    const isBizError = err.code === 'TOPUP_BELOW_MINIMUM';
    res.status(isBizError ? 400 : 500).json({ status: 'error', message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/billing/topup/requests
// List permintaan top-up milik tenant sendiri
// ─────────────────────────────────────────────────────────────────────────────
async function getTopupRequests(req, res) {
  try {
    const tenantId = _getTenantId(req);
    if (!tenantId) return res.status(400).json({ status: 'error', message: 'Tenant tidak teridentifikasi.' });

    const { pool } = require('../../config/database');
    const [rows] = await pool.query(
      `SELECT id, amount, transfer_ref, transfer_proof, status, requested_at, processed_at, note
       FROM credit_topup_requests
       WHERE tenant_id = ?
       ORDER BY requested_at DESC
       LIMIT 50`,
      [tenantId]
    );

    res.json({ status: 'ok', data: rows });
  } catch (err) {
    console.error('[Billing] getTopupRequests:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/billing/prices
// Daftar harga per kategori pesan (informatif untuk UI tenant)
// ─────────────────────────────────────────────────────────────────────────────
function getPrices(req, res) {
  res.json({
    status: 'ok',
    data: {
      prices: billingService.MESSAGE_PRICES,
      currency: 'IDR',
      unit: 'per pesan terkirim',
      notes: 'Service message (SW Open) selalu gratis.',
    },
  });
}

module.exports = {
  getBalance,
  getTransactions,
  submitTopupRequest,
  getTopupRequests,
  getPrices,
};

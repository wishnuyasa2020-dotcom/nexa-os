'use strict';

const subscriptionService = require('./subscription.service');
const { tenantStorage } = require('../../../config/database');

/**
 * GET /api/v1/subscription/plans
 * Dapatkan daftar paket harga SaaS
 */
async function getPlans(_req, res) {
  try {
    const plans = subscriptionService.getPlans();
    return res.json({ status: 'ok', data: plans });
  } catch (err) {
    console.error('[SubscriptionController] getPlans error:', err.message);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

/**
 * GET /api/v1/subscription/overview
 * Dapatkan status langganan tenant saat ini, limit & histori invoice
 */
async function getBillingOverview(req, res) {
  try {
    const tenantId = req.user?.tenantId || tenantStorage.getStore();
    if (!tenantId) {
      return res.status(400).json({ status: 'error', message: 'Tenant ID tidak ditemukan pada sesi login.' });
    }

    const data = await subscriptionService.getBillingOverview(tenantId);
    return res.json({ status: 'ok', data });
  } catch (err) {
    console.error('[SubscriptionController] getBillingOverview error:', err.message);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

/**
 * POST /api/v1/subscription/create-transaction
 * Body: { targetTier: 'PRO', billingCycle: 'MONTHLY' }
 */
async function createTransaction(req, res) {
  try {
    const tenantId = req.user?.tenantId || tenantStorage.getStore();
    if (!tenantId) {
      return res.status(400).json({ status: 'error', message: 'Tenant ID tidak terdeteksi.' });
    }

    const { targetTier, billingCycle } = req.body;
    if (!targetTier) {
      return res.status(400).json({ status: 'error', message: 'Target tier wajib diisi (PRO, BUSINESS, ENTERPRISE).' });
    }

    const result = await subscriptionService.createSnapTransaction({
      tenantId,
      targetTier,
      billingCycle: billingCycle || 'MONTHLY',
      user: req.user,
    });

    return res.json({
      status: 'ok',
      message: 'Transaksi Midtrans Snap berhasil dibuat.',
      data: result,
    });
  } catch (err) {
    console.error('[SubscriptionController] createTransaction error:', err.message);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

/**
 * GET /api/v1/subscription/check-status/:invoiceId
 * Cek status transaksi langsung ke Midtrans API & auto-upgrade jika sudah settlement
 */
async function checkStatus(req, res) {
  try {
    const tenantId = req.user?.tenantId || tenantStorage.getStore();
    const { invoiceId } = req.params;

    if (!invoiceId) {
      return res.status(400).json({ status: 'error', message: 'Parameter invoiceId wajib disertakan.' });
    }

    const result = await subscriptionService.checkTransactionStatus(invoiceId, tenantId);
    return res.json({ status: 'ok', data: result });
  } catch (err) {
    console.error('[SubscriptionController] checkStatus error:', err.message);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

/**
 * POST /api/public/midtrans/notification
 * Webhook callback dari Midtrans (Public endpoint)
 */
async function handleMidtransWebhook(req, res) {
  try {
    const notification = req.body;
    const result = await subscriptionService.handleWebhookNotification(notification);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[SubscriptionController] Webhook notification error:', err.message);
    return res.status(400).json({ status: 'error', message: err.message });
  }
}

module.exports = {
  getPlans,
  getBillingOverview,
  createTransaction,
  checkStatus,
  handleMidtransWebhook,
};

'use strict';

const { mainPool, tenantStorage } = require('../config/database');

/**
 * Helper untuk mengecek apakah WhatsApp tenant berstatus CONNECTED
 */
async function isTenantWhatsappConnected(tenantId) {
  if (!tenantId) return false;
  if (tenantId === 'derma-indonesia') return true; // Pilot tenant default selalu aktif

  try {
    const [rows] = await mainPool.query(
      'SELECT whatsapp_status, whatsapp_phone_id FROM tenants WHERE tenant_id = ? LIMIT 1',
      [tenantId]
    );
    return (
      rows.length > 0 &&
      rows[0].whatsapp_status === 'CONNECTED' &&
      Boolean(rows[0].whatsapp_phone_id)
    );
  } catch (err) {
    console.error('[WhatsApp Guard] Error query tenant whatsapp status:', err.message);
    return false;
  }
}

/**
 * Express Middleware: Memastikan tenant memiliki nomor WhatsApp Bisnis aktif
 * sebelum mengakses endpoint pengiriman pesan (Live Chat, Broadcast, Nurturing, Snooze).
 */
async function requireActiveWhatsapp(req, res, next) {
  const tenantId = req.user?.tenantId || (tenantStorage ? tenantStorage.getStore() : null);

  if (!tenantId) {
    return res.status(401).json({
      status: 'error',
      message: 'Sesi tenant tidak valid atau tidak terautentikasi.'
    });
  }

  // Tenant pilot default (derma-indonesia) selalu diizinkan
  if (tenantId === 'derma-indonesia') {
    return next();
  }

  try {
    const [rows] = await mainPool.query(
      'SELECT whatsapp_status, whatsapp_phone_id FROM tenants WHERE tenant_id = ? LIMIT 1',
      [tenantId]
    );

    const status = rows[0]?.whatsapp_status || 'NOT_CONFIGURED';
    const phoneId = rows[0]?.whatsapp_phone_id;

    if (rows.length === 0 || status !== 'CONNECTED' || !phoneId) {
      return res.status(403).json({
        status: 'error',
        code: 'WHATSAPP_NOT_CONNECTED',
        whatsappStatus: status,
        message: 'Nomor WhatsApp Bisnis belum terhubung atau belum aktif. Silakan daftarkan dan aktifkan nomor resmi Anda terlebih dahulu melalui menu Settings > WhatsApp Bisnis.'
      });
    }

    next();
  } catch (err) {
    console.error('[WhatsApp Guard] Middleware error:', err);
    // Jika DB master tidak bisa diakses, loloskan untuk mencegah false outage
    next();
  }
}

module.exports = {
  requireActiveWhatsapp,
  isTenantWhatsappConnected
};

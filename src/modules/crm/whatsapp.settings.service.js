'use strict';

const crypto = require('crypto');
const { mainPool, pool, tenantStorage } = require('../../config/database');

/**
 * Catat event immutable ke events_log untuk audit trail
 */
async function _recordEvent(eventType, payload, actor = 'System') {
  try {
    const eventId = `EVT-WA-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    await pool.query(
      `INSERT INTO events_log (event_id, aggregate_type, aggregate_id, event_type, payload, actor_id, created_at)
       VALUES (?, 'whatsapp_settings', ?, ?, ?, ?, NOW())`,
      [eventId, payload.tenantId || 'global', eventType, JSON.stringify(payload), actor || 'System']
    );
  } catch (err) {
    console.warn(`[WhatsAppSettings] Warning: Gagal mencatat event ${eventType}:`, err.message);
  }
}

/**
 * Normalisasi format nomor WhatsApp ke format internasional (628xxx)
 */
function normalizePhoneNumber(rawNumber) {
  if (!rawNumber) return '';
  let clean = String(rawNumber).replace(/[^0-9]/g, '');
  if (clean.startsWith('0')) {
    clean = '62' + clean.slice(1);
  } else if (clean.startsWith('8')) {
    clean = '62' + clean;
  }
  return clean;
}

/**
 * Ambil status konfigurasi WhatsApp tenant dari Central Registry (nexamain.tenants)
 */
async function getWhatsappStatus(tenantId) {
  if (!tenantId) throw new Error('tenantId tidak ditemukan dalam konteks.');

  const [rows] = await mainPool.query(
    `SELECT tenant_id, brand_name, whatsapp_phone_id, whatsapp_waba_id,
            whatsapp_number, whatsapp_display_name, whatsapp_status,
            whatsapp_business_category, whatsapp_requested_at,
            whatsapp_connected_at, whatsapp_notes
     FROM tenants
     WHERE tenant_id = ?
     LIMIT 1`,
    [tenantId]
  );

  if (rows.length === 0) {
    throw new Error(`Tenant "${tenantId}" tidak ditemukan.`);
  }

  const t = rows[0];
  return {
    tenantId: t.tenant_id,
    brandName: t.brand_name,
    whatsappPhoneId: t.whatsapp_phone_id || null,
    whatsappWabaId: t.whatsapp_waba_id || null,
    whatsappNumber: t.whatsapp_number || null,
    whatsappDisplayName: t.whatsapp_display_name || null,
    whatsappStatus: t.whatsapp_status || 'NOT_CONFIGURED',
    whatsappBusinessCategory: t.whatsapp_business_category || null,
    whatsappRequestedAt: t.whatsapp_requested_at || null,
    whatsappConnectedAt: t.whatsapp_connected_at || null,
    whatsappNotes: t.whatsapp_notes || null,
  };
}

/**
 * Daftarkan nomor WhatsApp baru milik tenant
 */
async function registerWhatsapp(tenantId, payload, actor = 'System') {
  if (!tenantId) throw new Error('tenantId tidak ditemukan dalam konteks.');

  const { whatsappNumber, displayName, businessCategory, isFreshNumberDeclaration, notes } = payload;

  // 1. Validasi Deklarasi Wajib Penggunaan Nomor Baru
  if (isFreshNumberDeclaration !== true) {
    throw new Error(
      'Anda wajib menyetujui pernyataan penggunaan nomor baru (Fresh SIM) atau nomor yang sudah dihapus dari aplikasi WhatsApp ponsel.'
    );
  }

  // 2. Validasi Nomor Telepon
  const cleanNumber = normalizePhoneNumber(whatsappNumber);
  if (!cleanNumber || cleanNumber.length < 10 || cleanNumber.length > 16) {
    throw new Error('Nomor WhatsApp tidak valid. Masukkan nomor HP aktif (contoh: 081234567890).');
  }

  // 3. Validasi Display Name (Kesesuaian dengan Meta Policy)
  const trimmedDisplayName = (displayName || '').trim();
  if (!trimmedDisplayName || trimmedDisplayName.length < 3) {
    throw new Error('Nama tampilan brand (Display Name) minimal 3 karakter.');
  }

  // 4. Update data di Central Registry (nexamain.tenants)
  await mainPool.query(
    `UPDATE tenants SET
       whatsapp_number = ?,
       whatsapp_display_name = ?,
       whatsapp_business_category = ?,
       whatsapp_status = 'PENDING_PROVISIONING',
       whatsapp_requested_at = NOW(),
       whatsapp_notes = ?
     WHERE tenant_id = ?`,
    [
      cleanNumber,
      trimmedDisplayName,
      businessCategory || 'Pendidikan / Kursus',
      notes || 'Menunggu verifikasi dan registrasi WABA oleh Superadmin',
      tenantId
    ]
  );

  // 5. Catat Event ke Log Tenant
  await _recordEvent(
    'WhatsAppRegistrationRequested',
    {
      tenantId,
      whatsappNumber: cleanNumber,
      displayName: trimmedDisplayName,
      businessCategory: businessCategory || 'Pendidikan / Kursus',
      notes
    },
    actor
  );

  return await getWhatsappStatus(tenantId);
}

/**
 * Putuskan koneksi WhatsApp tenant (Reset ke NOT_CONFIGURED)
 */
async function disconnectWhatsapp(tenantId, actor = 'System') {
  if (!tenantId) throw new Error('tenantId tidak ditemukan dalam konteks.');

  await mainPool.query(
    `UPDATE tenants SET
       whatsapp_status = 'NOT_CONFIGURED',
       whatsapp_phone_id = NULL,
       whatsapp_notes = 'Koneksi WhatsApp diputuskan oleh pengguna.',
       whatsapp_connected_at = NULL
     WHERE tenant_id = ?`,
    [tenantId]
  );

  await _recordEvent('WhatsAppDisconnected', { tenantId }, actor);

  return await getWhatsappStatus(tenantId);
}

module.exports = {
  getWhatsappStatus,
  registerWhatsapp,
  disconnectWhatsapp,
  normalizePhoneNumber
};

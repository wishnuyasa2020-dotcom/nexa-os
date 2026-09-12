'use strict';

const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { mainPool, pool, tenantStorage } = require('../../config/database');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || 'wishnuyasa2020@gmail.com',
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Format tanggal ke format WIB Indonesia yang rapi
 */
function formatWIB(date = new Date()) {
  try {
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      dateStyle: 'full',
      timeStyle: 'medium',
    }).format(date) + ' WIB';
  } catch (_) {
    return date.toISOString();
  }
}

/**
 * Kirim email notifikasi ke Superadmin saat tenant mengajukan permohonan registrasi WABA
 */
async function _sendSuperadminNotificationEmail({
  tenantId,
  brandName,
  whatsappNumber,
  displayName,
  businessCategory,
  notes,
  actor = 'System',
  requestedAt = new Date()
}) {
  const superadminEmail = process.env.SUPERADMIN_EMAIL || 'wishnuyasa2020@gmail.com';
  const smtpUser = process.env.SMTP_USER || 'wishnuyasa2020@gmail.com';

  if (!process.env.SMTP_PASS) {
    console.warn('[WhatsAppSettings] Warning: SMTP_PASS belum dikonfigurasi, notifikasi email Superadmin dilewati.');
    return;
  }

  const formattedTime = formatWIB(requestedAt);
  const formattedNumber = String(whatsappNumber).startsWith('+') ? String(whatsappNumber) : `+${whatsappNumber}`;
  const displayBrand = brandName || tenantId;

  const htmlContent = `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Permohonan Registrasi WABA</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0f172a; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #1e293b; border-radius: 16px; border: 1px solid #334155; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.4);">
          
          <!-- Header -->
          <tr>
            <td style="padding: 28px 32px; background: linear-gradient(135deg, #059669 0%, #0d9488 100%); text-align: left;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <div style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: #ccfbf1; margin-bottom: 6px;">NEXA MOS COMMAND CENTRE</div>
                    <div style="font-size: 22px; font-weight: 700; color: #ffffff; line-height: 1.3;">Permohonan Registrasi WhatsApp Bisnis (WABA)</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6; color: #cbd5e1;">
                Halo <strong style="color: #ffffff;">Superadmin Nexa MOS</strong>,
              </p>
              <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #94a3b8;">
                Ada tenant baru yang baru saja mengajukan pendaftaran nomor WhatsApp Bisnis melalui menu <em>Pengaturan Integrasi CRM</em>. Segera lakukan verifikasi nomor dan aktivasi melalui panel Superadmin.
              </p>

              <!-- Card Detail -->
              <div style="background-color: #0f172a; border-radius: 12px; border: 1px solid #334155; padding: 20px; margin-bottom: 24px;">
                <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #10b981; margin-bottom: 14px; border-bottom: 1px solid #1e293b; padding-bottom: 8px;">
                  📋 Detail Registrasi Tenant
                </div>
                <table width="100%" border="0" cellspacing="0" cellpadding="6" style="font-size: 13px;">
                  <tr>
                    <td width="38%" style="color: #94a3b8; font-weight: 500;">Nama Tenant / Brand</td>
                    <td width="4%" style="color: #64748b;">:</td>
                    <td width="58%" style="color: #f8fafc; font-weight: 700;">${displayBrand}</td>
                  </tr>
                  <tr>
                    <td style="color: #94a3b8; font-weight: 500;">Tenant ID</td>
                    <td style="color: #64748b;">:</td>
                    <td style="color: #38bdf8; font-family: monospace; font-weight: 600;">${tenantId}</td>
                  </tr>
                  <tr>
                    <td style="color: #94a3b8; font-weight: 500;">Nomor WhatsApp</td>
                    <td style="color: #64748b;">:</td>
                    <td style="color: #34d399; font-weight: 700; font-size: 15px; font-family: monospace;">${formattedNumber}</td>
                  </tr>
                  <tr>
                    <td style="color: #94a3b8; font-weight: 500;">Display Name Meta</td>
                    <td style="color: #64748b;">:</td>
                    <td style="color: #f8fafc; font-weight: 600;">${displayName}</td>
                  </tr>
                  <tr>
                    <td style="color: #94a3b8; font-weight: 500;">Kategori Bisnis</td>
                    <td style="color: #64748b;">:</td>
                    <td style="color: #e2e8f0;">${businessCategory || '-'}</td>
                  </tr>
                  <tr>
                    <td style="color: #94a3b8; font-weight: 500;">Diajukan Oleh (Actor)</td>
                    <td style="color: #64748b;">:</td>
                    <td style="color: #e2e8f0;">${actor}</td>
                  </tr>
                  <tr>
                    <td style="color: #94a3b8; font-weight: 500;">Waktu Pengajuan</td>
                    <td style="color: #64748b;">:</td>
                    <td style="color: #cbd5e1;">${formattedTime}</td>
                  </tr>
                  ${notes ? `
                  <tr>
                    <td style="color: #94a3b8; font-weight: 500; vertical-align: top;">Catatan Tenant</td>
                    <td style="color: #64748b; vertical-align: top;">:</td>
                    <td style="color: #fbbf24; font-style: italic;">"${notes}"</td>
                  </tr>` : ''}
                </table>
              </div>

              <!-- Petunjuk Aksi Superadmin -->
              <div style="background-color: #1e1b4b; border-radius: 12px; border: 1px solid #4338ca; padding: 18px; margin-bottom: 28px;">
                <div style="font-size: 13px; font-weight: 700; color: #a5b4fc; margin-bottom: 8px;">
                  ⚡ Langkah Cepat Eksekusi Registrasi WABA:
                </div>
                <ol style="margin: 0; padding-left: 20px; font-size: 13px; line-height: 1.7; color: #c7d2fe;">
                  <li>Buka panel Superadmin di <a href="https://admin.nexamos.cloud" style="color: #38bdf8; text-decoration: underline;">admin.nexamos.cloud</a></li>
                  <li>Buka modal registrasi WABA untuk tenant <strong>${tenantId}</strong>.</li>
                  <li>Klik tombol <strong style="color: #34d399;">[ 📲 Kirim SMS OTP via Meta Graph API ]</strong>.</li>
                  <li>Hubungi PIC tenant untuk meminta 6-digit kode OTP yang masuk via SMS di nomor <strong>${formattedNumber}</strong>.</li>
                  <li>Ketik kode OTP di modal dan klik <strong style="color: #34d399;">[ Verifikasi & Selesai ]</strong>.</li>
                  <li><em>PIN 2FA Default Meta (Two-Step Verification):</em> <code style="background-color: #312e81; padding: 2px 6px; border-radius: 4px; color: #facc15; font-weight: bold;">137950</code></li>
                </ol>
              </div>

              <!-- CTA Button -->
              <div style="text-align: center; margin-bottom: 24px;">
                <a href="https://admin.nexamos.cloud" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 12px 28px; border-radius: 8px; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);">
                  Buka Panel Superadmin &rarr;
                </a>
              </div>

              <p style="margin: 0; font-size: 12px; color: #64748b; line-height: 1.5; text-align: center;">
                Notifikasi ini dikirim khusus ke Superadmin (<a href="mailto:${superadminEmail}" style="color: #94a3b8; text-decoration: none;">${superadminEmail}</a>) saat pendaftaran nomor diajukan di CRM Nexa MOS.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 16px 32px; background-color: #0f172a; border-top: 1px solid #334155; text-align: center; font-size: 12px; color: #64748b;">
              &copy; ${new Date().getFullYear()} Nexa MOS SaaS Platform &bull; Automated System Dispatcher
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  await transporter.sendMail({
    from: `"Nexa MOS System" <${smtpUser}>`,
    to: superadminEmail,
    subject: `🔔 Permohonan Registrasi WABA Baru: ${displayBrand} (${formattedNumber})`,
    html: htmlContent,
  });

  console.log(`[WhatsAppSettings] Notifikasi email berhasil dikirim ke Superadmin (${superadminEmail}) untuk permohonan WABA ${tenantId}.`);
}

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
  const isDerma = t.tenant_id === 'derma-indonesia';
  return {
    tenantId: t.tenant_id,
    brandName: t.brand_name,
    whatsappPhoneId: t.whatsapp_phone_id || (isDerma ? (process.env.WA_PHONE_ID || process.env.WA_PHONE_NUMBER_ID) : null),
    whatsappWabaId: t.whatsapp_waba_id || (isDerma ? process.env.WA_WABA_ID : null),
    whatsappNumber: t.whatsapp_number || (isDerma ? '6285770400134' : null),
    whatsappDisplayName: t.whatsapp_display_name || (isDerma ? 'Derma Indonesia' : null),
    whatsappStatus: (isDerma && (!t.whatsapp_status || t.whatsapp_status === 'NOT_CONFIGURED')) ? 'CONNECTED' : (t.whatsapp_status || 'NOT_CONFIGURED'),
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

  const updatedStatus = await getWhatsappStatus(tenantId);

  // 6. Kirim Notifikasi Email ke Superadmin (Asinkron / Non-blocking)
  _sendSuperadminNotificationEmail({
    tenantId,
    brandName: updatedStatus.brandName,
    whatsappNumber: cleanNumber,
    displayName: trimmedDisplayName,
    businessCategory: businessCategory || 'Pendidikan / Kursus',
    notes,
    actor,
    requestedAt: new Date()
  }).catch((mailErr) => {
    console.error(`[WhatsAppSettings] Gagal mengirim email notifikasi ke Superadmin (${tenantId}):`, mailErr.message);
  });

  return updatedStatus;
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

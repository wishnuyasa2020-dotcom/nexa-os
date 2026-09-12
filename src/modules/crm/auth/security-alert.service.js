'use strict';

const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { pool, tenantStorage } = require('../../../config/database');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
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
 * Mendeteksi perubahan kredensial (username/password) dan mengirim email alert ke Admin CRM
 * 
 * @param {Object} params
 * @param {Object} [params.dbPool]           - Dynamic pool jika di luar tenantStorage context
 * @param {string} [params.tenantId]         - ID Tenant (opsional, diambil dari tenantStorage jika ada)
 * @param {number|string} params.userId      - ID user yang kredensialnya diubah
 * @param {string} [params.oldUsername]      - Username lama (jika ada perubahan username)
 * @param {string} [params.newUsername]      - Username baru
 * @param {boolean} [params.isPasswordChanged] - Apakah password diubah/direset
 * @param {string} [params.actor]            - Nama atau username pihak yang mengubah
 * @param {Object} [params.reqMeta]          - Metadata request: { ip, userAgent }
 */
async function notifyCredentialChange({
  dbPool = null,
  tenantId = null,
  userId,
  oldUsername = null,
  newUsername = null,
  isPasswordChanged = false,
  actor = 'System',
  reqMeta = {}
}) {
  const activePool = dbPool || pool;
  const resolvedTenantId = tenantId || (tenantStorage && tenantStorage.getStore ? tenantStorage.getStore() : null) || 'default-tenant';

  // 1. Tentukan apakah ada perubahan kredensial
  const isUsernameChanged = Boolean(
    oldUsername && 
    newUsername && 
    String(oldUsername).trim().toLowerCase() !== String(newUsername).trim().toLowerCase()
  );

  if (!isUsernameChanged && !isPasswordChanged) {
    return { notified: false, reason: 'Tidak ada perubahan username atau password.' };
  }

  let changeType = 'PASSWORD';
  if (isUsernameChanged && isPasswordChanged) {
    changeType = 'USERNAME_AND_PASSWORD';
  } else if (isUsernameChanged) {
    changeType = 'USERNAME';
  }

  // 2. Ambil data detail user yang terdampak
  let targetUser = null;
  try {
    const [[u]] = await activePool.query(
      'SELECT id, username, nama, email, role, status FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    if (u) targetUser = u;
  } catch (err) {
    console.warn('[SecurityAlert] Gagal mengambil target user:', err.message);
  }

  if (!targetUser) {
    targetUser = {
      id: userId,
      username: newUsername || oldUsername || 'unknown',
      nama: newUsername || oldUsername || 'Pengguna CRM',
      email: null,
      role: 'Staff'
    };
  }

  // 3. Resolusi alamat email Administrator CRM (Penerima Alert)
  const adminRecipients = [];
  try {
    const [admins] = await activePool.query(
      "SELECT email, nama, username FROM users WHERE LOWER(role) = 'admin' AND status = 'Aktif' AND email IS NOT NULL AND email != ''"
    );
    for (const a of admins) {
      if (a.email && a.email.includes('@') && !adminRecipients.includes(a.email.trim())) {
        adminRecipients.push(a.email.trim());
      }
    }
  } catch (err) {
    console.warn('[SecurityAlert] Gagal mengambil email admin dari database:', err.message);
  }

  // Fallback ke SMTP_USER / ADMIN_ALERT_EMAIL jika tidak ada email admin di tabel users
  const fallbackEmail = process.env.ADMIN_ALERT_EMAIL || process.env.SMTP_USER;
  if (adminRecipients.length === 0 && fallbackEmail) {
    adminRecipients.push(fallbackEmail.trim());
  }

  // Tambahkan user yang bersangkutan (jika memiliki email dan belum masuk daftar) sebagai tembusan keamanan
  const allRecipients = [...adminRecipients];
  if (targetUser.email && targetUser.email.includes('@') && !allRecipients.includes(targetUser.email.trim())) {
    allRecipients.push(targetUser.email.trim());
  }

  if (allRecipients.length === 0) {
    console.warn('[SecurityAlert] Tidak ada alamat email penerima yang valid untuk alert keamanan.');
    return { notified: false, reason: 'No recipient email found' };
  }

  // 4. Siapkan metadata event
  const timestampWIB = formatWIB(new Date());
  const ipAddress = reqMeta?.ip || 'Tidak diketahui / Internal Server';
  const userAgent = reqMeta?.userAgent || 'Tidak diketahui / API Client';
  const frontendUrl = process.env.FRONTEND_URL || 'https://nexamos.cloud';

  // 5. Susun teks dan HTML Email
  let changeTitle = 'Pemberitahuan Perubahan Kredensial Akun';
  let changeBadgeColor = '#f59e0b'; // amber
  let changeDesc = '';

  if (changeType === 'USERNAME_AND_PASSWORD') {
    changeTitle = 'PERINGATAN: Perubahan Username & Password Akun CRM';
    changeBadgeColor = '#ef4444'; // red
    changeDesc = `Terjadi perubahan <strong>Username</strong> (dari <code>@${oldUsername}</code> ke <code>@${newUsername}</code>) dan pembaruan <strong>Password Akun</strong>.`;
  } else if (changeType === 'USERNAME') {
    changeTitle = 'Pemberitahuan: Perubahan Username Akun CRM';
    changeBadgeColor = '#3b82f6'; // blue
    changeDesc = `Username akun telah diubah dari <code>@${oldUsername}</code> menjadi <code>@${newUsername}</code>.`;
  } else {
    changeTitle = 'Pemberitahuan: Pembaruan Password Akun CRM';
    changeBadgeColor = '#10b981'; // emerald / amber
    changeDesc = `Password akun untuk pengguna <code>@${targetUser.username}</code> telah berhasil diubah / direset.`;
  }

  const subject = `[SECURITY ALERT] ${changeTitle} (${newUsername || targetUser.username})`;

  const emailHtml = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${subject}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#0f172a;padding:30px 15px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:600px;background-color:#1e293b;border-radius:16px;border:1px solid #334155;overflow:hidden;box-shadow:0 10px 25px rgba(0,0,0,0.5);" cellspacing="0" cellpadding="0">
            
            <!-- Header Banner -->
            <tr>
              <td style="padding:28px 32px 20px 32px;background:linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%);border-bottom:1px solid #334155;">
                <table width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td>
                      <div style="display:inline-block;padding:4px 10px;border-radius:6px;background:${changeBadgeColor}22;color:${changeBadgeColor};border:1px solid ${changeBadgeColor}55;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:10px;">
                        🛡️ NEXA SECURITY ALERT
                      </div>
                      <h2 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;line-height:1.4;">
                        ${changeTitle}
                      </h2>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Content Area -->
            <tr>
              <td style="padding:28px 32px;">
                <p style="margin:0 0 16px 0;font-size:14px;color:#cbd5e1;line-height:1.6;">
                  Halo Administrator CRM,
                </p>
                <p style="margin:0 0 20px 0;font-size:14px;color:#cbd5e1;line-height:1.6;">
                  Sistem keamanan otomatis Nexa OS mendeteksi adanya mutasi kredensial pada akun CRM di tenant Anda (<code>${resolvedTenantId}</code>):
                </p>

                <!-- Change Summary Box -->
                <div style="background-color:#0f172a;border-left:4px solid ${changeBadgeColor};padding:14px 16px;border-radius:6px;margin-bottom:24px;font-size:13px;color:#f1f5f9;line-height:1.5;">
                  ${changeDesc}
                </div>

                <!-- Detail Table -->
                <table width="100%" cellspacing="0" cellpadding="0" style="background-color:#0f172a;border:1px solid #334155;border-radius:10px;overflow:hidden;margin-bottom:24px;font-size:13px;">
                  <tr>
                    <td style="padding:10px 14px;color:#94a3b8;border-bottom:1px solid #1e293b;width:35%;">Nama Staf</td>
                    <td style="padding:10px 14px;color:#f8fafc;font-weight:600;border-bottom:1px solid #1e293b;">${targetUser.nama || '-'}</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 14px;color:#94a3b8;border-bottom:1px solid #1e293b;">Username Saat Ini</td>
                    <td style="padding:10px 14px;color:#38bdf8;font-weight:600;border-bottom:1px solid #1e293b;">@${newUsername || targetUser.username}</td>
                  </tr>
                  ${isUsernameChanged ? `
                  <tr>
                    <td style="padding:10px 14px;color:#94a3b8;border-bottom:1px solid #1e293b;">Username Sebelumnya</td>
                    <td style="padding:10px 14px;color:#e2e8f0;border-bottom:1px solid #1e293b;text-decoration:line-through;">@${oldUsername}</td>
                  </tr>
                  ` : ''}
                  <tr>
                    <td style="padding:10px 14px;color:#94a3b8;border-bottom:1px solid #1e293b;">Email Akun</td>
                    <td style="padding:10px 14px;color:#f8fafc;border-bottom:1px solid #1e293b;">${targetUser.email || '(Belum terdaftar)'}</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 14px;color:#94a3b8;border-bottom:1px solid #1e293b;">Role / Hak Akses</td>
                    <td style="padding:10px 14px;color:#f8fafc;border-bottom:1px solid #1e293b;">${targetUser.role || '-'}</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 14px;color:#94a3b8;border-bottom:1px solid #1e293b;">Diubah Oleh (Aktor)</td>
                    <td style="padding:10px 14px;color:#f8fafc;font-weight:600;border-bottom:1px solid #1e293b;">${actor}</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 14px;color:#94a3b8;border-bottom:1px solid #1e293b;">Waktu Kejadian</td>
                    <td style="padding:10px 14px;color:#f8fafc;border-bottom:1px solid #1e293b;">${timestampWIB}</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 14px;color:#94a3b8;border-bottom:1px solid #1e293b;">Alamat IP</td>
                    <td style="padding:10px 14px;color:#cbd5e1;font-family:monospace;border-bottom:1px solid #1e293b;">${ipAddress}</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 14px;color:#94a3b8;">Perangkat / Client</td>
                    <td style="padding:10px 14px;color:#cbd5e1;font-size:11px;line-height:1.4;">${userAgent}</td>
                  </tr>
                </table>

                <!-- Security Guidance -->
                <div style="background-color:#1e1b4b;border:1px solid #4338ca;padding:16px;border-radius:10px;margin-bottom:24px;">
                  <h4 style="margin:0 0 8px 0;color:#a5b4fc;font-size:13px;font-weight:700;">
                    ⚠️ Apakah perubahan ini tidak diotorisasi?
                  </h4>
                  <p style="margin:0;font-size:12px;color:#cbd5e1;line-height:1.6;">
                    Jika aktivitas di atas <strong>BUKAN</strong> dilakukan oleh Anda atau staf bersangkutan, segera buka <strong>Manajemen Tim</strong> di CRM untuk menonaktifkan akun staf ini atau lakukan reset password darurat.
                  </p>
                </div>

                <!-- Call to action button -->
                <div style="text-align:center;margin-bottom:10px;">
                  <a href="${frontendUrl}/manajemen-tim" style="display:inline-block;padding:12px 28px;background:#2563eb;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;box-shadow:0 4px 12px rgba(37,99,235,0.3);">
                    Buka Panel Manajemen Tim &rarr;
                  </a>
                </div>

              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:20px 32px;background-color:#0f172a;border-top:1px solid #334155;text-align:center;font-size:11px;color:#64748b;line-height:1.5;">
                Email peringatan ini dikirimkan otomatis oleh sistem keamanan Nexa OS.<br>
                Sistem Event-Sourcing & Audit Log Nexa CRM &bull; Tidak perlu membalas email ini.
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;

  // 6. Kirim Email secara Asynchronous (Non-blocking)
  let emailSent = false;
  try {
    const info = await transporter.sendMail({
      from: `"Nexa Security Guard" <${process.env.SMTP_USER || 'no-reply@nexa.id'}>`,
      to: allRecipients.join(', '),
      subject: subject,
      html: emailHtml,
    });
    emailSent = true;
    console.log(`[SecurityAlert] Alert sent successfully for user ${targetUser.username} to ${allRecipients.join(', ')} (MessageID: ${info.messageId})`);
  } catch (mailErr) {
    console.error('[SecurityAlert] Gagal mengirim email alert keamanan:', mailErr.message);
  }

  // 7. Rekam Event-Sourcing ke events_log
  try {
    const eventId = `EVT-SEC-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    await activePool.query(
      `INSERT INTO events_log (event_id, aggregate_type, aggregate_id, event_type, payload, actor_id, created_at)
       VALUES (?, 'user', ?, 'StaffCredentialAlertSent', ?, ?, NOW())`,
      [
        eventId,
        String(targetUser.id || userId),
        JSON.stringify({
          changeType,
          oldUsername,
          newUsername: newUsername || targetUser.username,
          isPasswordChanged,
          actor,
          recipients: allRecipients,
          emailSent,
          ipAddress,
          userAgent,
          timestamp: new Date().toISOString(),
        }),
        actor || 'System'
      ]
    );
  } catch (evtErr) {
    console.warn('[SecurityAlert] Gagal mencatat event StaffCredentialAlertSent:', evtErr.message);
  }

  return {
    notified: true,
    emailSent,
    changeType,
    recipients: allRecipients,
  };
}

module.exports = {
  notifyCredentialChange,
};

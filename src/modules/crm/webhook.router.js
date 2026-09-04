'use strict';

/**
 * webhook.router.js
 * ============================================================
 * Dynamic Webhook Router — BYOW (Bring Your Own WhatsApp) Architecture
 *
 * Setiap tenant mendapatkan URL webhook unik:
 *   https://api.nexa.id/webhook/:tenantSlug
 *
 * Cara kerja:
 *  1. Meta mengirim POST ke /webhook/crm-demo
 *  2. Router lookup tenantSlug → nexamain.tenants & tenant_databases
 *  3. Buat connection pool ke DB tenant tersebut (atau gunakan cached pool)
 *  4. Inject pool ke req.tenantPool + inject tenant credentials ke req.tenantConfig
 *  5. Teruskan ke handler pesan yang sama dengan sebelumnya
 *
 * Verifikasi webhook (GET) juga per-tenant menggunakan WA_VERIFY_TOKEN
 * yang disimpan di nexamain.tenants.webhook_secret
 * ============================================================
 */

const { Router }  = require('express');
const mysql       = require('mysql2/promise');
const { mainPool } = require('../../config/database'); // mainPool = nexamain registry
require('dotenv').config();

const router = Router();

// ── Cache pool per tenant (hindari buat koneksi baru tiap request) ─────────────
const _tenantPoolCache = new Map();

async function _getTenantPool(dbConfig) {
  const cacheKey = `${dbConfig.db_host}:${dbConfig.db_name}`;
  if (_tenantPoolCache.has(cacheKey)) return _tenantPoolCache.get(cacheKey);

  const newPool = mysql.createPool({
    host:            dbConfig.db_host,
    port:            dbConfig.db_port || 3306,
    user:            dbConfig.db_user,
    password:        dbConfig.db_password,
    database:        dbConfig.db_name,
    connectionLimit: 5,
    waitForConnections: true,
  });

  _tenantPoolCache.set(cacheKey, newPool);
  return newPool;
}

// ── Lookup tenant dari nexamain ────────────────────────────────────────────────
async function _lookupTenant(tenantSlug) {
  const [rows] = await mainPool.query(
    `SELECT
       t.tenant_id, t.brand_name,
       t.whatsapp_phone_id, t.whatsapp_waba_id, t.whatsapp_access_token,
       t.webhook_secret,
       td.db_host, td.db_port, td.db_name, td.db_user, td.db_password
     FROM tenants t
     JOIN tenant_databases td ON t.tenant_id = td.tenant_id
     WHERE t.tenant_id = ? AND t.status = 'ACTIVE'
     LIMIT 1`,
    [tenantSlug]
  );
  return rows[0] || null;
}

// ── Middleware: Resolve tenant dari URL slug ───────────────────────────────────
async function resolveTenant(req, res, next) {
  const tenantSlug = req.params.tenantSlug;

  try {
    const tenant = await _lookupTenant(tenantSlug);

    if (!tenant) {
      console.warn(`[Webhook] Unknown tenant slug: ${tenantSlug}`);
      return res.sendStatus(404);
    }

    // Inject ke req agar handler bawah bisa akses
    req.tenantConfig = {
      tenantId:          tenant.tenant_id,
      brandName:         tenant.brand_name,
      waPhoneId:         tenant.whatsapp_phone_id,
      waWabaId:          tenant.whatsapp_waba_id,
      waAccessToken:     tenant.whatsapp_access_token,
      webhookSecret:     tenant.webhook_secret || process.env.WA_VERIFY_TOKEN || 'nexa_webhook_2026',
    };

    // Inject pool ke DB tenant
    req.tenantPool = await _getTenantPool(tenant);

    next();
  } catch (err) {
    console.error(`[Webhook] resolveTenant error: ${err.message}`);
    res.sendStatus(500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /webhook/:tenantSlug — Verifikasi webhook dari Meta
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:tenantSlug', resolveTenant, (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === req.tenantConfig.webhookSecret) {
    console.log(`[Webhook] VERIFIED for tenant: ${req.tenantConfig.tenantId}`);
    return res.status(200).send(challenge);
  }

  console.warn(`[Webhook] Verification FAILED for tenant: ${req.tenantConfig.tenantId}`);
  res.sendStatus(403);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /webhook/:tenantSlug — Terima event pesan masuk & status update
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:tenantSlug', resolveTenant, async (req, res) => {
  // Balas 200 dulu — Meta timeout dalam 20 detik, proses di background
  res.sendStatus(200);

  const body = req.body;
  if (!body.object) return;

  const pool = req.tenantPool;

  const entries = body.entry || [];
  for (const entry of entries) {
    const changes = entry.changes || [];
    for (const change of changes) {
      const val = change.value || {};

      // ── Status Delivery Updates ──────────────────────────────────────────
      if (val.statuses && val.statuses.length > 0) {
        for (const statusEvt of val.statuses) {
          await handleStatusUpdate(pool, statusEvt).catch(e =>
            console.error(`[Webhook:${req.tenantConfig.tenantId}] statusUpdate error:`, e.message)
          );
        }
      }

      // ── Pesan Masuk ──────────────────────────────────────────────────────
      if (val.messages && val.messages.length > 0) {
        const contactMeta = (val.contacts || [])[0] || null;
        for (const msg of val.messages) {
          await handleIncomingMessage(pool, msg, contactMeta, req.tenantConfig).catch(e =>
            console.error(`[Webhook:${req.tenantConfig.tenantId}] incomingMessage error:`, e.message)
          );
        }
      }
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// HANDLER: Pesan Masuk
// ─────────────────────────────────────────────────────────────────────────────
async function handleIncomingMessage(pool, msg, contactMeta, tenantConfig) {
  const metaMessageId = msg.id;
  const fromPhone     = msg.from;
  const msgType       = msg.type || 'text';
  const timestamp     = msg.timestamp ? new Date(parseInt(msg.timestamp) * 1000) : new Date();

  let body     = null;
  let mediaId  = null;
  let mimeType = null;
  let caption  = null;

  if (msgType === 'text') {
    body = msg.text?.body || '';
  } else if (['image', 'video', 'audio', 'document'].includes(msgType)) {
    const mediaObj = msg[msgType] || {};
    mediaId  = mediaObj.id        || null;
    mimeType = mediaObj.mime_type || null;
    caption  = mediaObj.caption   || null;
  } else if (msgType === 'interactive') {
    const interactive = msg.interactive || {};
    if (interactive.type === 'button_reply') {
      body = interactive.button_reply?.title || '';
    } else if (interactive.type === 'list_reply') {
      body = interactive.list_reply?.title || '';
    }
  } else if (msgType === 'button') {
    body = msg.button?.text || '';
  }

  const fromName    = contactMeta?.profile?.name || fromPhone;
  const phoneClean  = String(fromPhone).replace(/[^0-9]/g, '');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Cari atau buat conversation
    let [convRows] = await conn.query(
      'SELECT conv_id, id_siswa FROM conversations WHERE wa_number = ? LIMIT 1',
      [phoneClean]
    );

    let convId;
    let idSiswa = null;

    if (convRows.length === 0) {
      // Cari siswa — prioritaskan BSUID (jika tersedia), fallback ke no_wa
      let siswa = null;
      if (msg.from && msg.from.length > 15) {
        // Kemungkinan BSUID (> 15 karakter, bukan nomor WA biasa)
        const [bsRows] = await conn.query(
          'SELECT id_siswa, nama_lengkap FROM master_siswa WHERE bsuid = ? LIMIT 1',
          [msg.from]
        );
        siswa = bsRows[0] || null;
      }
      if (!siswa) {
        const [waRows] = await conn.query(
          'SELECT id_siswa, nama_lengkap FROM master_siswa WHERE no_wa = ? ORDER BY id_siswa ASC LIMIT 1',
          [phoneClean]
        );
        siswa = waRows[0] || null;
      }
      idSiswa = siswa ? siswa.id_siswa : null;

      const [insertConv] = await conn.query(
        `INSERT INTO conversations
           (id_siswa, wa_number, student_name, started_by, status, window_status,
            window_opened_at, window_expires_at, last_message_type,
            last_message_prev, last_sender, last_msg_ts)
         VALUES (?, ?, ?, 'customer', 'OPEN', 'OPEN', NOW(), DATE_ADD(NOW(), INTERVAL 24 HOUR),
                 ?, ?, ?, NOW())`,
        [
          idSiswa,
          phoneClean,
          siswa?.nama_lengkap || fromName,
          msgType,
          body ? body.substring(0, 100) : `[${msgType}]`,
          fromPhone,
        ]
      );
      convId = insertConv.insertId;
    } else {
      convId  = convRows[0].conv_id;
      idSiswa = convRows[0].id_siswa;
    }

    // 2. Insert pesan
    await conn.query(
      `INSERT INTO chat_messages
         (message_id, conv_id, timestamp, datetime, direction, from_phone, from_name,
          type, body, media_id, mime_type, caption, status)
       VALUES (?, ?, ?, ?, 'incoming', ?, ?, ?, ?, ?, ?, ?, 'received')`,
      [metaMessageId || `inc-${Date.now()}`, convId, msg.timestamp || Math.floor(Date.now() / 1000), timestamp,
       fromPhone, fromName, msgType, body, mediaId, mimeType, caption]
    );

    // 3. Update conversation header
    await conn.query(
      `UPDATE conversations SET
         window_status     = 'OPEN',
         window_opened_at  = NOW(),
         window_expires_at = DATE_ADD(NOW(), INTERVAL 24 HOUR),
         last_message_type = ?,
         last_message_prev = ?,
         last_sender       = ?,
         last_msg_ts       = NOW()
       WHERE conv_id = ?`,
      [msgType, body ? body.substring(0, 100) : `[${msgType}]`, fromPhone, convId]
    );

    // 4. Update service window
    await conn.query(
      `INSERT INTO wa_service_window (phone, id_siswa, last_incoming_ts, sw_status, updated_date)
       VALUES (?, ?, NOW(), 'OPEN', NOW())
       ON DUPLICATE KEY UPDATE
         last_incoming_ts = NOW(), sw_status = 'OPEN', updated_date = NOW()`,
      [phoneClean, idSiswa]
    );

    // 5. Bind BSUID jika pesan datang dari identifier yang bukan nomor WA biasa
    if (msg.from && idSiswa) {
      await conn.query(
        `UPDATE master_siswa SET bsuid = ?
         WHERE id_siswa = ? AND (bsuid IS NULL OR bsuid = '')`,
        [msg.from, idSiswa]
      );
    }

    // 6. State Machine: Handoff to CRO untuk respons Snooze / Probing
    if (idSiswa && body) {
      const lowerBody = body.toLowerCase();
      if (
        lowerBody.includes('mau tanya program') ||
        lowerBody.includes('jangan sekarang') ||
        lowerBody.includes('hentikan pesan')
      ) {
        // Hentikan campaign bot (snooze & probing)
        await conn.query(
          `UPDATE siswa_nurturing_state 
           SET is_in_campaign = 0, snooze_until = NULL, updated_at = NOW() 
           WHERE id_siswa = ?`,
          [idSiswa]
        );
        // Handoff ke CRO
        await conn.query(
          `UPDATE siswa_periode 
           SET next_action = 'Follow Up', due_date = NOW() 
           WHERE id_siswa = ?`,
          [idSiswa]
        );
        // Log Activity
        await conn.query(
          `INSERT INTO nurturing_activity_log (id_siswa, activity_type, result, notes, triggered_by)
           VALUES (?, 'Webhook Handoff', 'Paused by User Reply', ?, 'system')`,
          [idSiswa, `Siswa merespons: "${body}". Kampanye otomatis dihentikan dan diserahkan ke CRO.`]
        );
        console.log(`[Webhook:${tenantConfig.tenantId}] Snooze Handoff untuk siswa: ${idSiswa} (Respons: ${body})`);
      }
    }

    await conn.commit();
    console.log(`[Webhook:${tenantConfig.tenantId}] Pesan disimpan — conv:${convId}, dari:${fromPhone}`);

    // 7. Trigger Web Push Notification
    try {
      const webpush = require('web-push');
      if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
        webpush.setVapidDetails(
          'mailto:support@nexa.id',
          process.env.VAPID_PUBLIC_KEY,
          process.env.VAPID_PRIVATE_KEY
        );

        const [subs] = await conn.query('SELECT endpoint, p256dh, auth FROM push_subscriptions');
        if (subs.length > 0) {
          const payload = JSON.stringify({
            title: `Pesan baru dari ${fromName}`,
            body: body ? (body.length > 50 ? body.substring(0, 50) + '...' : body) : `[${msgType}]`,
            icon: '/nexa-icon.png'
          });

          subs.forEach(sub => {
            const pushSub = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } };
            webpush.sendNotification(pushSub, payload).catch(e => {
              console.error(`[WebPush] Failed to send to endpoint ${sub.endpoint.substring(0, 30)}... : ${e.message}`);
            });
          });
        }
      }
    } catch(pushErr) {
      console.error(`[WebPush] Trigger error:`, pushErr.message);
    }

  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      console.log(`[Webhook:${tenantConfig.tenantId}] Pesan duplikat diabaikan (Meta retry): ${metaMessageId}`);
    } else {
      console.error(`[Webhook:${tenantConfig.tenantId}] DB error:`, err.message);
    }
  } finally {
    conn.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDLER: Status Delivery Update
// ─────────────────────────────────────────────────────────────────────────────
async function handleStatusUpdate(pool, statusEvt) {
  const waMessageId = statusEvt.id;
  const status      = statusEvt.status;
  if (!waMessageId || !status) return;

  try {
    await pool.query(
      `UPDATE chat_messages SET status = ?
       WHERE meta_message_id = ? OR (direction = 'outgoing' AND from_phone = ? AND status != 'read')
       LIMIT 1`,
      [status, waMessageId, statusEvt.recipient_id || '']
    );
  } catch {
    // Abaikan jika kolom meta_message_id belum ada
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /webhook/test/:tenantSlug — HANYA DEV: Simulasi pesan masuk
// ─────────────────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  router.post('/test/:tenantSlug', resolveTenant, async (req, res) => {
    const { phone, message, studentName } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ status: 'error', message: 'phone & message wajib diisi' });
    }

    const fakeMsg = {
      id:        `SIM-${Date.now()}`,
      from:      String(phone).replace(/[^0-9]/g, ''),
      type:      'text',
      timestamp: String(Math.floor(Date.now() / 1000)),
      text:      { body: message },
    };
    const fakeContact = {
      wa_id:   phone,
      profile: { name: studentName || phone },
    };

    await handleIncomingMessage(req.tenantPool, fakeMsg, fakeContact, req.tenantConfig);
    res.json({ status: 'ok', message: 'Simulasi berhasil', simId: fakeMsg.id });
  });
}

module.exports = router;

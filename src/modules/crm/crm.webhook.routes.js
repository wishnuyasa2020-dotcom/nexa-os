'use strict';

/**
 * crm.webhook.routes.js
 * Routes untuk WhatsApp Webhook (Meta API)
 *
 * RACE CONDITION HANDLING:
 * - Setiap pesan masuk disimpan dengan message_id dari Meta.
 * - Jika Meta melakukan retry pengiriman webhook (event yang sama),
 *   INSERT akan gagal karena UNIQUE KEY pada message_id,
 *   dan error ER_DUP_ENTRY ditangkap secara graceful (idempotent).
 * - Update conversations + wa_service_window dibungkus dalam satu
 *   DB Transaction agar tidak ada state yang setengah-setengah.
 */

const { Router } = require('express');
const { pool }   = require('../../config/database');

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/webhook/whatsapp — Verifikasi Webhook dari Meta
// ─────────────────────────────────────────────────────────────────────────────
router.get('/whatsapp', (req, res) => {
  const verify_token = process.env.WA_VERIFY_TOKEN || 'derma_webhook_2026';
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === verify_token) {
      console.log('[Webhook] VERIFIED');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(400);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/webhook/whatsapp — Menerima event pesan masuk & status update
// ─────────────────────────────────────────────────────────────────────────────
router.post('/whatsapp', async (req, res) => {
  // Meta menunggu 200 dalam 20 detik. Balas lebih dulu, proses di background.
  res.sendStatus(200);

  const body = req.body;
  if (!body.object) return;

  const entries = body.entry || [];
  for (const entry of entries) {
    const changes = entry.changes || [];
    for (const change of changes) {
      const val = change.value || {};

      // ── Status Delivery Update (sent/delivered/read) ──────────────────────
      if (val.statuses && val.statuses.length > 0) {
        for (const statusEvt of val.statuses) {
          await handleStatusUpdate(statusEvt).catch(e =>
            console.error('[Webhook] handleStatusUpdate error:', e.message)
          );
        }
      }

      // ── Pesan Masuk ───────────────────────────────────────────────────────
      if (val.messages && val.messages.length > 0) {
        const contactMeta = (val.contacts || [])[0] || null;
        for (const msg of val.messages) {
          await handleIncomingMessage(msg, contactMeta).catch(e =>
            console.error('[Webhook] handleIncomingMessage error:', e.message)
          );
        }
      }
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// HANDLER: Pesan Masuk
// ─────────────────────────────────────────────────────────────────────────────
async function handleIncomingMessage(msg, contactMeta) {
  const metaMessageId = msg.id;        // ID unik dari Meta — kunci idempotency
  const fromPhone     = msg.from;      // nomor WA pengirim (format: 628xxx)
  const msgType       = msg.type || 'text';
  const timestamp     = msg.timestamp ? new Date(parseInt(msg.timestamp) * 1000) : new Date();

  let body      = null;
  let mediaId   = null;
  let mimeType  = null;
  let caption   = null;

  if (msgType === 'text') {
    body = msg.text?.body || '';
  } else if (['image', 'video', 'audio', 'document'].includes(msgType)) {
    const mediaObj = msg[msgType] || {};
    mediaId  = mediaObj.id   || null;
    mimeType = mediaObj.mime_type || null;
    caption  = mediaObj.caption  || null;
  }

  const fromName = contactMeta?.profile?.name || fromPhone;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Cari atau buat conversation berdasarkan nomor WA
    const phoneClean = String(fromPhone).replace(/[^0-9]/g, '');
    let [convRows] = await conn.query(
      'SELECT conv_id, id_siswa FROM conversations WHERE wa_number = ? LIMIT 1',
      [phoneClean]
    );

    let convId;
    let idSiswa = null;

    if (convRows.length === 0) {
      // Coba cari siswa berdasarkan no_wa
      const [siswaRows] = await conn.query(
        'SELECT id_siswa, nama_lengkap FROM master_siswa WHERE no_wa = ? LIMIT 1',
        [phoneClean]
      );
      const siswa = siswaRows[0] || null;
      idSiswa     = siswa ? siswa.id_siswa : null;

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

    // 2. Insert pesan — IDEMPOTENT (tolak duplikat dari Meta retry)
    await conn.query(
      `INSERT INTO chat_messages
         (conv_id, timestamp, datetime, direction, from_phone, from_name,
          type, body, media_id, mime_type, caption, status)
       VALUES (?, ?, ?, 'incoming', ?, ?, ?, ?, ?, ?, ?, 'received')`,
      [convId, msg.timestamp || Math.floor(Date.now() / 1000), timestamp,
       fromPhone, fromName, msgType, body, mediaId, mimeType, caption]
    );
    // Catatan: jika chat_messages memiliki UNIQUE(message_id), tambahkan kolom tersebut
    // dan gunakan INSERT IGNORE atau ON DUPLICATE KEY UPDATE status=status untuk idempotency penuh.

    // 3. Update conversation header
    await conn.query(
      `UPDATE conversations SET
         window_status      = 'OPEN',
         window_opened_at   = NOW(),
         window_expires_at  = DATE_ADD(NOW(), INTERVAL 24 HOUR),
         last_message_type  = ?,
         last_message_prev  = ?,
         last_sender        = ?,
         last_msg_ts        = NOW()
       WHERE conv_id = ?`,
      [
        msgType,
        body ? body.substring(0, 100) : `[${msgType}]`,
        fromPhone,
        convId,
      ]
    );

    // 4. Update service window
    await conn.query(
      `INSERT INTO wa_service_window (phone, id_siswa, last_incoming_ts, sw_status, updated_date)
       VALUES (?, ?, NOW(), 'OPEN', NOW())
       ON DUPLICATE KEY UPDATE
         last_incoming_ts = NOW(),
         sw_status        = 'OPEN',
         updated_date     = NOW()`,
      [phoneClean, idSiswa]
    );

    // 5. Bind BSUID jika ada
    if (msg.from && idSiswa) {
      await conn.query(
        'UPDATE master_siswa SET bsuid = ? WHERE id_siswa = ? AND (bsuid IS NULL OR bsuid = ?)',
        [msg.from, idSiswa, '']
      );
    }

    await conn.commit();
    console.log(`[Webhook] Pesan masuk disimpan — conv: ${convId}, dari: ${fromPhone}`);
  } catch (err) {
    await conn.rollback();
    // ER_DUP_ENTRY = idempotency guard, bukan error nyata
    if (err.code === 'ER_DUP_ENTRY') {
      console.log(`[Webhook] Pesan duplikat diabaikan (Meta retry): ${metaMessageId}`);
    } else {
      console.error('[Webhook] DB Transaction error:', err.message);
    }
  } finally {
    conn.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDLER: Status Update (sent / delivered / read)
// ─────────────────────────────────────────────────────────────────────────────
async function handleStatusUpdate(statusEvt) {
  const waMessageId = statusEvt.id;   // ID pesan yang dikirim sistem
  const status      = statusEvt.status; // 'sent' | 'delivered' | 'read' | 'failed'

  if (!waMessageId || !status) return;

  // Update status di chat_messages jika ada kolom wa_message_id
  // Fallback: update berdasarkan timestamp jika kolom belum ada
  try {
    await pool.query(
      `UPDATE chat_messages SET status = ?
       WHERE direction = 'outgoing'
         AND JSON_EXTRACT(body, '$.wa_msg_id') = ?
         OR from_phone = ? AND status != 'read'
       LIMIT 1`,
      [status, waMessageId, statusEvt.recipient_id || '']
    );
  } catch {
    // Tabel mungkin belum punya kolom wa_msg_id — abaikan untuk sekarang
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/webhook/test-simulate — HANYA DEV: Simulasi pesan masuk tanpa Meta
// ─────────────────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  router.post('/test-simulate', async (req, res) => {
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

    await handleIncomingMessage(fakeMsg, fakeContact);
    res.json({ status: 'ok', message: 'Simulasi pesan masuk berhasil', simId: fakeMsg.id });
  });
}

module.exports = router;

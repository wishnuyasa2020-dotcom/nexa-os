'use strict';

/**
 * chat.service.js
 * Service layer untuk Modul Chat (Inbox & Pengiriman Pesan)
 *
 * SMART ROUTING LOGIC:
 * - Jika wa_service_window.sw_status === 'OPEN' (< 24 jam sejak pesan masuk terakhir):
 *   → Kirim sebagai TEKS BIASA (lebih murah, tidak kena tarif template Meta)
 * - Jika wa_service_window.sw_status === 'CLOSED':
 *   → Harus kirim sebagai META TEMPLATE (hanya jika meta_status = 'APPROVED')
 *   → Jika template tidak approved → tolak, kembalikan error ke frontend
 *
 * ANTI-RACE CONDITION:
 * - Semua INSERT pesan + UPDATE conversation dibungkus DB Transaction
 * - Pengecekan SW status menggunakan SELECT ... FOR UPDATE (row-lock)
 *   agar dua request bersamaan tidak mengambil keputusan routing yang berbeda.
 */

const { pool } = require('../../../config/database');

const axios    = require('axios');

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/chats — Daftar percakapan aktif
// ─────────────────────────────────────────────────────────────────────────────
async function getConversationList(user, query = {}) {
  const page    = Math.max(1, parseInt(query.page  || '1',  10));
  const limit   = Math.min(100, Math.max(1, parseInt(query.limit || '30', 10)));
  const offset  = (page - 1) * limit;
  const tab     = query.tab || 'all';      // 'all' | 'unread' | 'waiting'
  const search  = query.search || '';

  console.log(`[Chat] getConversationList - user: ${user.username} (${user.role}), tenantId: ${user.tenantId || 'default'}, tab: ${tab}`);

  const whereParts = [];
  const params     = [];

  if (search) {
    whereParts.push('(c.student_name LIKE ? OR c.wa_number LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  if (tab === 'unread') {
    whereParts.push('(SELECT COUNT(*) FROM chat_messages cm WHERE cm.conv_id = c.conv_id AND cm.direction = "incoming" AND cm.status != "read") > 0');
  } else if (tab === 'waiting') {
    whereParts.push('c.last_sender != ? OR c.last_sender IS NULL');
    params.push('system');
  }

  if (user.role === 'CRO') {
    // CRO hanya melihat konversasi yang terkait dengan siswa mereka
    whereParts.push(`EXISTS (
      SELECT 1 FROM siswa_periode sp
      WHERE sp.id_siswa = c.id_siswa AND sp.cro = ?
    )`);
    params.push(user.nama);
  } else if (user.role === 'Chief CRO') {
    // Chief CRO melihat chat orphaned (id_siswa IS NULL) 
    // DAN chat milik CRO bawahannya ATAU miliknya sendiri
    whereParts.push(`(
      c.id_siswa IS NULL OR EXISTS (
        SELECT 1 FROM siswa_periode sp
        WHERE sp.id_siswa = c.id_siswa AND (
          sp.cro = ? OR sp.cro IN (
            SELECT nama FROM users WHERE supervisor_id = ?
          )
        )
      )
    )`);
    params.push(user.nama, user.id);
  }

  const where = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM conversations c ${where}`, params
  );

  console.log(`[Chat] Total conversations found: ${total} (where: "${where || 'none'}")`);

  // Hitung unread count per konversasi secara dinamis
  const [rows] = await pool.query(
    `SELECT
       c.conv_id,
       c.id_siswa,
       c.wa_number,
       c.student_name,
       c.status,
       c.window_status,
       c.window_opened_at,
       c.window_expires_at,
       c.last_message_type,
       c.last_message_prev,
       c.last_sender,
       c.last_msg_ts,
       c.created_at,
       sp.status_terkini AS pipeline_status,
       (SELECT COUNT(*) FROM chat_messages cm
        WHERE cm.conv_id = c.conv_id
          AND cm.direction = 'incoming'
          AND (cm.status IS NULL OR cm.status != 'read')
       ) AS unread_count
     FROM conversations c
     LEFT JOIN siswa_periode sp ON sp.id_siswa = c.id_siswa
     ${where}
     ORDER BY c.last_msg_ts DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return {
    data:  rows.map(r => ({
      ...r,
      window_status: r.window_status ? String(r.window_status).toUpperCase() : 'CLOSED',
    })),
    total: parseInt(total, 10),
    page,
    limit,
  };
}

async function initiateConversation(id_siswa, user) {
  console.log(`[Chat] initiateConversation dipanggil untuk id_siswa: ${id_siswa}`);
  // Check if conversation already exists
  const [existing] = await pool.query(
    'SELECT conv_id FROM conversations WHERE id_siswa = ? LIMIT 1',
    [id_siswa]
  );
  if (existing.length > 0) {
    console.log(`[Chat] Percakapan sudah ada: ${existing[0].conv_id}`);
    return { conv_id: existing[0].conv_id };
  }

  console.log(`[Chat] Percakapan belum ada, mengambil detail siswa...`);
  // If not, fetch student details
  const [studentRows] = await pool.query(
    'SELECT wa, bsuid, nama_lengkap FROM master_siswa WHERE id_siswa = ?',
    [id_siswa]
  );

  if (studentRows.length === 0) {
    console.log(`[Chat] Siswa tidak ditemukan!`);
    throw new Error('Siswa tidak ditemukan di master_siswa');
  }

  const student = studentRows[0];
  const waNumber = student.wa || student.bsuid;
  console.log(`[Chat] Siswa ditemukan: ${student.nama_lengkap}, WA/BSUID: ${waNumber}`);

  if (!waNumber) {
    throw new Error('Siswa tidak memiliki nomor WA atau BSUID yang bisa dihubungi');
  }

  // Create new conversation with generated UUID
  console.log(`[Chat] Membuat ID percakapan baru...`);
  const { v4: uuidv4 } = require('uuid');
  const conv_id = uuidv4();
  console.log(`[Chat] ID baru: ${conv_id}. Menyimpan ke DB...`);

  await pool.query(
    `INSERT INTO conversations (conv_id, id_siswa, wa_number, student_name, created_by, status, window_status, created_at, last_msg_ts)
     VALUES (?, ?, ?, ?, ?, 'active', 'CLOSED', NOW(), NOW())`,
    [conv_id, id_siswa, waNumber, student.nama_lengkap, user.nama]
  );

  console.log(`[Chat] Percakapan berhasil dibuat dengan ID: ${conv_id}`);
  return { conv_id };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/chats/:convId/messages — Riwayat pesan dalam satu percakapan
// ─────────────────────────────────────────────────────────────────────────────
async function getMessages(convId, query = {}) {
  const limit  = Math.min(100, Math.max(1, parseInt(query.limit  || '50', 10)));
  const before = query.before || null; // cursor: message_id untuk infinite scroll

  let sql = `SELECT * FROM chat_messages WHERE conv_id = ?`;
  const params = [convId];

  if (before) {
    // Note: jika before dipakai, harusnya menggunakan datetime dari message tersebut,
    // tapi karena saat ini ui belum pass 'before', kita fallback dulu ke id.
    sql += ' AND message_id < ?';
    params.push(before);
  }

  sql += ' ORDER BY datetime DESC, timestamp DESC LIMIT ?';
  params.push(limit);

  const [messages] = await pool.query(sql, params);

  // Kembalikan urutan kronologis (oldest first)
  return messages.reverse();
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/chats/:convId/send — Kirim Pesan (Smart Routing)
// ─────────────────────────────────────────────────────────────────────────────
async function sendMessage(convId, payload, user) {
  const { text, templateId } = payload;

  if (!text && !templateId) {
    throw new Error('Pesan teks atau templateId harus diisi.');
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Ambil data conversation + LOCK baris agar tidak ada race condition
    //    dua request bersamaan yang memeriksa SW status secara berbeda
    const [[conv]] = await conn.query(
      'SELECT * FROM conversations WHERE conv_id = ? LIMIT 1 FOR UPDATE',
      [convId]
    );

    if (!conv) throw new Error('Percakapan tidak ditemukan.');

    const phone = conv.wa_number;

    // 2. Hitung status Service Window secara real-time dari wa_service_window
    const [[swRow]] = await conn.query(
      'SELECT * FROM wa_service_window WHERE phone = ? LIMIT 1',
      [phone]
    );

    const isSwOpen = swRow
      ? isServiceWindowOpen(swRow.last_incoming_ts)
      : false;

    let finalBody       = text || null;
    let sentAsTemplate  = false;
    let templatePayload = null;

    // 3. SMART ROUTING
    if (templateId) {
      const [[tmpl]] = await conn.query(
        'SELECT * FROM wa_templates WHERE id_template = ? AND status_crm = "ACTIVE" LIMIT 1',
        [templateId]
      );

      if (!tmpl) throw new Error('Template tidak ditemukan atau tidak aktif.');

      // Resolve variabel template dengan data siswa
      finalBody = resolveTemplateVariables(tmpl.body_text, {
        student_name: conv.student_name,
        phone,
      });

      if (isSwOpen) {
        // SW OPEN → kirim sebagai teks biasa (hemat biaya)
        sentAsTemplate = false;
      } else {
        // SW CLOSED → harus pakai Meta Template
        if (tmpl.meta_status !== 'APPROVED') {
          throw new Error(
            `Gagal: Jeda respons melebihi 24 jam. Template "${tmpl.nama_template}" belum disetujui Meta sehingga tidak dapat dikirim di luar Service Window.`
          );
        }
        sentAsTemplate  = true;
        templatePayload = tmpl;
      }
    } else if (!isSwOpen) {
      // Teks bebas di luar SW → tolak
      throw new Error(
        'Service Window sudah tertutup (> 24 jam). Gunakan Template Pesan untuk memulai ulang percakapan.'
      );
    }

    // 4. Kirim ke Meta WhatsApp Cloud API
    let waMessageId = null;
    try {
      waMessageId = await sendToMetaApi(phone, finalBody, sentAsTemplate ? templatePayload : null);
    } catch (metaErr) {
      // Jika Meta gagal — tetap simpan sebagai 'failed', jangan rollback
      console.error('[Chat] Meta API error:', metaErr.message);
    }

    // 5. Simpan pesan ke DB
    const nowTs = Math.floor(Date.now() / 1000);
    const msgIdToInsert = waMessageId || `local-${Date.now()}-${Math.floor(Math.random()*1000)}`;
    await conn.query(
      `INSERT INTO chat_messages
         (message_id, conv_id, timestamp, datetime, direction, from_phone, from_name,
          type, body, status)
       VALUES (?, ?, ?, NOW(), 'outgoing', 'system', ?, 'text', ?, ?)`,
      [
        msgIdToInsert,
        convId,
        nowTs,
        user.nama || 'CRO',
        finalBody,
        waMessageId ? 'sent' : 'failed',
      ]
    );

    // 6. Update conversation header
    await conn.query(
      `UPDATE conversations SET
         last_message_type = 'text',
         last_message_prev = ?,
         last_sender       = ?,
         last_msg_ts       = NOW()
       WHERE conv_id = ?`,
      [
        (finalBody || '').substring(0, 100),
        user.nama || 'CRO',
        convId,
      ]
    );

    // 7. Jika kirim template berhasil → update last_template_sent di service window
    if (sentAsTemplate && waMessageId && swRow) {
      await conn.query(
        `UPDATE wa_service_window SET
           last_template_sent = NOW(),
           last_template_name = ?,
           updated_date       = NOW()
         WHERE phone = ?`,
        [templatePayload?.template_name_api || '', phone]
      );
    }

    await conn.commit();

    return {
      success:       !!waMessageId,
      sentAs:        sentAsTemplate ? 'meta_template' : 'free_text',
      waMessageId,
      body:          finalBody,
    };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Cek apakah Service Window masih terbuka (< 24 jam)
// ─────────────────────────────────────────────────────────────────────────────
function isServiceWindowOpen(lastIncomingTs) {
  if (!lastIncomingTs) return false;
  const last    = new Date(lastIncomingTs).getTime();
  const now     = Date.now();
  const diff24h = 24 * 60 * 60 * 1000;
  return (now - last) < diff24h;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Resolve placeholder {{1}}, {{2}} pada body_text template
// ─────────────────────────────────────────────────────────────────────────────
function resolveTemplateVariables(bodyText, data = {}) {
  const vars = [
    data.student_name || '',
    data.phone        || '',
    data.school_name  || '',
  ];
  return bodyText.replace(/\{\{(\d+)\}\}/g, (_, idx) => vars[parseInt(idx) - 1] || '');
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Kirim ke Meta WhatsApp Cloud API
// ─────────────────────────────────────────────────────────────────────────────
async function sendToMetaApi(toPhone, text, templatePayload = null) {
  const phoneId   = process.env.WA_PHONE_ID;
  const token     = process.env.WA_ACCESS_TOKEN;

  // Jika credential belum di-setup, kembalikan null (dev mode)
  if (!phoneId || !token) {
    console.warn('[Chat] WA_PHONE_ID / WA_ACCESS_TOKEN belum di-set. Pesan tidak dikirim ke Meta (dev mode).');
    return `DEV-MSG-${Date.now()}`;
  }

  const url = `https://graph.facebook.com/v19.0/${phoneId}/messages`;

  let msgBody;
  if (templatePayload) {
    // Kirim sebagai Meta Template
    const parameters = JSON.parse(templatePayload.parameters || '[]');
    msgBody = {
      messaging_product: 'whatsapp',
      to:   toPhone,
      type: 'template',
      template: {
        name:     templatePayload.template_name_api,
        language: { code: templatePayload.language_code || 'id' },
        components: parameters.length > 0 ? [{
          type:       'body',
          parameters: parameters.map(v => ({ type: 'text', text: String(v) })),
        }] : [],
      },
    };
  } else {
    // Kirim sebagai teks biasa
    msgBody = {
      messaging_product: 'whatsapp',
      to:      toPhone,
      type:    'text',
      text:    { body: text },
    };
  }

  const response = await axios.post(url, msgBody, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    timeout: 10000,
  });

  return response.data?.messages?.[0]?.id || null;
}

module.exports = {
  getConversationList,
  initiateConversation,
  getMessages,
  sendMessage,
  isServiceWindowOpen,
};

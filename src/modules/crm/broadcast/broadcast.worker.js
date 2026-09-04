'use strict';

/**
 * broadcast.worker.js
 * Background worker untuk memproses antrian broadcast WA.
 *
 * MIGRASI DARI GAS:
 *  Sebelumnya logika ini ada di Google Apps Script (processBroadcastQueue)
 *  dengan Time-based Trigger setiap 1 menit.
 *  File ini adalah port 1:1 ke Node.js.
 *
 * CARA KERJA:
 *  1. Ambil baris status='antri' dari broadcast_queue (LIMIT per batch)
 *  2. Kirim ke Meta WA Cloud API via sendToMetaApi()
 *  3. Update status → 'terkirim' atau 'gagal'
 *  4. Update counter di tabel `broadcast` (total_success, total_failed, total_pending)
 *
 * MULTI-TENANT BYOW:
 *  Credentials WA (token, phoneId) dibaca dari nexamain.tenants
 *  berdasarkan tenant_id yang disimpan di broadcast_queue.
 *
 * KEAMANAN CONCURRENCY:
 *  - Setiap baris di-lock dengan UPDATE ... WHERE status='antri' LIMIT 1
 *    sebelum diproses agar tidak ada double-send jika ada dua worker jalan.
 *  - Gunakan PM2 instance_var: 'NODE_APP_INSTANCE' dan hanya jalankan
 *    worker di instance 0 jika multi-process.
 */

const { pool, mainPool } = require('../../../config/database');
const axios              = require('axios');

// ── Konfigurasi ──────────────────────────────────────────────────────────────
const BATCH_SIZE    = 10;   // Jumlah pesan yang diproses per run
const META_API_VER  = 'v19.0';
const META_TIMEOUT  = 12000; // ms

// ── State flag agar tidak overlap jika satu run belum selesai ────────────────
let _isRunning = false;

// ── Helper: baca credentials BYOW dari nexamain.tenants ──────────────────────
async function _getCredentials(tenantId) {
  // Coba baca dari nexamain.tenants dulu (BYOW multi-tenant)
  if (mainPool && tenantId) {
    try {
      const [rows] = await mainPool.query(
        'SELECT whatsapp_phone_id, whatsapp_access_token FROM tenants WHERE tenant_id = ? LIMIT 1',
        [tenantId]
      );
      if (rows.length > 0 && rows[0].whatsapp_access_token) {
        return {
          phoneId: rows[0].whatsapp_phone_id,
          token:   rows[0].whatsapp_access_token,
        };
      }
    } catch (e) {
      console.warn('[Broadcast Worker] Gagal baca credentials dari DB, fallback ke .env:', e.message);
    }
  }

  // Fallback ke .env (dev mode / single-tenant lama)
  return {
    phoneId: process.env.WA_PHONE_ID || process.env.WA_PHONE_NUMBER_ID,
    token:   process.env.WA_ACCESS_TOKEN,
  };
}

// ── Helper: kirim 1 pesan ke Meta WA Cloud API ───────────────────────────────
async function _sendToMeta({ phoneId, token, toPhone, templateNameApi, languageCode, parameters }) {
  if (!phoneId || !token) {
    console.warn('[Broadcast Worker] Credentials belum di-set. Pesan tidak dikirim (dev mode).');
    return { wamid: `DEV-${Date.now()}`, dev: true };
  }

  // Parse parameters: bisa berupa JSON string atau array
  let parsedParams = [];
  if (parameters) {
    try {
      const raw = typeof parameters === 'string' ? JSON.parse(parameters) : parameters;
      // Support format: { body: [...], buttons: [...] } atau array lama
      parsedParams = Array.isArray(raw) ? raw : (raw.body || []);
    } catch {
      parsedParams = [];
    }
  }

  const components = [];

  // Body component dengan parameter (jika ada variabel {{1}}, {{2}}, dst)
  if (parsedParams.length > 0) {
    components.push({
      type:       'body',
      parameters: parsedParams.map(v => ({ type: 'text', text: String(v) })),
    });
  }

  const payload = {
    messaging_product: 'whatsapp',
    to:   toPhone,
    type: 'template',
    template: {
      name:       templateNameApi,
      language:   { code: languageCode || 'id' },
      components,
    },
  };

  const resp = await axios.post(
    `https://graph.facebook.com/${META_API_VER}/${phoneId}/messages`,
    payload,
    {
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: META_TIMEOUT,
    }
  );

  return { wamid: resp.data?.messages?.[0]?.id || null };
}

// ── Main Worker: proses 1 batch dari broadcast_queue (per tenant) ──────────
async function processBroadcastQueue(credentials) {
  let processed = 0;
  let success   = 0;
  let failed    = 0;
  
  const phoneId = credentials?.phoneId;
  const token = credentials?.token;

  try {
      const [rows] = await pool.query(
      `SELECT
         bq.id_queue,
         bq.id_broadcast,
         bq.id_siswa,
         bq.wa_number,
         bq.template_name_api,
         bq.language_code,
         wt.parameters
       FROM broadcast_queue bq
       LEFT JOIN wa_templates wt ON wt.template_name_api = bq.template_name_api
       WHERE bq.status = 'antri'
       LIMIT ?
       FOR UPDATE SKIP LOCKED`,
      [BATCH_SIZE]
    );

    if (rows.length === 0) {
      return { processed: 0, success: 0, failed: 0 };
    }

    // Tandai semua sebagai 'processing' dulu (atomic)
    const queueIds = rows.map(r => r.id_queue);
    await pool.query(
      `UPDATE broadcast_queue SET status = 'processing' WHERE id_queue IN (${queueIds.map(() => '?').join(',')})`,
      queueIds
    );

    // Proses satu per satu
    for (const row of rows) {
      processed++;

      try {
        const { wamid } = await _sendToMeta({
          phoneId,
          token,
          toPhone:         row.wa_number,
          templateNameApi: row.template_name_api,
          languageCode:    row.language_code,
          parameters:      row.parameters,
        });

        // Update status → terkirim
        await pool.query(
          `UPDATE broadcast_queue
             SET status = 'terkirim', wa_message_id = ?, processed_at = NOW()
           WHERE id_queue = ?`,
          [wamid, row.id_queue]
        );

        // Update counter broadcast header
        await pool.query(
          `UPDATE \`broadcast\`
             SET total_success = total_success + 1,
                 total_pending = GREATEST(total_pending - 1, 0)
           WHERE id_broadcast = ?`,
          [row.id_broadcast]
        );

        success++;

      } catch (sendErr) {
        const errMsg = sendErr.response?.data?.error?.message || sendErr.message;
        console.error(`[Broadcast Worker] ❌ Gagal kirim ke ${row.wa_number}: ${errMsg}`);

        // Update status → gagal
        await pool.query(
          `UPDATE broadcast_queue
             SET status = 'gagal', error_message = ?, processed_at = NOW()
           WHERE id_queue = ?`,
          [errMsg.substring(0, 500), row.id_queue]
        );

        // Update counter broadcast header
        await pool.query(
          `UPDATE \`broadcast\`
             SET total_failed  = total_failed + 1,
                 total_pending = GREATEST(total_pending - 1, 0)
           WHERE id_broadcast = ?`,
          [row.id_broadcast]
        );

        failed++;
      }
    }

    // Cek apakah semua antrian broadcast sudah selesai → update status broadcast
    if (rows.length > 0) {
      const broadcastIds = [...new Set(rows.map(r => r.id_broadcast))];
      for (const bcId of broadcastIds) {
        const [[stat]] = await pool.query(
          `SELECT
             SUM(CASE WHEN status = 'antri' OR status = 'processing' THEN 1 ELSE 0 END) AS remaining
           FROM broadcast_queue WHERE id_broadcast = ?`,
          [bcId]
        );
        if (parseInt(stat.remaining, 10) === 0) {
          await pool.query(
            `UPDATE \`broadcast\` SET status = 'selesai' WHERE id_broadcast = ?`,
            [bcId]
          );
          console.log(`[Broadcast Worker] ✅ Campaign ${bcId} selesai.`);
        }
      }
    }

    return { processed, success, failed };

  } catch (err) {
    console.error('[Broadcast Worker] ❌ Error fatal:', err.message);
    return { processed, success, failed, error: err.message };
  }
}

// ── Init: daftarkan cron setiap 1 menit ──────────────────────────────────────
function initBroadcastWorker() {
  const cron = require('node-cron');
  const { tenantStorage } = require('../../../config/database');

  cron.schedule('* * * * *', async () => {
    if (_isRunning) {
      console.log('[Broadcast Worker] Masih berjalan, skip tick ini.');
      return;
    }
    _isRunning = true;

    try {
      const [tenants] = await mainPool.query(
        'SELECT tenant_id, whatsapp_phone_id, whatsapp_access_token FROM tenants WHERE status = "ACTIVE"'
      );

      for (const tenant of tenants) {
        if (!tenant.tenant_id) continue;
        
        await tenantStorage.run(tenant.tenant_id, async () => {
          try {
            const credentials = {
              phoneId: tenant.whatsapp_phone_id,
              token: tenant.whatsapp_access_token
            };
            const result = await processBroadcastQueue(credentials);
            if (result.processed > 0) {
              console.log(`[Broadcast Worker][${tenant.tenant_id}] ⚡ Proses: ${result.processed} | ✅ ${result.success} terkirim | ❌ ${result.failed} gagal`);
            }
          } catch (e) {
            console.error(`[Broadcast Worker][${tenant.tenant_id}] error:`, e.message);
          }
        });
      }
    } catch (err) {
      console.error('[Broadcast Worker] Error fetching tenants:', err.message);
    } finally {
      _isRunning = false;
    }

  }, {
    scheduled: true,
    timezone:  'Asia/Jakarta',
  });

  console.log('[Broadcast Worker] Scheduler terdaftar → setiap 1 menit (Multi-Tenant).');
}

module.exports = { initBroadcastWorker, processBroadcastQueue };

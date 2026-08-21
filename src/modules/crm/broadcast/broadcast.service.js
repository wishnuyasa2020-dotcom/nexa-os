'use strict';

/**
 * broadcast.service.js
 * Service layer untuk Modul Broadcast
 *
 * Schema tabel nyata di DB:
 * - `broadcast`       → header campaign (bukan broadcast_campaigns)
 * - `broadcast_queue` → antrian per siswa (dibaca GAS Worker)
 * - `wa_templates`    → template WA (meta & CRM)
 */

const { pool } = require('../../../config/database');
const crypto   = require('crypto');

// ─────────────────────────────────────────────────────────────────────────────
// HELPER
// ─────────────────────────────────────────────────────────────────────────────
function generateQueueId() {
  return `BQ-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function generateBroadcastId() {
  return `BC-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

async function getActivePeriod() {
  const [rows] = await pool.query(
    "SELECT nama_period FROM marketing_period WHERE status = 'aktif' ORDER BY created_date DESC LIMIT 1"
  );
  return rows.length > 0 ? rows[0].nama_period : '-';
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/broadcast/audience
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Daftar siswa sebagai target broadcast.
 * isSwOpen dihitung dinamis di SQL (bukan frontend).
 */
async function getAudience(user, query = {}) {
  const page   = Math.max(1, parseInt(query.page  || '1',  10));
  const limit  = Math.min(200, Math.max(1, parseInt(query.limit || '50', 10)));
  const offset = (page - 1) * limit;
  const search = query.search || '';
  const status = query.statusPipeline || '';

  let mp = query.period || user.selectedPeriod;
  if (!mp || mp === '-') mp = await getActivePeriod();

  const whereParts = ['sp.marketing_period = ?'];
  const params     = [mp];

  if (user.role === 'CRO') {
    whereParts.push('sp.cro = ?');
    params.push(user.nama);
  }

  if (search) {
    const s = `%${search}%`;
    whereParts.push('(ms.nama_lengkap LIKE ? OR sek.nama_sekolah LIKE ?)');
    params.push(s, s);
  }

  if (status) {
    whereParts.push('sp.status_terkini = ?');
    params.push(status);
  }

  const where = whereParts.join(' AND ');

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM siswa_periode sp
     LEFT JOIN master_siswa   ms  ON sp.id_siswa   = ms.id_siswa
     LEFT JOIN master_sekolah sek ON ms.id_sekolah = sek.id_sekolah
     WHERE ${where}`,
    params
  );
  const totalCount = parseInt(total, 10);

  if (totalCount === 0) {
    return { data: [], meta: { total: 0, page, limit, totalPages: 0 } };
  }

  const dataSql = `
    SELECT
      ms.id_siswa                                AS id,
      ms.nama_lengkap                            AS nama,
      IFNULL(sek.nama_sekolah, '-')              AS sekolah,
      IFNULL(ms.wa, '')                          AS phone,
      IFNULL(sp.status_terkini, '')              AS statusPipeline,
      CASE
        WHEN sw.sw_status = 'open' THEN 1
        WHEN sw.last_incoming_ts IS NOT NULL
         AND TIMESTAMPDIFF(HOUR, sw.last_incoming_ts, NOW()) <= 24
        THEN 1
        ELSE 0
      END                                        AS isSwOpen
    FROM siswa_periode sp
    LEFT JOIN master_siswa   ms  ON sp.id_siswa   = ms.id_siswa
    LEFT JOIN master_sekolah sek ON ms.id_sekolah = sek.id_sekolah
    LEFT JOIN wa_service_window sw ON sw.id_siswa = ms.id_siswa
    WHERE ${where}
    ORDER BY ms.nama_lengkap ASC
    LIMIT ? OFFSET ?
  `;

  const [rows] = await pool.query(dataSql, [...params, limit, offset]);
  const data = rows.map(r => ({ ...r, isSwOpen: r.isSwOpen === 1 }));

  return {
    data,
    meta: { total: totalCount, page, limit, totalPages: Math.ceil(totalCount / limit) },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/broadcast/history
// Tabel: `broadcast` (schema asli dari GAS)
// ─────────────────────────────────────────────────────────────────────────────
async function getBroadcastHistory(user, query = {}) {
  const page   = Math.max(1, parseInt(query.page  || '1',  10));
  const limit  = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));
  const offset = (page - 1) * limit;

  const whereParts = [];
  const params     = [];

  if (user.role === 'CRO') {
    whereParts.push('b.created_by = ?');
    params.push(user.nama);
  }

  const where = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM \`broadcast\` b ${where}`,
    params
  );
  const totalCount = parseInt(total, 10);

  const [rows] = await pool.query(
    `SELECT
       b.id_broadcast            AS id,
       b.template_display_name   AS templateName,
       b.template_name_api       AS templateNameApi,
       b.marketing_period        AS marketingPeriod,
       b.status_pipeline         AS statusPipeline,
       b.total_target            AS targetCount,
       b.total_success           AS sentCount,
       b.total_failed            AS failedCount,
       b.total_pending           AS pendingCount,
       b.status,
       b.created_by              AS createdBy,
       DATE_FORMAT(b.created_at,   '%Y-%m-%dT%T+07:00') AS createdAt,
       DATE_FORMAT(b.completed_at, '%Y-%m-%dT%T+07:00') AS completedAt
     FROM \`broadcast\` b
     ${where}
     ORDER BY b.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return {
    data: rows,
    meta: { total: totalCount, page, limit, totalPages: Math.ceil(totalCount / limit) },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/broadcast/templates/meta
// Tabel: wa_templates (status_meta = 'APPROVED')
// ─────────────────────────────────────────────────────────────────────────────
async function getMetaTemplates() {
  const [rows] = await pool.query(
    `SELECT
       id_template            AS id,
       nama_template          AS name,
       template_name_api      AS templateNameApi,
       language_code          AS language,
       kategori,
       body_text              AS bodyText,
       parameters,
       status_meta            AS status,
       meta_quality_rating    AS qualityRating
     FROM wa_templates
     WHERE status_meta = 'APPROVED'
       AND status_crm  = 'Aktif'
     ORDER BY nama_template ASC`
  );
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/broadcast/templates/crm
// Template internal (teks biasa / service message — untuk SW Terbuka)
// ─────────────────────────────────────────────────────────────────────────────
async function getCrmTemplates() {
  // CRM template = row di wa_templates yang pipeline-nya tidak kosong
  // dan belum submit ke Meta (status_meta NULL / kosong / 'NONE')
  const [rows] = await pool.query(
    `SELECT
       id_template            AS id,
       nama_template          AS name,
       template_name_api      AS templateNameApi,
       body_text              AS previewText,
       pipeline,
       urutan
     FROM wa_templates
     WHERE status_crm = 'Aktif'
       AND (status_meta IS NULL OR status_meta = '' OR status_meta NOT IN ('APPROVED','PENDING','REJECTED'))
     ORDER BY urutan ASC, nama_template ASC`
  );

  // Fallback: coba tabel broadcast_templates_crm jika ada
  if (rows.length === 0) {
    try {
      const [alt] = await pool.query(
        `SELECT id, name, preview_text AS previewText, '' AS templateNameApi
         FROM broadcast_templates_crm
         ORDER BY name ASC`
      );
      return alt;
    } catch (_) {
      return [];
    }
  }

  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/broadcast/send
// Tabel: `broadcast` (header) + `broadcast_queue` (per siswa)
// GAS Worker membaca broadcast_queue dan melakukan pengiriman WA.
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Payload: {
 *   targetIds[],        — id_siswa yang dipilih
 *   metaTemplateId,     — id_template dari wa_templates (untuk SW Tertutup)
 *   crmTemplateId,      — id_template dari wa_templates (untuk SW Terbuka)
 *   namaCampaign?,      — label display campaign
 * }
 *
 * Logika:
 * - SW Terbuka  (isSwOpen=true)  → gunakan CRM template
 * - SW Tertutup (isSwOpen=false) → gunakan Meta template
 * GAS Worker membaca template_name_api per baris di broadcast_queue.
 */
async function createBroadcastJob(user, body = {}) {
  const { targetIds, metaTemplateId, crmTemplateId } = body;

  if (!targetIds || !Array.isArray(targetIds) || targetIds.length === 0) {
    throw new Error('targetIds harus berupa array dan tidak boleh kosong.');
  }
  if (!metaTemplateId && !crmTemplateId) {
    throw new Error('Minimal satu template (meta atau CRM) harus dipilih.');
  }

  // Ambil info template yang dipilih
  let metaTemplate = null;
  let crmTemplate  = null;

  if (metaTemplateId) {
    const [rows] = await pool.query(
      'SELECT id_template, nama_template, template_name_api, language_code FROM wa_templates WHERE id_template = ? LIMIT 1',
      [metaTemplateId]
    );
    if (rows.length > 0) metaTemplate = rows[0];
  }

  if (crmTemplateId) {
    const [rows] = await pool.query(
      'SELECT id_template, nama_template, template_name_api, language_code FROM wa_templates WHERE id_template = ? LIMIT 1',
      [crmTemplateId]
    );
    if (rows.length > 0) crmTemplate = rows[0];
  }

  // Ambil data siswa yang dipilih + kalkulasi isSwOpen
  let mp = user.selectedPeriod;
  if (!mp || mp === '-') mp = await getActivePeriod();

  const placeholders = targetIds.map(() => '?').join(',');
  const [siswaRows] = await pool.query(
    `SELECT
       ms.id_siswa,
       ms.nama_lengkap  AS nama_siswa,
       ms.wa            AS wa_number,
       CASE
         WHEN sw.sw_status = 'open' THEN 1
         WHEN sw.last_incoming_ts IS NOT NULL
          AND TIMESTAMPDIFF(HOUR, sw.last_incoming_ts, NOW()) <= 24
         THEN 1
         ELSE 0
       END              AS isSwOpen
     FROM master_siswa ms
     LEFT JOIN wa_service_window sw ON sw.id_siswa = ms.id_siswa
     WHERE ms.id_siswa IN (${placeholders})`,
    targetIds
  );

  if (siswaRows.length === 0) {
    throw new Error('Tidak ada siswa valid yang ditemukan dari targetIds yang diberikan.');
  }

  // Tentukan template display untuk header campaign
  // Header menggunakan Meta template (atau CRM jika Meta tidak ada)
  const primaryTemplate = metaTemplate || crmTemplate;
  const broadcastId     = generateBroadcastId();
  const now             = new Date();

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // ── 1. Insert ke tabel `broadcast` (header campaign) ──────────────────
    await conn.query(
      `INSERT INTO \`broadcast\`
         (id_broadcast, marketing_period, template_id, template_name_api,
          template_display_name, total_target, total_success, total_failed,
          total_pending, status, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, 'antri', ?, ?)`,
      [
        broadcastId,
        mp,
        primaryTemplate?.id_template  || null,
        primaryTemplate?.template_name_api || null,
        primaryTemplate?.nama_template || 'Campaign Broadcast',
        siswaRows.length,
        siswaRows.length,   // total_pending = total target awal
        user.nama,
        now,
      ]
    );

    // ── 2. Insert ke broadcast_queue per siswa ────────────────────────────
    // GAS Worker membaca tabel ini dan mengirim WA sesuai template_name_api
    const queueRows = siswaRows.map(s => {
      const useMetaTemplate = !s.isSwOpen; // SW tertutup → Meta
      const tpl = useMetaTemplate ? metaTemplate : crmTemplate;

      // Jika salah satu template tidak tersedia, fallback ke yang ada
      const activeTpl = tpl || metaTemplate || crmTemplate;

      return [
        generateQueueId(),   // id_queue
        broadcastId,          // id_broadcast
        s.id_siswa,           // id_siswa
        s.nama_siswa,         // nama_siswa
        s.wa_number,          // wa_number
        activeTpl?.template_name_api || '',  // template_name_api
        activeTpl?.language_code     || 'id', // language_code
        'antri',              // status
        now,                  // created_at
      ];
    });

    if (queueRows.length > 0) {
      await conn.query(
        `INSERT INTO broadcast_queue
           (id_queue, id_broadcast, id_siswa, nama_siswa, wa_number,
            template_name_api, language_code, status, created_at)
         VALUES ?`,
        [queueRows]
      );
    }

    await conn.commit();

    return {
      jobId      : broadcastId,
      message    : 'Broadcast job queued successfully.',
      targetCount: siswaRows.length,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/broadcast/audience/schools
// Daftar sekolah unik yang memiliki siswa di period aktif.
// Dipakai untuk autocomplete filter sekolah di wizard broadcast.
// ─────────────────────────────────────────────────────────────────────────────
async function getSchoolList(user, query = {}) {
  let mp = query.period || user.selectedPeriod;
  if (!mp || mp === '-') mp = await getActivePeriod();

  const whereParts = ['sp.marketing_period = ?'];
  const params     = [mp];

  if (user.role === 'CRO') {
    whereParts.push('sp.cro = ?');
    params.push(user.nama);
  }

  const where = whereParts.join(' AND ');

  const [rows] = await pool.query(
    `SELECT DISTINCT
       sek.id_sekolah,
       sek.nama_sekolah
     FROM siswa_periode sp
     LEFT JOIN master_siswa   ms  ON sp.id_siswa   = ms.id_siswa
     LEFT JOIN master_sekolah sek ON ms.id_sekolah = sek.id_sekolah
     WHERE ${where}
       AND sek.nama_sekolah IS NOT NULL
     ORDER BY sek.nama_sekolah ASC`,
    params
  );

  return rows.map(r => ({ id: r.id_sekolah, name: r.nama_sekolah }));
}

// ─────────────────────────────────────────────────────────────────────────────
// BACKWARD-COMPAT (POST legacy routes dari crm.routes.js)
// ─────────────────────────────────────────────────────────────────────────────
async function getBroadcastSekolahListLegacy(user, body = {}) {
  return { data: [], message: 'Endpoint legacy. Gunakan GET /api/v1/broadcast/audience.' };
}

async function getBroadcastTargetPreview(user, body = {}) {
  return { data: [], message: 'Preview endpoint legacy.' };
}

async function getBroadcastProgress(user, body = {}) {
  const { broadcastId } = body;
  if (!broadcastId) return { data: null };
  const [rows] = await pool.query(
    `SELECT id_broadcast AS id, status, total_target AS targetCount,
            total_success AS sentCount, total_failed AS failedCount,
            total_pending AS pendingCount
     FROM \`broadcast\` WHERE id_broadcast = ? LIMIT 1`,
    [broadcastId]
  );
  return { data: rows[0] || null };
}

async function checkTemplateHistory(user, body = {}) {
  return { data: [], message: 'Template history endpoint legacy.' };
}

// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  getAudience,
  getBroadcastHistory,
  getMetaTemplates,
  getCrmTemplates,
  createBroadcastJob,
  getSchoolList,
  // backward-compat
  getBroadcastSekolahListLegacy,
  getBroadcastTargetPreview,
  getBroadcastProgress,
  checkTemplateHistory,
};

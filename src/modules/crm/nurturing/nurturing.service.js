'use strict';

/**
 * nurturing.service.js
 * Semua logika DB & bisnis untuk modul Automated Nurturing & Snooze Campaign.
 * Berdasarkan PRD: modul-automated-nurturing.md
 */

const { pool } = require('../../../config/database');
const axios = require('axios');

// ─── Helper ───────────────────────────────────────────────────────────────────

async function getActivePeriod() {
  const [rows] = await pool.query(
    "SELECT nama_period FROM marketing_period WHERE status = 'aktif' ORDER BY created_date DESC LIMIT 1"
  );
  return rows.length > 0 ? rows[0].nama_period : '-';
}

/**
 * Ambil / buat state nurturing untuk seorang siswa.
 * Akan INSERT jika belum ada (upsert-safe via ON DUPLICATE KEY).
 */
async function ensureState(idSiswa, marketingPeriod) {
  await pool.query(
    `INSERT IGNORE INTO siswa_nurturing_state (id_siswa, marketing_period)
     VALUES (?, ?)`,
    [idSiswa, marketingPeriod]
  );
}

/** Catat log aktivitas otomasi */
async function logActivity(idSiswa, activityType, result, notes, triggeredBy = 'cron') {
  await pool.query(
    `INSERT INTO nurturing_activity_log (id_siswa, activity_type, result, notes, triggered_by)
     VALUES (?, ?, ?, ?, ?)`,
    [idSiswa, activityType, result, notes, triggeredBy]
  );
}

// ─── Stats & List ─────────────────────────────────────────────────────────────

/**
 * GET /api/v1/nurturing/stats
 * Metrik ringkasan untuk Nurturing Dashboard cards.
 */
async function getStats(user) {
  let mp = user.selectedPeriod;
  if (!mp || mp === '-') mp = await getActivePeriod();

  // Filter CRO hanya lihat data miliknya
  const croFilter = user.role === 'CRO' ? `AND sp.cro = '${user.nama}'` : '';

  const [[stats]] = await pool.query(`
    SELECT
      COUNT(CASE WHEN sp.status_terkini = 'Calon Prospek' THEN 1 END)                                      AS total_calon_prospek,
      COUNT(CASE WHEN sn.is_in_campaign = 1 AND sn.probe_level = 0 THEN 1 END)                             AS antrean_baru_probe_1,
      COUNT(CASE WHEN sn.is_in_campaign = 1 AND sn.probe_level BETWEEN 1 AND 4 THEN 1 END)                 AS dalam_putaran_probe_1_4,
      COUNT(CASE WHEN sp.status_terkini = 'Calon Prospek' AND sp.next_action = 'Follow Up'
                  AND (sn.is_in_campaign = 0 OR sn.id IS NULL)                              THEN 1 END)    AS menunggu_followup_manual
    FROM siswa_periode sp
    LEFT JOIN siswa_nurturing_state sn
           ON sp.id_siswa = sn.id_siswa AND sn.marketing_period = sp.marketing_period
    WHERE sp.marketing_period = ?
    ${croFilter}
  `, [mp]);

  return {
    total_calon_prospek:    parseInt(stats.total_calon_prospek, 10),
    antrean_baru_probe_1:   parseInt(stats.antrean_baru_probe_1, 10),
    dalam_putaran_probe_1_4: parseInt(stats.dalam_putaran_probe_1_4, 10),
    menunggu_followup_manual: parseInt(stats.menunggu_followup_manual, 10),
  };
}

/**
 * GET /api/v1/nurturing/leads
 * Daftar leads yang sedang aktif dalam campaign probing.
 * Query params: ?page=1&limit=20&search=
 */
async function getLeads(user, query = {}) {
  let mp = query.period || user.selectedPeriod;
  if (!mp || mp === '-') mp = await getActivePeriod();

  const page     = Math.max(1, parseInt(query.page  || '1',  10));
  const limit    = Math.min(50, parseInt(query.limit || '20', 10));
  const offset   = (page - 1) * limit;
  const search   = query.search ? `%${query.search}%` : null;

  const whereParts = [
    `sp.marketing_period = ?`,
    `sp.status_terkini   = 'Calon Prospek'`,
    `sn.is_in_campaign   = 1`,
  ];
  const params = [mp];

  if (user.role === 'CRO') { whereParts.push('sp.cro = ?'); params.push(user.nama); }
  if (search)               { whereParts.push('(ms.nama_lengkap LIKE ? OR ms.wa LIKE ?)'); params.push(search, search); }

  const where = whereParts.join(' AND ');

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM siswa_periode sp
     JOIN master_siswa ms ON sp.id_siswa = ms.id_siswa
     JOIN siswa_nurturing_state sn ON sp.id_siswa = sn.id_siswa AND sn.marketing_period = sp.marketing_period
     WHERE ${where}`, params
  );

  if (parseInt(total, 10) === 0) return { data: [], total: 0, page, limit, totalPages: 0 };

  const [rows] = await pool.query(
    `SELECT
       ms.id_siswa       AS id,
       ms.nama_lengkap   AS nama,
       ms.wa             AS noWa,
       IFNULL(sek.nama_sekolah, '-') AS sekolah,
       sp.status_terkini AS status,
       sp.cro,
       sn.probe_level    AS probeLevel,
       sn.last_probe_sent_at AS lastProbeSentAt,
       -- Sisa hari menuju probe berikutnya (7 hari setelah last_probe_sent_at)
       GREATEST(0, 7 - DATEDIFF(NOW(), sn.last_probe_sent_at)) AS sisaHari
     FROM siswa_periode sp
     JOIN master_siswa ms ON sp.id_siswa = ms.id_siswa
     LEFT JOIN master_sekolah sek ON ms.id_sekolah = sek.id_sekolah
     JOIN siswa_nurturing_state sn ON sp.id_siswa = sn.id_siswa AND sn.marketing_period = sp.marketing_period
     WHERE ${where}
     ORDER BY sn.probe_level ASC, sn.last_probe_sent_at ASC
     LIMIT ${limit} OFFSET ${offset}`,
    params
  );

  return {
    data:       rows,
    total:      parseInt(total, 10),
    page,
    limit,
    totalPages: Math.ceil(parseInt(total, 10) / limit),
  };
}

// ─── Snooze Stats & List ──────────────────────────────────────────────────────

/**
 * GET /api/v1/nurturing/snooze/stats
 * Metrik ringkasan untuk Snooze Campaign Dashboard.
 */
async function getSnoozeStats(user) {
  let mp = user.selectedPeriod;
  if (!mp || mp === '-') mp = await getActivePeriod();

  const croFilter = user.role === 'CRO' ? `AND sp.cro = '${user.nama}'` : '';

  const [[stats]] = await pool.query(`
    SELECT
      COUNT(CASE WHEN sn.snooze_until IS NOT NULL AND sn.snooze_until > NOW()
                  AND sp.status_terkini = 'Data Masuk'  THEN 1 END)  AS total_sedang_tunda,
      COUNT(CASE WHEN sn.snooze_until IS NOT NULL
                  AND sn.snooze_until BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 7 DAY)
                  AND sp.status_terkini = 'Data Masuk'  THEN 1 END)  AS bangun_minggu_ini
    FROM siswa_periode sp
    LEFT JOIN siswa_nurturing_state sn
           ON sp.id_siswa = sn.id_siswa AND sn.marketing_period = sp.marketing_period
    WHERE sp.marketing_period = ?
    ${croFilter}
  `, [mp]);

  return {
    total_sedang_tunda: parseInt(stats.total_sedang_tunda, 10),
    bangun_minggu_ini:  parseInt(stats.bangun_minggu_ini, 10),
  };
}

/**
 * GET /api/v1/nurturing/snooze/leads
 * Daftar leads yang sedang dalam status Snooze.
 */
async function getSnoozeLeads(user, query = {}) {
  let mp = query.period || user.selectedPeriod;
  if (!mp || mp === '-') mp = await getActivePeriod();

  const page   = Math.max(1, parseInt(query.page  || '1',  10));
  const limit  = Math.min(50, parseInt(query.limit || '20', 10));
  const offset = (page - 1) * limit;
  const search = query.search ? `%${query.search}%` : null;

  const whereParts = [
    `sp.marketing_period  = ?`,
    `sp.status_terkini    = 'Data Masuk'`,
    `sn.snooze_until      IS NOT NULL`,
    `sn.snooze_until      > NOW()`,
  ];
  const params = [mp];

  if (user.role === 'CRO') { whereParts.push('sp.cro = ?'); params.push(user.nama); }
  if (search)               { whereParts.push('(ms.nama_lengkap LIKE ? OR ms.wa LIKE ?)'); params.push(search, search); }

  const where = whereParts.join(' AND ');

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM siswa_periode sp
     JOIN master_siswa ms ON sp.id_siswa = ms.id_siswa
     JOIN siswa_nurturing_state sn ON sp.id_siswa = sn.id_siswa AND sn.marketing_period = sp.marketing_period
     WHERE ${where}`, params
  );

  if (parseInt(total, 10) === 0) return { data: [], total: 0, page, limit, totalPages: 0 };

  const [rows] = await pool.query(
    `SELECT
       ms.id_siswa                         AS id,
       ms.nama_lengkap                     AS nama,
       ms.wa                               AS noWa,
       IFNULL(sek.nama_sekolah, '-')       AS sekolah,
       sp.cro,
       sn.snooze_level                     AS snoozeLevel,
       DATE_FORMAT(sn.snooze_until, '%Y-%m-%d') AS snoozeUntil,
       GREATEST(0, DATEDIFF(sn.snooze_until, NOW())) AS sisaHari
     FROM siswa_periode sp
     JOIN master_siswa ms ON sp.id_siswa = ms.id_siswa
     LEFT JOIN master_sekolah sek ON ms.id_sekolah = sek.id_sekolah
     JOIN siswa_nurturing_state sn ON sp.id_siswa = sn.id_siswa AND sn.marketing_period = sp.marketing_period
     WHERE ${where}
     ORDER BY sn.snooze_until ASC
     LIMIT ${limit} OFFSET ${offset}`,
    params
  );

  return {
    data:       rows,
    total:      parseInt(total, 10),
    page,
    limit,
    totalPages: Math.ceil(parseInt(total, 10) / limit),
  };
}

// ─── Actions ──────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/nurturing/takeover/:id
 * Menghentikan kampanye bot untuk seorang siswa secara manual.
 */
async function takeoverLead(idSiswa, user) {
  let mp = user.selectedPeriod;
  if (!mp || mp === '-') mp = await getActivePeriod();

  await pool.query(
    `UPDATE siswa_nurturing_state
     SET is_in_campaign = 0, updated_at = NOW()
     WHERE id_siswa = ? AND marketing_period = ?`,
    [idSiswa, mp]
  );

  await logActivity(
    idSiswa,
    'Manual Takeover',
    'Bot dihentikan oleh CRO',
    `CRO ${user.nama} mengambil alih percakapan dari bot nurturing.`,
    `manual:${user.nama}`
  );

  return { message: 'Bot nurturing dihentikan. Siswa siap ditangani CRO.' };
}

/**
 * POST /api/v1/nurturing/snooze/add
 * Menambahkan siswa ke antrean snooze secara manual.
 */
async function addManualSnooze(idSiswa, alasan, user) {
  let mp = user.selectedPeriod;
  if (!mp || mp === '-') mp = await getActivePeriod();

  const snoozeUntil = new Date();
  snoozeUntil.setDate(snoozeUntil.getDate() + 90);

  // Upsert state
  await pool.query(
    `INSERT INTO siswa_nurturing_state (id_siswa, marketing_period, snooze_until, snooze_level)
     VALUES (?, ?, ?, 0)
     ON DUPLICATE KEY UPDATE snooze_until = VALUES(snooze_until), snooze_level = 0, updated_at = NOW()`,
    [idSiswa, mp, snoozeUntil]
  );

  // Update status siswa ke Data Masuk
  await pool.query(
    `UPDATE siswa_periode
     SET status_terkini = 'Data Masuk', next_action = 'Snooze', due_date = NULL
     WHERE id_siswa = ? AND marketing_period = ?`,
    [idSiswa, mp]
  );

  await logActivity(
    idSiswa,
    'Manual Snooze',
    `Snooze hingga ${snoozeUntil.toISOString().split('T')[0]}`,
    alasan || 'Ditambahkan manual oleh CRO.',
    `manual:${user.nama}`
  );

  return { message: 'Siswa berhasil ditambahkan ke antrean snooze 90 hari.', snoozeUntil };
}

/**
 * DELETE /api/v1/nurturing/snooze/:id
 * Menghentikan masa snooze lebih awal (bangunkan manual).
 */
async function stopSnooze(idSiswa, user) {
  let mp = user.selectedPeriod;
  if (!mp || mp === '-') mp = await getActivePeriod();

  await pool.query(
    `UPDATE siswa_nurturing_state
     SET snooze_until = NULL, snooze_level = 0, updated_at = NOW()
     WHERE id_siswa = ? AND marketing_period = ?`,
    [idSiswa, mp]
  );

  // Kembalikan status ke Data Masuk + siapkan untuk CRO
  await pool.query(
    `UPDATE siswa_periode
     SET status_terkini = 'Data Masuk', next_action = 'Screening', due_date = NOW()
     WHERE id_siswa = ? AND marketing_period = ?`,
    [idSiswa, mp]
  );

  await logActivity(
    idSiswa,
    'Manual Bangun dari Snooze',
    'Snooze dihentikan lebih awal',
    `CRO ${user.nama} membangunkan siswa dari snooze sebelum waktunya.`,
    `manual:${user.nama}`
  );

  return { message: 'Snooze dihentikan. Siswa dikembalikan ke backlog task list.' };
}

// ─── Cron Job Logic ───────────────────────────────────────────────────────────

/**
 * Background Job: Nurturing Probing Campaign
 * Dijalankan cron setiap hari pukul 21:00 WIB.
 * Logika: Kirim template probe_1 s/d probe_5 ke Calon Prospek yang is_in_campaign = true.
 * (Pengiriman WA ke Meta API akan diimplementasikan saat WA_ACCESS_TOKEN tersedia)
 */
async function runNurturingCron(credentials = null) {
  console.log('[Nurturing Cron] ▶ Memulai nurturing probing job...');
  const mp = await getActivePeriod();

  const [leads] = await pool.query(
    `SELECT
       ms.id_siswa, ms.nama_lengkap, ms.wa, ms.bsuid,
       sp.cro, sp.status_terkini,
       sn.probe_level, sn.last_probe_sent_at
     FROM siswa_nurturing_state sn
     JOIN siswa_periode sp ON sn.id_siswa = sp.id_siswa AND sn.marketing_period = sp.marketing_period
     JOIN master_siswa ms ON ms.id_siswa = sn.id_siswa
     WHERE sn.is_in_campaign = 1
       AND sp.status_terkini  = 'Calon Prospek'
       AND sp.marketing_period = ?`,
    [mp]
  );

  console.log(`[Nurturing Cron] Memproses ${leads.length} leads...`);
  let sent = 0, escalated = 0;

  for (const lead of leads) {
    const level = lead.probe_level;
    const lastSent = lead.last_probe_sent_at ? new Date(lead.last_probe_sent_at) : null;
    const daysSinceLast = lastSent
      ? Math.floor((Date.now() - lastSent.getTime()) / 86_400_000)
      : null;

    // Probe 1: belum pernah dikirim
    if (level === 0) {
      await _sendProbe(lead, 1, mp, credentials);
      sent++;
      continue;
    }

    // Probe 2-5: kirim jika sudah >= 7 hari sejak probe terakhir
    if (level >= 1 && level <= 4 && daysSinceLast !== null && daysSinceLast >= 7) {
      await _sendProbe(lead, level + 1, mp, credentials);
      sent++;
      continue;
    }

    // Probe 5 sudah terkirim >= 7 hari lalu → Eskalasi ke CRO
    if (level === 5 && daysSinceLast !== null && daysSinceLast >= 7) {
      await pool.query(
        `UPDATE siswa_nurturing_state
         SET is_in_campaign = 0, updated_at = NOW()
         WHERE id_siswa = ? AND marketing_period = ?`,
        [lead.id_siswa, mp]
      );
      await pool.query(
        `UPDATE siswa_periode
         SET next_action = 'Follow Up', due_date = DATE_ADD(NOW(), INTERVAL 1 DAY)
         WHERE id_siswa = ? AND marketing_period = ?`,
        [lead.id_siswa, mp]
      );
      await logActivity(
        lead.id_siswa, 'Auto-Escalation',
        'Masuk ke Follow Up Manual',
        `Probe 5 selesai tanpa respons. Due Date: besok.`, 'cron'
      );
      escalated++;
    }
  }

  console.log(`[Nurturing Cron] ✅ Selesai. Terkirim: ${sent}, Eskalasi: ${escalated}`);
  return { sent, escalated };
}

/**
 * Background Job: Snooze Campaign
 * Bangunkan leads yang snooze_until <= NOW().
 */
async function runSnoozeCron(credentials = null) {
  console.log('[Snooze Cron] ▶ Memulai snooze campaign job...');
  const mp = await getActivePeriod();

  const [leads] = await pool.query(
    `SELECT ms.id_siswa, ms.nama_lengkap, ms.wa, ms.bsuid, sn.snooze_level
     FROM siswa_nurturing_state sn
     JOIN siswa_periode sp ON sn.id_siswa = sp.id_siswa AND sn.marketing_period = sp.marketing_period
     JOIN master_siswa ms ON ms.id_siswa = sn.id_siswa
     WHERE sn.snooze_until <= NOW()
       AND sn.snooze_until IS NOT NULL
       AND sp.status_terkini = 'Data Masuk'
       AND sp.marketing_period = ?`,
    [mp]
  );

  console.log(`[Snooze Cron] Memproses ${leads.length} leads...`);
  let woken = 0, terminated = 0;

  for (const lead of leads) {
    const nextLevel = lead.snooze_level + 1;

    if (nextLevel <= 3) {
      // Kirim template snooze_{nextLevel}
      await _sendSnoozeTemplate(lead, nextLevel, mp, credentials);
      woken++;
    } else {
      // Snooze level 3 sudah habis → Tidak Lanjut
      await pool.query(
        `UPDATE siswa_periode
         SET status_terkini = 'Tidak Lanjut', next_action = 'Tidak Ada', alasan_tidak_lanjut = 'Tidak Merespons (Snooze Campaign)'
         WHERE id_siswa = ? AND marketing_period = ?`,
        [lead.id_siswa, mp]
      );
      await pool.query(
        `UPDATE siswa_nurturing_state
         SET snooze_until = NULL, updated_at = NOW()
         WHERE id_siswa = ? AND marketing_period = ?`,
        [lead.id_siswa, mp]
      );
      await logActivity(
        lead.id_siswa, 'Auto-Snooze-Terminasi',
        'Tidak Lanjut (Snooze Campaign Selesai)',
        'Snooze level 3 habis, siswa tidak merespons.', 'cron'
      );
      terminated++;
    }
  }

  console.log(`[Snooze Cron] ✅ Selesai. Dibangunkan: ${woken}, Diterminasi: ${terminated}`);
  return { woken, terminated };
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

async function _sendProbe(lead, newLevel, mp, credentials) {
  const templateName = `probe_${newLevel}`;
  console.log(`[Nurturing] Kirim ${templateName} ke ${lead.nama_lengkap} (${lead.wa})`);

  if (credentials && credentials.token && credentials.phoneId) {
    try {
      await axios.post(
        `https://graph.facebook.com/v19.0/${credentials.phoneId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: lead.wa,
          type: 'template',
          template: { name: templateName, language: { code: 'id' } },
        },
        {
          headers: {
            Authorization: `Bearer ${credentials.token}`,
            'Content-Type': 'application/json',
          },
          timeout: 12000,
        }
      );
      console.log(`[Nurturing] ✅ ${templateName} terkirim ke ${lead.wa}`);
    } catch (err) {
      console.error(`[Nurturing] ❌ Gagal kirim ${templateName} ke ${lead.wa}:`, err.response?.data?.error?.message || err.message);
    }
  } else {
    console.warn(`[Nurturing] ⚠️ Kredensial Meta tidak tersedia. Mode Mocking untuk ${templateName}`);
  }

  await pool.query(
    `UPDATE siswa_nurturing_state
     SET probe_level = ?, last_probe_sent_at = NOW(), updated_at = NOW()
     WHERE id_siswa = ? AND marketing_period = ?`,
    [newLevel, lead.id_siswa, mp]
  );

  await logActivity(
    lead.id_siswa,
    'Auto-Probing WhatsApp',
    `Probe ${newLevel} Terkirim`,
    `Template probe_${newLevel} dikirim ke nomor ${lead.wa}.`,
    'cron'
  );
}

async function _sendSnoozeTemplate(lead, level, mp, credentials) {
  const templateName = `snooze_${level}`;
  console.log(`[Snooze] Kirim ${templateName} ke ${lead.nama_lengkap} (${lead.wa})`);

  if (credentials && credentials.token && credentials.phoneId) {
    try {
      await axios.post(
        `https://graph.facebook.com/v19.0/${credentials.phoneId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: lead.wa,
          type: 'template',
          template: { name: templateName, language: { code: 'id' } },
        },
        {
          headers: {
            Authorization: `Bearer ${credentials.token}`,
            'Content-Type': 'application/json',
          },
          timeout: 12000,
        }
      );
      console.log(`[Snooze] ✅ ${templateName} terkirim ke ${lead.wa}`);
    } catch (err) {
      console.error(`[Snooze] ❌ Gagal kirim ${templateName} ke ${lead.wa}:`, err.response?.data?.error?.message || err.message);
    }
  } else {
    console.warn(`[Snooze] ⚠️ Kredensial Meta tidak tersedia. Mode Mocking untuk ${templateName}`);
  }

  const newSnoozeUntil = new Date();
  newSnoozeUntil.setDate(newSnoozeUntil.getDate() + 90);

  await pool.query(
    `UPDATE siswa_nurturing_state
     SET snooze_level = ?, snooze_until = ?, updated_at = NOW()
     WHERE id_siswa = ? AND marketing_period = ?`,
    [level, newSnoozeUntil, lead.id_siswa, mp]
  );

  await logActivity(
    lead.id_siswa,
    'Auto-Snooze WhatsApp',
    `Snooze ${level} Terkirim`,
    `Template snooze_${level} dikirim. Snooze baru hingga ${newSnoozeUntil.toISOString().split('T')[0]}.`,
    'cron'
  );
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  getStats,
  getLeads,
  getSnoozeStats,
  getSnoozeLeads,
  takeoverLead,
  addManualSnooze,
  stopSnooze,
  runNurturingCron,
  runSnoozeCron,
};

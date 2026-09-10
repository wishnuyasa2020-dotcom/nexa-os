'use strict';

/**
 * nurturing.service.js
 * Semua logika DB & bisnis untuk modul Automated Nurturing & Snooze Campaign.
 * Berdasarkan PRD: modul-automated-nurturing.md
 */

const { pool } = require('../../../config/database');
const axios = require('axios');
const crypto = require('crypto');

// ─── Helper ───────────────────────────────────────────────────────────────────

async function getActivePeriod() {
  const [rows] = await pool.query(
    "SELECT nama_period FROM marketing_period WHERE status = 'aktif' ORDER BY created_date DESC LIMIT 1"
  );
  return rows.length > 0 ? rows[0].nama_period : '-';
}

/**
 * Catat event immutable ke events_log untuk CQRS & Audit Trail
 */
async function recordEvent(eventType, aggregateId, payload, actorId = 'System', marketingPeriod = null, conn = null) {
  const eventId = `EVT-NUR-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const executor = conn || pool;
  await executor.query(
    `INSERT INTO events_log (event_id, aggregate_type, aggregate_id, event_type, payload, actor_id, marketing_period, created_at)
     VALUES (?, 'siswa', ?, ?, ?, ?, ?, NOW())`,
    [
      eventId,
      aggregateId,
      eventType,
      typeof payload === 'object' ? JSON.stringify(payload) : payload,
      actorId || 'System',
      marketingPeriod,
    ]
  );
  return eventId;
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

/**
 * Memastikan tabel proyeksi snooze_state ada di database tenant.
 */
async function ensureSnoozeTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS snooze_state (
      id_siswa           VARCHAR(50) PRIMARY KEY,
      marketing_period   VARCHAR(20) DEFAULT '-',
      is_active          TINYINT(1) DEFAULT 1,
      snooze_until       DATE NULL,
      snooze_level       INT DEFAULT 0,
      alasan             TEXT NULL,
      updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
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
      COUNT(CASE WHEN sp.commercial_state IN ('Lead', 'Prospect') OR sp.status_terkini = 'Calon Prospek' THEN 1 END) AS total_calon_prospek,
      COUNT(CASE WHEN sn.is_in_campaign = 1 AND sn.probe_level = 0 THEN 1 END)                                     AS antrean_baru_probe_1,
      COUNT(CASE WHEN sn.is_in_campaign = 1 AND sn.probe_level BETWEEN 1 AND 4 THEN 1 END)                         AS dalam_putaran_probe_1_4,
      COUNT(CASE WHEN (sp.commercial_state IN ('Lead', 'Prospect') OR sp.status_terkini = 'Calon Prospek')
                  AND sp.next_action = 'Follow Up'
                  AND (sn.is_in_campaign = 0 OR sn.id IS NULL)                                                     THEN 1 END) AS menunggu_followup_manual
    FROM siswa_periode sp
    LEFT JOIN siswa_nurturing_state sn
           ON sp.id_siswa = sn.id_siswa AND sn.marketing_period = sp.marketing_period
    WHERE sp.marketing_period = ?
    ${croFilter}
  `, [mp]);

  return {
    total_calon_prospek:      parseInt(stats?.total_calon_prospek || 0, 10),
    antrean_baru_probe_1:     parseInt(stats?.antrean_baru_probe_1 || 0, 10),
    dalam_putaran_probe_1_4:  parseInt(stats?.dalam_putaran_probe_1_4 || 0, 10),
    menunggu_followup_manual: parseInt(stats?.menunggu_followup_manual || 0, 10),
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
    `(sp.commercial_state IN ('Lead', 'Prospect') OR sp.status_terkini = 'Calon Prospek')`,
    `sn.is_in_campaign   = 1`,
    `(ms.opt_in_wa IS NULL OR ms.opt_in_wa NOT IN ('Tidak', 'Denied', 'Withdrawn', 'No'))`,
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
       COALESCE(sp.commercial_state, sp.status_terkini, 'Lead') AS commercialState,
       sp.status_terkini AS status,
       'Granted'         AS consent,
       sp.cro,
       sn.probe_level    AS probeLevel,
       sn.last_probe_sent_at AS lastProbeSentAt,
       -- Sisa hari menuju probe berikutnya (7 hari setelah last_probe_sent_at)
       GREATEST(0, 7 - DATEDIFF(NOW(), sn.last_probe_sent_at)) AS sisaHari,
       IF(wsw.window_expires_at IS NOT NULL AND wsw.window_expires_at > NOW(), true, false) AS isSwOpen
     FROM siswa_periode sp
     JOIN master_siswa ms ON sp.id_siswa = ms.id_siswa
     LEFT JOIN master_sekolah sek ON ms.id_sekolah = sek.id_sekolah
     LEFT JOIN wa_service_window wsw ON wsw.wa_number = ms.wa
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
  await ensureSnoozeTable();
  let mp = user.selectedPeriod;
  if (!mp || mp === '-') mp = await getActivePeriod();

  const croFilter = user.role === 'CRO' ? `AND sp.cro = '${user.nama}'` : '';

  const [[stats]] = await pool.query(`
    SELECT
      COUNT(CASE WHEN (COALESCE(sz.is_active, 1) = 1)
                  AND (sz.snooze_until > NOW() OR sn.snooze_until > NOW())
                  AND (ms.opt_in_wa IS NULL OR ms.opt_in_wa NOT IN ('Tidak', 'Denied', 'Withdrawn', 'No'))
                  THEN 1 END) AS total_sedang_tunda,
      COUNT(CASE WHEN (COALESCE(sz.is_active, 1) = 1)
                  AND (COALESCE(sz.snooze_until, sn.snooze_until) BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 7 DAY))
                  AND (ms.opt_in_wa IS NULL OR ms.opt_in_wa NOT IN ('Tidak', 'Denied', 'Withdrawn', 'No'))
                  THEN 1 END) AS bangun_minggu_ini
    FROM siswa_periode sp
    JOIN master_siswa ms ON sp.id_siswa = ms.id_siswa
    LEFT JOIN snooze_state sz ON sp.id_siswa = sz.id_siswa
    LEFT JOIN siswa_nurturing_state sn ON sp.id_siswa = sn.id_siswa AND sn.marketing_period = sp.marketing_period
    WHERE sp.marketing_period = ?
    ${croFilter}
  `, [mp]);

  return {
    total_sedang_tunda: parseInt(stats?.total_sedang_tunda || 0, 10),
    bangun_minggu_ini:  parseInt(stats?.bangun_minggu_ini || 0, 10),
  };
}

/**
 * GET /api/v1/nurturing/snooze/leads
 * Daftar leads yang sedang dalam status Snooze.
 */
async function getSnoozeLeads(user, query = {}) {
  await ensureSnoozeTable();
  let mp = query.period || user.selectedPeriod;
  if (!mp || mp === '-') mp = await getActivePeriod();

  const page   = Math.max(1, parseInt(query.page  || '1',  10));
  const limit  = Math.min(50, parseInt(query.limit || '20', 10));
  const offset = (page - 1) * limit;
  const search = query.search ? `%${query.search}%` : null;

  const whereParts = [
    `sp.marketing_period = ?`,
    `(COALESCE(sz.is_active, 1) = 1)`,
    `(sz.snooze_until > NOW() OR sn.snooze_until > NOW())`,
    `(ms.opt_in_wa IS NULL OR ms.opt_in_wa NOT IN ('Tidak', 'Denied', 'Withdrawn', 'No'))`,
  ];
  const params = [mp];

  if (user.role === 'CRO') { whereParts.push('sp.cro = ?'); params.push(user.nama); }
  if (search)               { whereParts.push('(ms.nama_lengkap LIKE ? OR ms.wa LIKE ?)'); params.push(search, search); }

  const where = whereParts.join(' AND ');

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM siswa_periode sp
     JOIN master_siswa ms ON sp.id_siswa = ms.id_siswa
     LEFT JOIN snooze_state sz ON sp.id_siswa = sz.id_siswa
     LEFT JOIN siswa_nurturing_state sn ON sp.id_siswa = sn.id_siswa AND sn.marketing_period = sp.marketing_period
     WHERE ${where}`, params
  );

  if (parseInt(total, 10) === 0) return { data: [], total: 0, page, limit, totalPages: 0 };

  const [rows] = await pool.query(
    `SELECT
       ms.id_siswa                         AS id,
       ms.nama_lengkap                     AS nama,
       ms.wa                               AS noWa,
       IFNULL(sek.nama_sekolah, '-')       AS sekolah,
       COALESCE(sp.commercial_state, sp.status_terkini, 'Lead') AS commercialState,
       'Granted'                           AS consent,
       sp.cro,
       COALESCE(sz.snooze_level, sn.snooze_level, 0) AS snoozeLevel,
       DATE_FORMAT(COALESCE(sz.snooze_until, sn.snooze_until), '%Y-%m-%d') AS snoozeUntil,
       GREATEST(0, DATEDIFF(COALESCE(sz.snooze_until, sn.snooze_until), NOW())) AS sisaHari,
       DATEDIFF(COALESCE(sz.snooze_until, sn.snooze_until), sz.updated_at) AS intervalDays
     FROM siswa_periode sp
     JOIN master_siswa ms ON sp.id_siswa = ms.id_siswa
     LEFT JOIN master_sekolah sek ON ms.id_sekolah = sek.id_sekolah
     LEFT JOIN snooze_state sz ON sp.id_siswa = sz.id_siswa
     LEFT JOIN siswa_nurturing_state sn ON sp.id_siswa = sn.id_siswa AND sn.marketing_period = sp.marketing_period
     WHERE ${where}
     ORDER BY COALESCE(sz.snooze_until, sn.snooze_until) ASC
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
 * Menghentikan kampanye bot untuk seorang siswa secara manual (Event: NurturingAborted).
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

  await pool.query(
    `UPDATE siswa_periode
     SET next_action = 'Follow Up', due_date = NOW()
     WHERE id_siswa = ? AND marketing_period = ?`,
    [idSiswa, mp]
  );

  // Rekam event immutable NurturingAborted
  await recordEvent(
    'NurturingAborted',
    idSiswa,
    {
      id_siswa: idSiswa,
      reason: 'Manual Takeover',
      marketing_period: mp,
      cro: user.nama || 'CRO',
    },
    user.nama || 'CRO',
    mp
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
 * POST /api/v1/nurturing/start/:id
 * Mendaftarkan siswa ke kampanye probing (Event: NurturingStarted).
 */
async function startNurturing(idSiswa, user, reason = 'Inbound Hesitant Intent') {
  let mp = user.selectedPeriod;
  if (!mp || mp === '-') mp = await getActivePeriod();

  // 1. Cek Consent siswa (Pilar 2 Privasi Data)
  const [msRows] = await pool.query(
    'SELECT opt_in_wa, nama_lengkap FROM master_siswa WHERE id_siswa = ? LIMIT 1',
    [idSiswa]
  );
  if (msRows.length > 0 && msRows[0].opt_in_wa && ['Tidak', 'Denied', 'Withdrawn', 'No'].includes(msRows[0].opt_in_wa)) {
    throw new Error('Siswa telah mencabut/menolak izin WhatsApp (Consent Denied/Withdrawn). Tidak dapat dimasukkan ke kampanye.');
  }

  // 2. Upsert ke tabel projection siswa_nurturing_state
  await pool.query(
    `INSERT INTO siswa_nurturing_state (id_siswa, marketing_period, is_in_campaign, probe_level, last_probe_sent_at)
     VALUES (?, ?, 1, 0, NULL)
     ON DUPLICATE KEY UPDATE is_in_campaign = 1, probe_level = 0, last_probe_sent_at = NULL, updated_at = NOW()`,
    [idSiswa, mp]
  );

  // 3. Rekam event immutable NurturingStarted
  await recordEvent(
    'NurturingStarted',
    idSiswa,
    {
      id_siswa: idSiswa,
      nama: msRows[0]?.nama_lengkap || null,
      reason: reason || 'Inbound Hesitant Intent',
      marketing_period: mp,
      probe_level: 0,
    },
    user.nama || 'System',
    mp
  );

  await logActivity(
    idSiswa,
    'Nurturing Started',
    'Masuk ke Antrean Probing',
    reason || 'Siswa menunjukkan keraguan / minta waktu.',
    user.nama || 'System'
  );

  return { message: 'Siswa berhasil didaftarkan ke siklus Auto Nurturing.' };
}

/**
 * POST /api/v1/nurturing/snooze/add & /api/v1/nurturing/snooze/request
 * Menambahkan siswa ke antrean snooze secara manual dengan interval durasi.
 * Event: SnoozeRequested
 */
async function addManualSnooze(idSiswa, optionsOrAlasan, user) {
  await ensureSnoozeTable();
  let mp = user.selectedPeriod;
  if (!mp || mp === '-') mp = await getActivePeriod();

  let intervalDays = 90;
  let alasan = '';

  if (typeof optionsOrAlasan === 'object' && optionsOrAlasan !== null) {
    intervalDays = parseInt(optionsOrAlasan.interval_days || optionsOrAlasan.intervalDays || '90', 10);
    alasan = optionsOrAlasan.alasan || '';
  } else if (typeof optionsOrAlasan === 'string') {
    alasan = optionsOrAlasan;
  }

  if (![30, 60, 90].includes(intervalDays)) {
    intervalDays = 90;
  }

  // 1. Consent Check (Pilar 2 Privasi Data)
  const [students] = await pool.query(
    `SELECT ms.id_siswa, ms.nama_lengkap, ms.wa, ms.opt_in_wa 
     FROM master_siswa ms 
     WHERE ms.id_siswa = ? LIMIT 1`,
    [idSiswa]
  );

  if (students.length === 0) {
    const err = new Error('Data siswa tidak ditemukan.');
    err.status = 404;
    throw err;
  }

  const student = students[0];
  const consent = student.opt_in_wa;
  if (consent && ['Tidak', 'Denied', 'Withdrawn', 'No'].includes(consent)) {
    const err = new Error('Siswa ini telah menolak/mencabut izin komunikasi WhatsApp.');
    err.status = 400;
    throw err;
  }

  const snoozeUntil = new Date();
  snoozeUntil.setDate(snoozeUntil.getDate() + intervalDays);
  const snoozeUntilStr = snoozeUntil.toISOString().split('T')[0];

  // 2. Update Projections (snooze_state & siswa_nurturing_state)
  await pool.query(
    `INSERT INTO snooze_state (id_siswa, marketing_period, is_active, snooze_until, snooze_level, alasan, updated_at)
     VALUES (?, ?, 1, ?, 0, ?, NOW())
     ON DUPLICATE KEY UPDATE 
       is_active = 1,
       snooze_until = VALUES(snooze_until),
       snooze_level = 0,
       alasan = VALUES(alasan),
       updated_at = NOW()`,
    [idSiswa, mp, snoozeUntilStr, alasan]
  );

  await pool.query(
    `INSERT INTO siswa_nurturing_state (id_siswa, marketing_period, snooze_until, snooze_level, is_in_campaign)
     VALUES (?, ?, ?, 0, 0)
     ON DUPLICATE KEY UPDATE snooze_until = VALUES(snooze_until), snooze_level = 0, is_in_campaign = 0, updated_at = NOW()`,
    [idSiswa, mp, snoozeUntil]
  );

  // Update status siswa ke Data Masuk
  await pool.query(
    `UPDATE siswa_periode
     SET status_terkini = 'Data Masuk', next_action = 'Snooze', due_date = NULL
     WHERE id_siswa = ? AND marketing_period = ?`,
    [idSiswa, mp]
  );

  // 3. Rekam Event Immutable SnoozeRequested ke events_log
  await recordEvent(
    'SnoozeRequested',
    idSiswa,
    {
      id_siswa: idSiswa,
      nama: student.nama_lengkap,
      interval_days: intervalDays,
      snooze_until: snoozeUntilStr,
      alasan: alasan || 'Manual snooze oleh CRO',
      marketing_period: mp,
      trigger: 'manual',
    },
    user.nama || 'CRO',
    mp
  );

  await logActivity(
    idSiswa,
    'Manual Snooze',
    `Snooze hingga ${snoozeUntilStr} (${intervalDays} hari)`,
    alasan || `Ditambahkan manual oleh CRO ${user.nama}.`,
    `manual:${user.nama}`
  );

  return {
    message: `Siswa berhasil ditambahkan ke antrean snooze ${intervalDays} hari.`,
    snoozeUntil: snoozeUntilStr,
    intervalDays,
  };
}

/**
 * DELETE /api/v1/nurturing/snooze/:id & POST /api/v1/nurturing/snooze/wakeup
 * Menghentikan masa snooze lebih awal (Bangunkan Paksa).
 * Event: SnoozeAborted (Reason: Woke Up)
 */
async function stopSnooze(idSiswa, user) {
  await ensureSnoozeTable();
  let mp = user.selectedPeriod;
  if (!mp || mp === '-') mp = await getActivePeriod();

  // 1. Update Projections
  await pool.query(
    `UPDATE snooze_state
     SET is_active = 0, snooze_until = NULL, updated_at = NOW()
     WHERE id_siswa = ?`,
    [idSiswa]
  );

  await pool.query(
    `UPDATE siswa_nurturing_state
     SET snooze_until = NULL, snooze_level = 0, updated_at = NOW()
     WHERE id_siswa = ? AND marketing_period = ?`,
    [idSiswa, mp]
  );

  // 2. Kembalikan status ke Data Masuk + siapkan untuk tindak lanjut CRO
  await pool.query(
    `UPDATE siswa_periode
     SET status_terkini = 'Data Masuk', next_action = 'Follow Up', due_date = NOW()
     WHERE id_siswa = ? AND marketing_period = ?`,
    [idSiswa, mp]
  );

  // 3. Rekam Event Immutable SnoozeAborted ke events_log
  await recordEvent(
    'SnoozeAborted',
    idSiswa,
    {
      id_siswa: idSiswa,
      reason: 'Woke Up',
      woken_by: user.nama || 'CRO',
      marketing_period: mp,
    },
    user.nama || 'CRO',
    mp
  );

  await logActivity(
    idSiswa,
    'Manual Bangun dari Snooze',
    'Snooze dihentikan lebih awal (Bangunkan Paksa)',
    `CRO ${user.nama} membangunkan siswa dari snooze sebelum waktunya.`,
    `manual:${user.nama}`
  );

  return { message: 'Snooze dihentikan. Siswa dikembalikan ke antrean CRO (Follow Up).' };
}

// ─── Cron Job Logic ───────────────────────────────────────────────────────────

/**
 * Background Job: Nurturing Probing Campaign
 * Dijalankan cron setiap hari pukul 21:00 WIB.
 * Logika: Evaluasi consent, kirim probe 1 s/d 5, atau eskalasi ke CRO pasca probe 5.
 */
async function runNurturingCron(credentials = null) {
  console.log('[Nurturing Cron] ▶ Memulai nurturing probing job...');
  const mp = await getActivePeriod();

  const [leads] = await pool.query(
    `SELECT
       ms.id_siswa, ms.nama_lengkap, ms.wa, ms.bsuid, ms.opt_in_wa,
       sp.cro, sp.status_terkini, sp.commercial_state,
       sn.probe_level, sn.last_probe_sent_at
     FROM siswa_nurturing_state sn
     JOIN siswa_periode sp ON sn.id_siswa = sp.id_siswa AND sn.marketing_period = sp.marketing_period
     JOIN master_siswa ms ON ms.id_siswa = sn.id_siswa
     WHERE sn.is_in_campaign = 1
       AND sp.marketing_period = ?`,
    [mp]
  );

  console.log(`[Nurturing Cron] Memproses ${leads.length} leads...`);
  let sent = 0, escalated = 0, abortedConsent = 0;

  for (const lead of leads) {
    // ── 1. [CRITICAL] Pengecekan Consent Siswa (Pilar 2 Privasi Data) ──
    if (lead.opt_in_wa && ['Tidak', 'Denied', 'Withdrawn', 'No'].includes(lead.opt_in_wa)) {
      console.log(`[Nurturing Cron] 🛑 Consent Withdrawn untuk siswa ${lead.nama_lengkap} (${lead.id_siswa}). Menghentikan kampanye secara diam-diam...`);
      await pool.query(
        `UPDATE siswa_nurturing_state
         SET is_in_campaign = 0, updated_at = NOW()
         WHERE id_siswa = ? AND marketing_period = ?`,
        [lead.id_siswa, mp]
      );
      await pool.query(
        `UPDATE siswa_periode
         SET status_terkini = 'Tidak Lanjut', next_action = 'Tidak Ada', alasan_tidak_lanjut = 'Consent Withdrawn'
         WHERE id_siswa = ? AND marketing_period = ?`,
        [lead.id_siswa, mp]
      );
      await recordEvent(
        'NurturingAborted',
        lead.id_siswa,
        {
          id_siswa: lead.id_siswa,
          reason: 'Consent Withdrawn',
          marketing_period: mp,
        },
        'System/Cron',
        mp
      );
      await logActivity(
        lead.id_siswa,
        'Nurturing Aborted',
        'Consent Withdrawn',
        'Kampanye Probing dihentikan diam-diam karena penolakan/penarikan izin WhatsApp.',
        'cron'
      );
      abortedConsent++;
      continue; // Lewatkan siswa ini, tidak dieskalasi ke CRO
    }

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

    // Probe 5 sudah terkirim >= 7 hari lalu → Eskalasi normal ke CRO
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
      await recordEvent(
        'NurturingCompleted',
        lead.id_siswa,
        {
          id_siswa: lead.id_siswa,
          result: 'No Response',
          total_probes_sent: 5,
          marketing_period: mp,
        },
        'System/Cron',
        mp
      );
      await logActivity(
        lead.id_siswa, 'Auto-Escalation',
        'Masuk ke Follow Up Manual',
        `Probe 5 selesai tanpa respons (total 35 hari). Due Date: besok.`, 'cron'
      );
      escalated++;
    }
  }

  console.log(`[Nurturing Cron] ✅ Selesai. Terkirim: ${sent}, Eskalasi: ${escalated}, Aborted (Consent): ${abortedConsent}`);
  return { sent, escalated, abortedConsent };
}

/**
 * Background Job: Snooze Campaign
 * Bangunkan leads yang snooze_until <= NOW().
 * Dijalankan cron setiap hari pukul 21:00 WIB.
 */
async function runSnoozeCron(credentials = null) {
  console.log('[Snooze Cron] ▶ Memulai snooze campaign job...');
  await ensureSnoozeTable();
  const mp = await getActivePeriod();

  const [leads] = await pool.query(
    `SELECT ms.id_siswa, ms.nama_lengkap, ms.wa, ms.bsuid, ms.opt_in_wa,
            COALESCE(sz.snooze_level, sn.snooze_level, 0) AS snooze_level,
            COALESCE(sz.snooze_until, sn.snooze_until) AS snooze_until
     FROM master_siswa ms
     JOIN siswa_periode sp ON ms.id_siswa = sp.id_siswa AND sp.marketing_period = ?
     LEFT JOIN snooze_state sz ON ms.id_siswa = sz.id_siswa
     LEFT JOIN siswa_nurturing_state sn ON ms.id_siswa = sn.id_siswa AND sn.marketing_period = sp.marketing_period
     WHERE (sz.is_active = 1 OR sz.is_active IS NULL)
       AND (sz.snooze_until <= NOW() OR sn.snooze_until <= NOW())
       AND (sz.snooze_until IS NOT NULL OR sn.snooze_until IS NOT NULL)`,
    [mp]
  );

  console.log(`[Snooze Cron] Memproses ${leads.length} leads...`);
  let woken = 0, terminated = 0, abortedConsent = 0;

  for (const lead of leads) {
    // ── STEP 1: Proteksi Privasi & Consent (Consent Engine) ─────────────────
    if (lead.opt_in_wa && ['Tidak', 'Denied', 'Withdrawn', 'No'].includes(lead.opt_in_wa)) {
      console.log(`[Snooze Cron] ⚠️ Siswa ${lead.id_siswa} mencabut izin WA. Mendepak dari antrean snooze...`);
      await pool.query(
        `UPDATE snooze_state SET is_active = 0, snooze_until = NULL, updated_at = NOW() WHERE id_siswa = ?`,
        [lead.id_siswa]
      );
      await pool.query(
        `UPDATE siswa_nurturing_state SET snooze_until = NULL, updated_at = NOW() WHERE id_siswa = ? AND marketing_period = ?`,
        [lead.id_siswa, mp]
      );
      await pool.query(
        `UPDATE siswa_periode
         SET status_terkini = 'Tidak Lanjut', next_action = 'Tidak Ada', alasan_tidak_lanjut = 'Consent Withdrawn'
         WHERE id_siswa = ? AND marketing_period = ?`,
        [lead.id_siswa, mp]
      );
      await recordEvent(
        'SnoozeAborted',
        lead.id_siswa,
        {
          id_siswa: lead.id_siswa,
          reason: 'Consent Withdrawn',
          marketing_period: mp,
        },
        'System/Cron',
        mp
      );
      abortedConsent++;
      continue; // Langsung depak tanpa eskalasi manual CRO
    }

    // ── STEP 2: Eksekusi Jatuh Tempo (SnoozeFired) ──────────────────────────
    const nextLevel = (lead.snooze_level || 0) + 1;

    if (nextLevel <= 3) {
      await _sendSnoozeTemplate(lead, nextLevel, mp, credentials);
      woken++;
    } else {
      // ── STEP 3: Kadaluwarsa / Opt-Out (SnoozeExpired: Closed-Lost) ──────────
      await pool.query(
        `UPDATE snooze_state SET is_active = 0, snooze_until = NULL, updated_at = NOW() WHERE id_siswa = ?`,
        [lead.id_siswa]
      );
      await pool.query(
        `UPDATE siswa_nurturing_state SET snooze_until = NULL, updated_at = NOW() WHERE id_siswa = ? AND marketing_period = ?`,
        [lead.id_siswa, mp]
      );
      await pool.query(
        `UPDATE siswa_periode
         SET status_terkini = 'Tidak Lanjut', next_action = 'Tidak Ada', alasan_tidak_lanjut = 'Tidak Merespons (Snooze Campaign Selesai)'
         WHERE id_siswa = ? AND marketing_period = ?`,
        [lead.id_siswa, mp]
      );
      await recordEvent(
        'SnoozeExpired',
        lead.id_siswa,
        {
          id_siswa: lead.id_siswa,
          result: 'Closed-Lost',
          snooze_level: lead.snooze_level,
          marketing_period: mp,
        },
        'System/Cron',
        mp
      );
      await logActivity(
        lead.id_siswa, 'Auto-Snooze-Terminasi',
        'Tidak Lanjut (Snooze Campaign Selesai)',
        'Snooze level 3 habis, siswa tidak merespons.', 'cron'
      );
      terminated++;
    }
  }

  console.log(`[Snooze Cron] ✅ Selesai. Dibangunkan: ${woken}, Diterminasi: ${terminated}, Aborted (Consent): ${abortedConsent}`);
  return { woken, terminated, abortedConsent };
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

async function _sendProbe(lead, newLevel, mp, credentials) {
  const templateName = `probe_${newLevel}`;
  console.log(`[Nurturing] Kirim ${templateName} ke ${lead.nama_lengkap} (${lead.wa})`);

  // Deteksi Service Window (Smart Routing — Rule 2)
  let isSwOpen = false;
  try {
    const [swRows] = await pool.query(
      'SELECT window_expires_at FROM wa_service_window WHERE wa_number = ? AND window_expires_at > NOW() LIMIT 1',
      [lead.wa]
    );
    isSwOpen = swRows.length > 0;
  } catch (_) {
    isSwOpen = false;
  }

  if (credentials && credentials.token && credentials.phoneId) {
    try {
      if (isSwOpen) {
        // Smart Routing SW Open: kirim text/interactive gratis tanpa biaya template Meta
        await axios.post(
          `https://graph.facebook.com/v19.0/${credentials.phoneId}/messages`,
          {
            messaging_product: 'whatsapp',
            to: lead.wa,
            type: 'text',
            text: { body: `Halo ${lead.nama_lengkap}, kami ingin berbagi informasi lanjutan terkait peluang pelatihan/studi bersama kami. Apakah ada hal yang ingin ditanyakan?` },
          },
          {
            headers: {
              Authorization: `Bearer ${credentials.token}`,
              'Content-Type': 'application/json',
            },
            timeout: 12000,
          }
        );
        console.log(`[Nurturing] ✅ Pesan SW Terbuka (bebas biaya) terkirim ke ${lead.wa}`);
      } else {
        // SW Closed: Kirim template resmi Meta (Berbayar)
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
      }
    } catch (err) {
      console.error(`[Nurturing] ❌ Gagal kirim ${templateName} ke ${lead.wa}:`, err.response?.data?.error?.message || err.message);
    }
  } else {
    console.warn(`[Nurturing] ⚠️ Kredensial Meta tidak tersedia. Mode Mocking untuk ${templateName}`);
  }

  // Update Projection Read Model
  await pool.query(
    `UPDATE siswa_nurturing_state
     SET probe_level = ?, last_probe_sent_at = NOW(), updated_at = NOW()
     WHERE id_siswa = ? AND marketing_period = ?`,
    [newLevel, lead.id_siswa, mp]
  );

  // Rekam event immutable ProbeSent ke events_log
  await recordEvent(
    'ProbeSent',
    lead.id_siswa,
    {
      id_siswa: lead.id_siswa,
      probe_level: newLevel,
      template_name: templateName,
      is_sw_open: isSwOpen,
      marketing_period: mp,
    },
    'System/Cron',
    mp
  );

  await logActivity(
    lead.id_siswa,
    'Auto-Probing WhatsApp',
    `Probe ${newLevel} Terkirim`,
    `Template probe_${newLevel} dikirim ke nomor ${lead.wa} (SW: ${isSwOpen ? 'Open' : 'Closed'}).`,
    'cron'
  );
}

async function _sendSnoozeTemplate(lead, level, mp, credentials) {
  const templateName = `snooze_${level}`;
  console.log(`[Snooze] Kirim ${templateName} ke ${lead.nama_lengkap} (${lead.wa})`);

  // Deteksi Service Window (Smart Routing — Rule 2)
  let isSwOpen = false;
  try {
    const [swRows] = await pool.query(
      'SELECT window_expires_at FROM wa_service_window WHERE wa_number = ? AND window_expires_at > NOW() LIMIT 1',
      [lead.wa]
    );
    isSwOpen = swRows.length > 0;
  } catch (_) {
    isSwOpen = false;
  }

  if (credentials && credentials.token && credentials.phoneId) {
    try {
      if (isSwOpen) {
        // Smart Routing SW Open: kirim sapaan ramah gratis
        await axios.post(
          `https://graph.facebook.com/v19.0/${credentials.phoneId}/messages`,
          {
            messaging_product: 'whatsapp',
            to: lead.wa,
            type: 'text',
            text: {
              body: `Halo kak ${lead.nama_lengkap}! Mengingatkan kembali info pelatihan yang sempat ditunda sebelumnya. Apakah saat ini kakak sudah siap berdiskusi kembali?`,
            },
          },
          {
            headers: {
              Authorization: `Bearer ${credentials.token}`,
              'Content-Type': 'application/json',
            },
            timeout: 12000,
          }
        );
        console.log(`[Snooze] ✅ Pesan SW Terbuka terkirim ke ${lead.wa}`);
      } else {
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
      }
    } catch (err) {
      console.error(`[Snooze] ❌ Gagal kirim ${templateName} ke ${lead.wa}:`, err.response?.data?.error?.message || err.message);
    }
  } else {
    console.warn(`[Snooze] ⚠️ Kredensial Meta tidak tersedia. Mode Mocking untuk ${templateName}`);
  }

  const newSnoozeUntil = new Date();
  newSnoozeUntil.setDate(newSnoozeUntil.getDate() + 90);
  const newSnoozeUntilStr = newSnoozeUntil.toISOString().split('T')[0];

  // Update Projections (snooze_state & siswa_nurturing_state)
  await pool.query(
    `INSERT INTO snooze_state (id_siswa, marketing_period, is_active, snooze_until, snooze_level, updated_at)
     VALUES (?, ?, 1, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       is_active = 1,
       snooze_until = VALUES(snooze_until),
       snooze_level = VALUES(snooze_level),
       updated_at = NOW()`,
    [lead.id_siswa, mp, newSnoozeUntilStr, level]
  );

  await pool.query(
    `UPDATE siswa_nurturing_state
     SET snooze_level = ?, snooze_until = ?, updated_at = NOW()
     WHERE id_siswa = ? AND marketing_period = ?`,
    [level, newSnoozeUntil, lead.id_siswa, mp]
  );

  // Rekam event immutable SnoozeFired ke events_log
  await recordEvent(
    'SnoozeFired',
    lead.id_siswa,
    {
      id_siswa: lead.id_siswa,
      snooze_level: level,
      template_name: templateName,
      is_sw_open: isSwOpen,
      next_snooze_until: newSnoozeUntilStr,
      marketing_period: mp,
    },
    'System/Cron',
    mp
  );

  await logActivity(
    lead.id_siswa,
    'Auto-Snooze WhatsApp',
    `Snooze ${level} Terkirim`,
    `Template ${templateName} dikirim (SW: ${isSwOpen ? 'Open' : 'Closed'}). Snooze baru hingga ${newSnoozeUntilStr}.`,
    'cron'
  );
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  getStats,
  getLeads,
  getSnoozeStats,
  getSnoozeLeads,
  startNurturing,
  takeoverLead,
  addManualSnooze,
  stopSnooze,
  runNurturingCron,
  runSnoozeCron,
};

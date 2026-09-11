'use strict';

/**
 * crm.sekolah.service.js
 * Service Modul Sekolah — Event-Sourcing Fase 1 (Ontologi Nexa OS)
 *
 * Arsitektur Pragmatic Event-Sourcing:
 *   - Write Model : `aktivitas_sekolah` (Append-Only Event Log)
 *   - Read Model  : `sekolah_periode`   (Proyeksi, di-update otomatis oleh Rule Engine)
 *
 * Skema tabel (production 2026-09):
 *   master_sekolah   : id_sekolah, nama_sekolah, jenjang, status_sekolah,
 *                      kecamatan, alamat, pic_utama, wa_pic, pj_sekolah,
 *                      created_date, last_updated
 *   pic_sekolah      : id_sekolah, nama, jabatan, no_wa, bsuid
 *   sekolah_periode  : id_record, marketing_period, id_sekolah, pj_sekolah,
 *                      status_terkini, next_action, due_date, status_updated_date,
 *                      status_jadwal, catatan, created_date, last_updated,
 *                      sekolah_aktif, jumlah_siswa, alasan_tidak_bisa_sosialisasi,
 *                      cal_event_id, intent (NEW — VARCHAR(10): 'High'|'Mid'|'Low')
 *   aktivitas_sekolah: id (PK), marketing_period, timestamp, tanggal,
 *                      id_sekolah_nama, sekolah_aktif, aktivitas, pic, wa_pic,
 *                      jabatan_pic, hasil, status_terkini, next_action, due_date,
 *                      status_jadwal, catatan, jumlah_siswa,
 *                      alasan_tidak_bisa_sosialisasi
 *   aktivitas_ekstra : id_aktifitas_ekstra, marketing_period, id_sekolah,
 *                      aktivitas, tanggal_rencana, tujuan_catatan, pj_aktivitas,
 *                      status_aktivitas, tanggal_realisasi, catatan_hasil,
 *                      timestamp, last_updated
 */

const { pool, mainPool } = require('../../config/database');

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Cek Kuota Sekolah di Main Registry
// ─────────────────────────────────────────────────────────────────────────────
async function _checkSekolahLimits(requiredCount = 1) {
  const { tenantStorage } = require('../../config/database');
  let tenantId = tenantStorage.getStore();

  if (!tenantId) {
    throw new Error("Gagal: Konteks Tenant tidak ditemukan. Akses diblokir demi keamanan data (Data Spillage Protection).");
  }

  const [tenantRows] = await mainPool.query("SELECT limit_sekolah, used_sekolah FROM tenants WHERE tenant_id = ?", [tenantId]);
  if (tenantRows.length === 0) return { tenantId };

  const { limit_sekolah, used_sekolah } = tenantRows[0];
  const sisa = (limit_sekolah || 0) - (used_sekolah || 0);

  if (sisa < requiredCount) {
    const err = new Error(`Kuota input sekolah telah habis atau tidak mencukupi (Sisa: ${sisa}, Dibutuhkan: ${requiredCount}). Silakan upgrade tier.`);
    err.isQuotaError = true;
    throw err;
  }
  return { tenantId };
}

async function _incrementUsedSekolah(tenantId, incrementCount) {
  if (!tenantId) return;
  await mainPool.query("UPDATE tenants SET used_sekolah = used_sekolah + ? WHERE tenant_id = ?", [incrementCount, tenantId]);
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERACTION OUTCOME MAP (Event-Sourcing Fase 1)
//
// Setiap `outcome` yang dipilih CRO menghasilkan sebuah Event yang dicatat di
// aktivitas_sekolah (Write Model / Event Log). Backend Rule Engine kemudian
// membaca event tersebut dan mengupdate `sekolah_periode` (Read Model / Proyeksi).
//
// Pipeline Commercial State:
//   Cold/Belum Visit → Engaged/Proses → Sosialisasi Terjadwal
//                    → Sudah Sosialisasi → Lead Captured
// ─────────────────────────────────────────────────────────────────────────────

// Tipe event yang dihasilkan dari setiap outcome (untuk Event Log label di UI)
const OUTCOME_EVENT_TYPE = {
  'PIC Tidak di Tempat / Menunggu Respon': 'InteractionLogged',
  'PIC Minta Proposal Ditinggal':          'InteractionLogged',
  'PIC Minta Kembali Minggu Depan':        'InteractionLogged',
  'Diminta Meeting':                       'InteractionLogged',
  'Menunggu Keputusan':                    'InteractionLogged',
  'Mendapat Izin Sosialisasi':             'SosialisasiApproved',
  'Jadwal Sosialisasi Ditunda':            'InteractionLogged',
  'Jadwal Sosialisasi Dibatalkan':         'InteractionLogged',
  'PIC Berganti — Perlu Visit Ulang':      'InteractionLogged',
  'Sosialisasi Selesai':                   'SosialisasiCompleted',
  'Data Siswa Terinput':                   'BatchStudentsImported',
  'Ditolak Final':                         'SosialisasiRejected',
  'Tutup / Merger':                        'SchoolClosed',
};

// Mapping outcome → hasil transisi state (Read Model update)
const INTERACTION_OUTCOME_MAP = {
  // ── Outcomes yang menghasilkan InteractionLogged (tetap di Engaged/Proses)
  'PIC Tidak di Tempat / Menunggu Respon': { status: 'Tunggu Visit Ulang',        nextAction: 'Visit Ulang',            isTerminal: false, isDowngrade: false, requiresAlasan: false, requiresTanggalSos: false },
  'PIC Minta Proposal Ditinggal':          { status: 'Tunggu Visit Ulang',        nextAction: 'Visit Ulang',            isTerminal: false, isDowngrade: false, requiresAlasan: false, requiresTanggalSos: false },
  'PIC Minta Kembali Minggu Depan':        { status: 'Tunggu Visit Ulang',        nextAction: 'Visit Ulang',            isTerminal: false, isDowngrade: false, requiresAlasan: false, requiresTanggalSos: false },
  'Diminta Meeting':                       { status: 'Tunggu Keputusan',          nextAction: 'Meeting PIC',            isTerminal: false, isDowngrade: false, requiresAlasan: false, requiresTanggalSos: false },
  'Menunggu Keputusan':                    { status: 'Tunggu Keputusan',          nextAction: 'Follow Up',              isTerminal: false, isDowngrade: false, requiresAlasan: false, requiresTanggalSos: false },

  // ── Outcomes yang menghasilkan SosialisasiApproved (wajib tanggal sosialisasi)
  'Mendapat Izin Sosialisasi':             { status: 'Sosialisasi Terjadwal',     nextAction: 'Laksanakan Sosialisasi', isTerminal: false, isDowngrade: false, requiresAlasan: false, requiresTanggalSos: true },

  // ── Outcomes downgrade
  'Jadwal Sosialisasi Ditunda':            { status: 'Tunggu Jadwal Sosialisasi', nextAction: 'Jadwalkan Sosialisasi',  isTerminal: false, isDowngrade: true,  requiresAlasan: false, requiresTanggalSos: false },
  'Jadwal Sosialisasi Dibatalkan':         { status: 'Tunggu Jadwal Sosialisasi', nextAction: 'Jadwalkan Sosialisasi',  isTerminal: false, isDowngrade: true,  requiresAlasan: false, requiresTanggalSos: false },
  'PIC Berganti — Perlu Visit Ulang':      { status: 'Tunggu Visit Ulang',        nextAction: 'Visit Ulang',            isTerminal: false, isDowngrade: true,  requiresAlasan: false, requiresTanggalSos: false },

  // ── Outcomes yang menghasilkan SosialisasiCompleted
  'Sosialisasi Selesai':                   { status: 'Sudah Sosialisasi',         nextAction: 'Input Data Siswa',       isTerminal: false, isDowngrade: false, requiresAlasan: false, requiresTanggalSos: false, autoH1: true },

  // ── Outcomes terminal
  'Data Siswa Terinput':                   { status: 'Identity Captured',         nextAction: null,                     isTerminal: true,  isDowngrade: false, requiresAlasan: false, requiresTanggalSos: false },
  'Ditolak Final':                         { status: 'Tidak Bisa Sosialisasi',    nextAction: null,                     isTerminal: true,  isDowngrade: false, requiresAlasan: true,  requiresTanggalSos: false },
  'Tutup / Merger':                        { status: 'Nonaktif / Tutup / Merger', nextAction: null,                     isTerminal: true,  isDowngrade: false, requiresAlasan: false, requiresTanggalSos: false },
};

// Backward-compatible alias (endpoint lama /aktivitas masih pakai ini)
const HASIL_AKTIVITAS_SEKOLAH = {
  'Belum Bertemu PIC':                { status: 'Tunggu Visit Ulang',        nextAction: 'Visit Ulang' },
  'Diminta Visit Ulang':              { status: 'Tunggu Visit Ulang',        nextAction: 'Visit Ulang' },
  'Menunggu Keputusan':               { status: 'Tunggu Keputusan',          nextAction: 'Follow Up' },
  'Diminta Meeting':                  { status: 'Tunggu Keputusan',          nextAction: 'Meeting PIC' },
  'Izin Sosialisasi':                 { status: 'Tunggu Jadwal Sosialisasi', nextAction: 'Jadwalkan Sosialisasi' },
  'Jadwal Sosialisasi Disepakati':    { status: 'Sosialisasi Terjadwal',     nextAction: 'Laksanakan Sosialisasi' },
  'Jadwal Sosialisasi Ditunda':       { status: 'Tunggu Jadwal Sosialisasi', nextAction: 'Jadwalkan Sosialisasi' },
  'Jadwal Sosialisasi Dibatalkan':    { status: 'Tunggu Jadwal Sosialisasi', nextAction: 'Jadwalkan Sosialisasi', isDowngrade: true },
  'PIC Berganti — Perlu Visit Ulang': { status: 'Tunggu Visit Ulang',        nextAction: 'Visit Ulang', isDowngrade: true },
  'Sosialisasi Selesai':              { status: 'Sudah Sosialisasi',         nextAction: 'Input Data Siswa', autoH1: true },
  'Data Siswa Terinput':              { status: 'Identity Captured',         nextAction: 'Tidak Ada', isTerminal: true },
  'Ditolak Final':                    { status: 'Tidak Bisa Sosialisasi',    nextAction: 'Tidak Ada', isTerminal: true, requiresAlasan: true },
  'Tutup / Merger':                   { status: 'Nonaktif / Tutup / Merger', nextAction: 'Tidak Ada', isTerminal: true },
};

function cleanPhone(wa) {
  return wa ? String(wa).replace(/[^0-9]/g, '') : '';
}

function getPipelineStateFromStatus(status) {
  if (['Belum Visit', 'Tunggu Visit Ulang'].includes(status)) return 'Identified';
  if (['Tunggu Keputusan', 'Tunggu Jadwal Sosialisasi', 'Diminta Meeting'].includes(status)) return 'Engaged';
  if (status === 'Sosialisasi Terjadwal') return 'Sosialisasi Terjadwal';
  if (status === 'Sudah Sosialisasi') return 'Sudah Sosialisasi';
  if (['Identity Captured', 'Data Siswa Terinput'].includes(status)) return 'Identity Captured';
  if (['Tidak Bisa Sosialisasi', 'Nonaktif / Tutup / Merger', 'Ditolak Final'].includes(status)) return 'Disqualified';
  return 'Identified';
}

async function getActivePeriod() {
  const [rows] = await pool.query(
    "SELECT nama_period FROM marketing_period WHERE status = 'aktif' ORDER BY created_date DESC LIMIT 1"
  );
  return rows.length > 0 ? rows[0].nama_period : '-';
}

// ═══════════════════════════════════════════════════════════════════
// GET /api/v1/sekolah  — List dengan filter & paginasi
// ═══════════════════════════════════════════════════════════════════
async function listSekolah(user, query = {}) {
  let mp = query.period || user.selectedPeriod;
  if (!mp || mp === '-') mp = await getActivePeriod();

  const page     = Math.max(1, parseInt(query.page || '1', 10));
  const pageSize = 20;
  const offset   = (page - 1) * pageSize;

  const whereParts = ['sp.marketing_period = ?'];
  const params     = [mp];

  if (user.role === 'CRO') { whereParts.push('sp.pj_sekolah = ?'); params.push(user.nama); }
  if (query.status)     { whereParts.push('(sp.pipeline_state = ? OR sp.status_terkini = ?)'); params.push(query.status, query.status); }
  if (query.kecamatan)  { whereParts.push('ms.kecamatan = ?');      params.push(query.kecamatan); }
  if (query.pjCro)      { whereParts.push('sp.pj_sekolah = ?');     params.push(query.pjCro); }
  if (query.intent)     { whereParts.push('sp.intent = ?');         params.push(query.intent); }
  if (query.search) {
    const s = `%${query.search}%`;
    whereParts.push('(ms.nama_sekolah LIKE ? OR sp.id_sekolah LIKE ? OR ms.kecamatan LIKE ?)');
    params.push(s, s, s);
  }

  const where = whereParts.join(' AND ');

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) as total FROM sekolah_periode sp
     LEFT JOIN master_sekolah ms ON sp.id_sekolah = ms.id_sekolah
     WHERE ${where}`,
    params
  );
  const totalCount = parseInt(total, 10);
  if (totalCount === 0) return { data: [], total: 0, page, pageSize, totalPages: 0 };

  const [rows] = await pool.query(`
    SELECT
      IFNULL(sp.id_record,  '')                              AS idRecord,
      IFNULL(sp.id_sekolah, '')                              AS id,
      IFNULL(ms.nama_sekolah, '')                            AS nama,
      IFNULL(ms.jenjang, '')                                 AS tingkat,
      IFNULL(ms.kecamatan, '')                               AS kecamatan,
      IFNULL(ms.alamat, '')                                  AS alamat,
      IFNULL(ms.status_sekolah, 'Belum Diketahui')           AS statusAktif,
      IFNULL(ms.pic_utama, '')                               AS picNama,
      IFNULL(ms.wa_pic, '')                                  AS picWa,
      IFNULL(sp.pj_sekolah, '')                              AS pjCro,
      IFNULL(sp.status_terkini, '')                          AS status,
      IFNULL(sp.pipeline_state, sp.status_terkini)           AS pipelineState,
      IFNULL(sp.status_terkini, '')                          AS commercialState,
      IFNULL(sp.intent, '')                                  AS intent,
      IFNULL(sp.next_action, '')                             AS nextAction,
      IFNULL(DATE_FORMAT(sp.due_date,'%Y-%m-%d'), '')        AS dueDate,
      IFNULL(sp.marketing_period, '')                        AS marketingPeriod,
      IFNULL(DATEDIFF(CURDATE(), sp.status_updated_date), 0) AS aging
    FROM sekolah_periode sp
    LEFT JOIN master_sekolah ms ON sp.id_sekolah = ms.id_sekolah
    WHERE ${where}
    ORDER BY sp.status_updated_date DESC
    LIMIT ${pageSize} OFFSET ${offset}
  `, params);

  const data = rows.map(r => ({
    idRecord:        r.idRecord,
    id:              r.id,
    nama:            r.nama,
    tingkat:         r.tingkat,
    kecamatan:       r.kecamatan,
    alamat:          r.alamat,
    statusAktif:     r.statusAktif,
    pic:             r.picNama ? { nama: r.picNama, jabatan: '', noWa: r.picWa } : null,
    pjCro:           r.pjCro,
    status:          r.status,
    pipelineState:   r.pipelineState || getPipelineStateFromStatus(r.status),
    commercialState: r.commercialState || r.status,
    intent:          r.intent || null,
    nextAction:      r.nextAction,
    dueDate:         r.dueDate || null,
    marketingPeriod: r.marketingPeriod,
    aging:           parseInt(r.aging, 10) || 0,
  }));

  return { data, total: totalCount, page, pageSize, totalPages: Math.ceil(totalCount / pageSize) };
}

// ═══════════════════════════════════════════════════════════════════
// GET /api/v1/sekolah/stats
// ═══════════════════════════════════════════════════════════════════
async function statSekolah(user, query = {}) {
  let mp = query.period || user.selectedPeriod;
  if (!mp || mp === '-') mp = await getActivePeriod();

  const whereParts = ['sp.marketing_period = ?'];
  const params = [mp];
  if (user.role === 'CRO') { whereParts.push('sp.pj_sekolah = ?'); params.push(user.nama); }
  const where = whereParts.join(' AND ');

  const [rows] = await pool.query(
    `SELECT COALESCE(sp.pipeline_state, 'Identified') AS pipeline_state, COUNT(*) AS cnt 
     FROM sekolah_periode sp 
     WHERE ${where} 
     GROUP BY COALESCE(sp.pipeline_state, 'Identified')`,
    params
  );

  const map = {};
  let total = 0;
  rows.forEach(r => { 
    const key = r.pipeline_state || 'Identified';
    map[key] = (map[key] || 0) + parseInt(r.cnt, 10); 
    total += parseInt(r.cnt, 10); 
  });

  return {
    total,
    cold:                 map['Identified'] || 0,
    belumVisit:           map['Identified'] || 0,
    engaged:              map['Engaged']    || 0,
    proses:               map['Engaged']    || 0,
    sosialisasiTerjadwal: map['Sosialisasi Terjadwal'] || 0,
    sosialisasi:          map['Sudah Sosialisasi'] || 0,
    identityCaptured:     (map['Identity Captured'] || 0) + (map['Lead Captured'] || 0),
    leadCaptured:         (map['Identity Captured'] || 0) + (map['Lead Captured'] || 0),
    tidakBisa:            map['Disqualified'] || 0,
    nonaktif:             map['Disqualified'] || 0,
  };
}

// ═══════════════════════════════════════════════════════════════════
// GET /api/v1/sekolah/:id — Detail + Event Log
// ═══════════════════════════════════════════════════════════════════
async function detailSekolah(id, user, query = {}) {
  let mp = query.period || user.selectedPeriod;
  if (!mp || mp === '-') mp = await getActivePeriod();

  const [[row]] = await pool.query(`
    SELECT
      IFNULL(sp.id_record,  '')                              AS idRecord,
      IFNULL(ms.id_sekolah, '')                              AS id,
      IFNULL(ms.nama_sekolah, '')                            AS nama,
      IFNULL(ms.jenjang, '')                                 AS tingkat,
      IFNULL(ms.kecamatan, '')                               AS kecamatan,
      IFNULL(ms.alamat, '')                                  AS alamat,
      IFNULL(ms.status_sekolah, 'Belum Diketahui')           AS statusAktif,
      IFNULL(ps.nama, ms.pic_utama)                          AS picNama,
      IFNULL(ps.no_wa, ms.wa_pic)                            AS picWa,
      IFNULL(ps.bsuid, '')                                   AS bsuid,
      IFNULL(sp.pj_sekolah, '')                              AS pjCro,
      IFNULL(sp.jumlah_siswa, 0)                             AS jumlahSiswaKelas12,
      IFNULL(sp.status_terkini, '')                          AS status,
      IFNULL(sp.status_terkini, '')                          AS commercialState,
      IFNULL(sp.intent, '')                                  AS intent,
      IFNULL(sp.next_action, '')                             AS nextAction,
      IFNULL(DATE_FORMAT(sp.due_date,'%Y-%m-%d'), '')        AS dueDate,
      IFNULL(sp.marketing_period, '')                        AS marketingPeriod,
      IFNULL(sp.alasan_tidak_bisa_sosialisasi, '')           AS alasanTidakBisa,
      IFNULL(sp.catatan, '')                                 AS catatan,
      IFNULL(sp.sekolah_aktif, '')                           AS sekolahAktif,
      IFNULL(DATEDIFF(CURDATE(), sp.status_updated_date), 0) AS aging
    FROM sekolah_periode sp
    LEFT JOIN master_sekolah ms ON sp.id_sekolah = ms.id_sekolah
    LEFT JOIN pic_sekolah ps ON sp.id_sekolah = ps.id_sekolah
    WHERE sp.marketing_period = ? AND sp.id_sekolah = ?
    LIMIT 1
  `, [mp, id]);

  if (!row) return null;

  const s = {
    ...row,
    aging:              parseInt(row.aging, 10) || 0,
    jumlahSiswaKelas12: parseInt(row.jumlahSiswaKelas12, 10) || 0,
    dueDate:            row.dueDate || null,
    intent:             row.intent || null,
    commercialState:    row.commercialState,
    pic:                (row.picNama || row.bsuid) ? { nama: row.picNama, jabatan: '', noWa: row.picWa, bsuid: row.bsuid } : null,
  };
  delete s.picNama; delete s.picWa; delete s.bsuid;

  // ── Event Log (aktivitas_sekolah — Append-Only) ─────────────────
  const [aktRows] = await pool.query(`
    SELECT
      id                                                      AS id,
      IFNULL(aktivitas, '')                                   AS jenisAktivitas,
      IFNULL(DATE_FORMAT(tanggal, '%Y-%m-%d'), '')            AS tanggal,
      IFNULL(hasil, '')                                       AS hasilAktivitas,
      IFNULL(hasil, '')                                       AS outcome,
      IFNULL(status_terkini, '')                              AS statusSesudah,
      IFNULL(next_action, '')                                 AS nextAction,
      IFNULL(DATE_FORMAT(due_date, '%Y-%m-%d'), '')           AS dueDate,
      IFNULL(catatan, '')                                     AS catatan,
      IFNULL(pic, '')                                         AS picNama,
      IFNULL(jabatan_pic, '')                                 AS picJabatan,
      IFNULL(wa_pic, '')                                      AS picWa,
      IFNULL(jumlah_siswa, 0)                                 AS jumlahSiswa,
      IFNULL(sekolah_aktif, '')                               AS statusAktif,
      IFNULL(alasan_tidak_bisa_sosialisasi, '')               AS alasanTidakBisa,
      IFNULL(DATE_FORMAT(\`timestamp\`, '%Y-%m-%dT%H:%i:%s'), '') AS createdAt
    FROM aktivitas_sekolah
    WHERE id_sekolah_nama LIKE ? AND marketing_period = ?
    ORDER BY \`timestamp\` DESC
  `, [`${id}%`, mp]);

  s.aktivitas = aktRows.map(r => ({
    id:             r.id,
    jenisAktivitas: r.jenisAktivitas,
    tanggal:        r.tanggal || null,
    hasilAktivitas: r.hasilAktivitas,
    outcome:        r.outcome,
    // Event type label untuk UI Event Log
    eventType:      OUTCOME_EVENT_TYPE[r.outcome] || 'InteractionLogged',
    statusSesudah:  r.statusSesudah,
    nextAction:     r.nextAction || null,
    dueDate:        r.dueDate || null,
    catatan:        r.catatan,
    pic:            r.picNama ? { nama: r.picNama, jabatan: r.picJabatan, noWa: r.picWa } : null,
    jumlahSiswa:    parseInt(r.jumlahSiswa, 10) || null,
    statusAktif:    r.statusAktif || null,
    alasanTidakBisa: r.alasanTidakBisa || null,
    createdAt:      r.createdAt,
  }));

  // ── Aktivitas Ekstra ────────────────────────────────────────────
  const [ekstraRows] = await pool.query(`
    SELECT
      id_aktifitas_ekstra                                         AS id,
      IFNULL(aktivitas, '')                                       AS jenisAktivitas,
      IFNULL(DATE_FORMAT(tanggal_rencana, '%Y-%m-%d'), '')        AS tanggalRencana,
      IFNULL(DATE_FORMAT(tanggal_realisasi, '%Y-%m-%d'), '')      AS tanggalRealisasi,
      IFNULL(tujuan_catatan, '')                                  AS tujuanCatatan,
      IFNULL(pj_aktivitas, '')                                    AS pjAktivitas,
      IFNULL(status_aktivitas, '')                                AS statusAktivitas,
      IFNULL(catatan_hasil, '')                                   AS catatanHasil,
      IFNULL(DATE_FORMAT(\`timestamp\`, '%Y-%m-%dT%H:%i:%s'), '') AS createdAt
    FROM aktivitas_ekstra
    WHERE id_sekolah LIKE ? AND marketing_period = ?
    ORDER BY \`timestamp\` DESC
  `, [`${id}%`, mp]);

  s.aktivitasEkstra = ekstraRows.map(r => ({
    id:               r.id,
    jenisAktivitas:   r.jenisAktivitas,
    tanggalRencana:   r.tanggalRencana || null,
    tanggalRealisasi: r.tanggalRealisasi || null,
    tujuanCatatan:    r.tujuanCatatan,
    pjAktivitas:      r.pjAktivitas,
    statusAktivitas:  r.statusAktivitas,
    catatanHasil:     r.catatanHasil || null,
    createdAt:        r.createdAt,
  }));

  return s;
}

// ═══════════════════════════════════════════════════════════════════
// POST /api/v1/sekolah/:id/interactions
// EVENT-SOURCING: Catat Interaksi / Event Log
// Menghasilkan Event: InteractionLogged, SosialisasiRejected, dsb
// ═══════════════════════════════════════════════════════════════════
async function logInteraction(sekolahId, data, user) {
  const mapping = INTERACTION_OUTCOME_MAP[data.outcome];
  if (!mapping) throw new Error('Outcome interaksi tidak valid: ' + data.outcome);

  if (!data.catatanFakta || data.catatanFakta.trim().length < 5) {
    throw new Error('Catatan fakta wajib diisi (minimal 5 karakter).');
  }
  if (mapping.isDowngrade && data.catatanFakta.trim().length < 10) {
    throw new Error('Catatan fakta minimal 10 karakter untuk outcome downgrade.');
  }
  if (mapping.requiresAlasan && !data.alasanTidakBisa) {
    throw new Error('Alasan tidak bisa sosialisasi wajib diisi.');
  }
  if (mapping.requiresTanggalSos && !data.tanggalSosialisasi) {
    throw new Error('Tanggal sosialisasi disepakati wajib diisi untuk outcome ini.');
  }

  const mp  = await getActivePeriod();
  const now = new Date();
  const tgl = data.tanggalInteraksi ? new Date(data.tanggalInteraksi) : now;

  let dueDate = null;
  if (data.tanggalSosialisasi) {
    dueDate = new Date(data.tanggalSosialisasi);
  } else if (mapping.autoH1) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    dueDate = d;
  }

  const statusJadwal = mapping.isTerminal ? 'Tidak ada jadwal'
    : (dueDate ? 'Terjadwal' : 'Menunggu Penjadwalan');

  const alasanVal = mapping.requiresAlasan
    ? (data.alasanTidakBisa === 'Alasan lainnya'
        ? `Alasan lainnya: ${data.catatanAlasan || ''}` : data.alasanTidakBisa)
    : '';

  const [[msRow]] = await pool.query('SELECT nama_sekolah FROM master_sekolah WHERE id_sekolah = ? LIMIT 1', [sekolahId]);
  const idSekolahNama = `${sekolahId}-${msRow?.nama_sekolah || ''}`;

  // Resolusi event type
  const eventType = OUTCOME_EVENT_TYPE[data.outcome] || 'InteractionLogged';

  // ── Write Model: INSERT ke aktivitas_sekolah (Event Log)
  await pool.query(
    `INSERT INTO aktivitas_sekolah
       (marketing_period, \`timestamp\`, tanggal, id_sekolah_nama,
        sekolah_aktif, aktivitas, pic, wa_pic, jabatan_pic,
        hasil, status_terkini, next_action, due_date, status_jadwal,
        catatan, jumlah_siswa, alasan_tidak_bisa_sosialisasi)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      mp, now, tgl, idSekolahNama,
      data.statusAktif || '',
      data.channel || 'Visit Langsung',
      data.namaPic || '',
      cleanPhone(data.noWaPic || ''),
      data.jabatanPic || '',
      data.outcome,
      mapping.status,
      mapping.nextAction || null,
      dueDate,
      statusJadwal,
      data.catatanFakta || '',
      data.jumlahSiswaKelas12 ? Number(data.jumlahSiswaKelas12) : null,
      alasanVal,
    ]
  );

  // ── Read Model: UPDATE sekolah_periode (Proyeksi via Rule Engine)
  const updClauses = [
    'status_terkini = ?', 'pipeline_state = ?', 'next_action = ?', 'due_date = ?',
    'status_jadwal = ?', 'status_updated_date = ?', 'last_updated = ?',
    'alasan_tidak_bisa_sosialisasi = ?',
  ];
  const updParams = [
    mapping.status, getPipelineStateFromStatus(mapping.status), mapping.nextAction || null,
    dueDate, statusJadwal, now, now, alasanVal,
  ];

  if (data.statusAktif)        { updClauses.push('sekolah_aktif = ?');  updParams.push(data.statusAktif); }
  if (data.jumlahSiswaKelas12) { updClauses.push('jumlah_siswa = ?');   updParams.push(Number(data.jumlahSiswaKelas12)); }

  updParams.push(sekolahId, mp);
  await pool.query(
    `UPDATE sekolah_periode SET ${updClauses.join(', ')} WHERE id_sekolah = ? AND marketing_period = ?`,
    updParams
  );

  // Update master_sekolah (alamat, status aktif saat Visit Awal)
  const msClauses = ['last_updated = ?'];
  const msParams  = [now];
  if (data.statusAktif)   { msClauses.push('status_sekolah = ?'); msParams.push(data.statusAktif); }
  if (data.alamatLengkap) { msClauses.push('alamat = ?');         msParams.push(data.alamatLengkap); }
  if (msClauses.length > 1) {
    msParams.push(sekolahId);
    await pool.query(`UPDATE master_sekolah SET ${msClauses.join(', ')} WHERE id_sekolah = ?`, msParams);
  }

  // Update pic_sekolah
  const psUpdates = [];
  const psParams = [];
  if (data.namaPic)    { psUpdates.push('nama = ?');    psParams.push(data.namaPic); }
  if (data.noWaPic)    { psUpdates.push('no_wa = ?');   psParams.push(cleanPhone(data.noWaPic)); }
  if (data.jabatanPic) { psUpdates.push('jabatan = ?'); psParams.push(data.jabatanPic); }

  if (psUpdates.length > 0) {
    const fields = psUpdates.map(u => u.split(' =')[0]);
    await pool.query(
      `INSERT INTO pic_sekolah (id_sekolah, ${fields.join(', ')}) VALUES (?, ${fields.map(() => '?').join(', ')})
       ON DUPLICATE KEY UPDATE ${psUpdates.join(', ')}`,
      [sekolahId, ...psParams, ...psParams]
    );
  }

  // Sync to Google Calendar
  if (dueDate) {
    const calendarService = require('./calendar/calendar.service');
    calendarService.syncEventToCalendar(user.id, {
      summary: idSekolahNama,
      description: `Sekolah: ${msRow?.nama_sekolah || ''}\nChannel: ${data.channel || 'Visit Langsung'}\nOutcome: ${data.outcome}\nCatatan: ${data.catatanFakta || ''}`,
      date: dueDate.toISOString().split('T')[0]
    }).catch(err => {
      console.error(`[Calendar Sync] logInteraction (${eventType}) failed:`, err.message);
    });
  }

  console.log(`[Event] ${eventType} — Sekolah ${sekolahId} → ${mapping.status}`);
  return detailSekolah(sekolahId, user, { period: mp });
}

// ═══════════════════════════════════════════════════════════════════
// POST /api/v1/sekolah/:id/sosialisasi/approve
// EVENT: SosialisasiApproved
// ═══════════════════════════════════════════════════════════════════
async function approveSosialisasi(sekolahId, data, user) {
  if (!data.tanggalSosialisasi) {
    throw new Error('Tanggal sosialisasi disepakati wajib diisi.');
  }

  const mp  = await getActivePeriod();
  const now = new Date();
  const tanggalSos = new Date(data.tanggalSosialisasi);

  const [[msRow]] = await pool.query('SELECT nama_sekolah FROM master_sekolah WHERE id_sekolah = ? LIMIT 1', [sekolahId]);
  const idSekolahNama = `${sekolahId}-${msRow?.nama_sekolah || ''}`;

  // Write Model: Event Log
  await pool.query(
    `INSERT INTO aktivitas_sekolah
       (marketing_period, \`timestamp\`, tanggal, id_sekolah_nama,
        sekolah_aktif, aktivitas, pic, wa_pic, jabatan_pic,
        hasil, status_terkini, next_action, due_date, status_jadwal,
        catatan, jumlah_siswa, alasan_tidak_bisa_sosialisasi)
     VALUES (?, ?, ?, ?, '', 'Visit Langsung', '', '', '',
             'Mendapat Izin Sosialisasi', 'Sosialisasi Terjadwal',
             'Laksanakan Sosialisasi', ?, 'Terjadwal', ?, NULL, '')`,
    [mp, now, now, idSekolahNama, tanggalSos, data.catatan || '']
  );

  // Read Model: Proyeksi
  await pool.query(
    `UPDATE sekolah_periode
     SET status_terkini = 'Sosialisasi Terjadwal',
         pipeline_state = 'Sosialisasi Terjadwal',
         next_action    = 'Laksanakan Sosialisasi',
         due_date       = ?,
         status_jadwal  = 'Terjadwal',
         status_updated_date = ?,
         last_updated   = ?
     WHERE id_sekolah = ? AND marketing_period = ?`,
    [tanggalSos, now, now, sekolahId, mp]
  );

  // Sync Google Calendar
  const calendarService = require('./calendar/calendar.service');
  calendarService.syncEventToCalendar(user.id, {
    summary: `Sosialisasi — ${idSekolahNama}`,
    description: `Sosialisasi terjadwal\nCatatan: ${data.catatan || ''}`,
    date: data.tanggalSosialisasi
  }).catch(err => {
    console.error('[Calendar Sync] approveSosialisasi failed:', err.message);
  });

  console.log(`[Event] SosialisasiApproved — Sekolah ${sekolahId} → Tanggal: ${data.tanggalSosialisasi}`);
  return detailSekolah(sekolahId, user, { period: mp });
}

// ═══════════════════════════════════════════════════════════════════
// POST /api/v1/sekolah/:id/sosialisasi/complete
// EVENT: SosialisasiCompleted
// ═══════════════════════════════════════════════════════════════════
async function completeSosialisasi(sekolahId, data, user) {
  const mp  = await getActivePeriod();
  const now = new Date();

  // Auto due H+1 untuk Input Data Siswa
  const dueH1 = new Date(now);
  dueH1.setDate(dueH1.getDate() + 1);

  const [[msRow]] = await pool.query('SELECT nama_sekolah FROM master_sekolah WHERE id_sekolah = ? LIMIT 1', [sekolahId]);
  const idSekolahNama = `${sekolahId}-${msRow?.nama_sekolah || ''}`;

  // Write Model: Event Log
  await pool.query(
    `INSERT INTO aktivitas_sekolah
       (marketing_period, \`timestamp\`, tanggal, id_sekolah_nama,
        sekolah_aktif, aktivitas, pic, wa_pic, jabatan_pic,
        hasil, status_terkini, next_action, due_date, status_jadwal,
        catatan, jumlah_siswa, alasan_tidak_bisa_sosialisasi)
     VALUES (?, ?, ?, ?, '', 'Laksanakan Sosialisasi', '', '', '',
             'Sosialisasi Selesai', 'Sudah Sosialisasi',
             'Input Data Siswa', ?, 'Terjadwal', ?, NULL, '')`,
    [mp, now, now, idSekolahNama, dueH1, data.catatan || '']
  );

  // Read Model: Proyeksi
  await pool.query(
    `UPDATE sekolah_periode
     SET status_terkini = 'Sudah Sosialisasi',
         pipeline_state = 'Sudah Sosialisasi',
         next_action    = 'Input Data Siswa',
         due_date       = ?,
         status_jadwal  = 'Terjadwal',
         status_updated_date = ?,
         last_updated   = ?
     WHERE id_sekolah = ? AND marketing_period = ?`,
    [dueH1, now, now, sekolahId, mp]
  );

  console.log(`[Event] SosialisasiCompleted — Sekolah ${sekolahId} → Sudah Sosialisasi`);
  return detailSekolah(sekolahId, user, { period: mp });
}

// ═══════════════════════════════════════════════════════════════════
// PATCH /api/v1/sekolah/:id/intent — Update Intent Level
// ═══════════════════════════════════════════════════════════════════
async function updateIntent(sekolahId, intent, user) {
  const VALID_INTENT = ['High', 'Mid', 'Low'];
  if (!VALID_INTENT.includes(intent)) {
    throw new Error('Intent tidak valid. Pilih: High, Mid, atau Low.');
  }

  const mp  = await getActivePeriod();
  const now = new Date();

  await pool.query(
    'UPDATE sekolah_periode SET intent = ?, last_updated = ? WHERE id_sekolah = ? AND marketing_period = ?',
    [intent, now, sekolahId, mp]
  );

  return { success: true, intent };
}

// ═══════════════════════════════════════════════════════════════════
// POST /api/v1/sekolah — Tambah sekolah baru
// ═══════════════════════════════════════════════════════════════════
async function tambahSekolah(data, user) {
  if (!data.namaSekolah || !data.tingkat || !data.kecamatan) {
    throw new Error('namaSekolah, tingkat, dan kecamatan wajib diisi.');
  }

  // Cek duplikat
  const [dupRows] = await pool.query(
    'SELECT id_sekolah FROM master_sekolah WHERE nama_sekolah = ? AND jenjang = ? AND kecamatan = ? LIMIT 1',
    [data.namaSekolah, data.tingkat, data.kecamatan]
  );
  if (dupRows.length > 0) {
    throw new Error(`Sekolah "${data.namaSekolah}" (${data.tingkat}) di ${data.kecamatan} sudah terdaftar.`);
  }

  // ── Validasi Kuota Ingestion ──
  const { tenantId } = await _checkSekolahLimits(1);

  const now   = new Date();
  const mp    = await getActivePeriod();
  const newId = await generateSekolahId();
  const recId = await generatePeriodeId();
  const pj    = user.role === 'CRO' ? user.nama : (data.pjCro || null);

  await pool.query(
    `INSERT INTO master_sekolah
       (id_sekolah, nama_sekolah, jenjang, status_sekolah, kecamatan, alamat, pic_utama, wa_pic, created_date, last_updated)
     VALUES (?, ?, ?, 'Belum Diketahui', ?, ?, '', '', ?, ?)`,
    [newId, data.namaSekolah, data.tingkat, data.kecamatan, data.alamat || '', now, now]
  );

  await pool.query(
    `INSERT INTO pic_sekolah (id_sekolah, nama, jabatan, no_wa, bsuid) VALUES (?, '', '', NULL, NULL)`,
    [newId]
  );

  await pool.query(
    `INSERT INTO sekolah_periode
       (id_record, marketing_period, id_sekolah, pj_sekolah, status_terkini, status_updated_date,
        next_action, due_date, status_jadwal, sekolah_aktif, jumlah_siswa, created_date, last_updated)
     VALUES (?, ?, ?, ?, 'Belum Visit', ?, 'Visit Awal', NULL, 'Menunggu Penjadwalan', 'Belum Diketahui', NULL, ?, ?)`,
    [recId, mp, newId, pj, now, now, now]
  );

  // Event log: school registered
  const idSekolahNama = `${newId}-${data.namaSekolah}`;
  await pool.query(
    `INSERT INTO aktivitas_sekolah
       (marketing_period, \`timestamp\`, tanggal, id_sekolah_nama,
        sekolah_aktif, aktivitas, pic, wa_pic, jabatan_pic,
        hasil, status_terkini, next_action, due_date, status_jadwal,
        catatan, jumlah_siswa, alasan_tidak_bisa_sosialisasi)
     VALUES (?, ?, NULL, ?, 'Belum Diketahui', 'Input Database', '', '', '', 'Sekolah Baru Ditambahkan', 'Belum Visit', 'Visit Awal', NULL, 'Menunggu Penjadwalan', 'Otomatis dibuat saat penambahan sekolah.', NULL, '')`,
    [mp, now, idSekolahNama]
  );

  // Increment Kuota setelah sukses
  await _incrementUsedSekolah(tenantId, 1).catch(e => console.error("Gagal increment used_sekolah:", e));

  return { id: newId, status: 'Belum Visit', nextAction: 'Visit Awal' };
}

// ═══════════════════════════════════════════════════════════════════
// PUT /api/v1/sekolah/:id — Edit data master sekolah
// ═══════════════════════════════════════════════════════════════════
async function editSekolah(id, data, user) {
  if (!id) throw new Error('ID sekolah wajib.');
  const now = new Date();
  const mp  = await getActivePeriod();

  // Update master_sekolah
  const msClauses = ['last_updated = ?'];
  const msParams  = [now];
  if (data.namaSekolah  !== undefined) { msClauses.push('nama_sekolah = ?');  msParams.push(data.namaSekolah); }
  if (data.tingkat      !== undefined) { msClauses.push('jenjang = ?');        msParams.push(data.tingkat); }
  if (data.kecamatan    !== undefined) { msClauses.push('kecamatan = ?');      msParams.push(data.kecamatan); }
  if (data.alamat       !== undefined) { msClauses.push('alamat = ?');         msParams.push(data.alamat); }
  if (data.statusAktif  !== undefined) { msClauses.push('status_sekolah = ?'); msParams.push(data.statusAktif); }
  msParams.push(id);
  await pool.query(`UPDATE master_sekolah SET ${msClauses.join(', ')} WHERE id_sekolah = ?`, msParams);

  // Update pic_sekolah
  const psUpdates = [];
  const psParams = [];
  if (data.picNama !== undefined) { psUpdates.push('nama = ?'); psParams.push(data.picNama); }
  if (data.picWa !== undefined) { psUpdates.push('no_wa = ?'); psParams.push(cleanPhone(data.picWa)); }
  if (psUpdates.length > 0) {
    const fields = psUpdates.map(u => u.split(' =')[0]);
    await pool.query(
      `INSERT INTO pic_sekolah (id_sekolah, ${fields.join(', ')}) VALUES (?, ${fields.map(() => '?').join(', ')})
       ON DUPLICATE KEY UPDATE ${psUpdates.join(', ')}`,
      [id, ...psParams, ...psParams]
    );
  }

  // Update sekolah_periode (jumlah_siswa, sekolah_aktif)
  const spClauses = ['last_updated = ?'];
  const spParams  = [now];
  if (data.jumlahSiswaKelas12 !== undefined) { spClauses.push('jumlah_siswa = ?');  spParams.push(data.jumlahSiswaKelas12 || null); }
  if (data.sekolahAktif       !== undefined) { spClauses.push('sekolah_aktif = ?'); spParams.push(data.sekolahAktif); }
  if (spClauses.length > 1) {
    spParams.push(id, mp);
    await pool.query(`UPDATE sekolah_periode SET ${spClauses.join(', ')} WHERE id_sekolah = ? AND marketing_period = ?`, spParams);
  }

  return { success: true };
}

// ═══════════════════════════════════════════════════════════════════
// DELETE /api/v1/sekolah/:id — Hapus sekolah (guard logic)
// ═══════════════════════════════════════════════════════════════════
async function hapusSekolah(id, alasan, user) {
  if (!['Admin', 'Manager'].includes(user.role)) {
    throw new Error('Hanya Manager/Admin yang dapat menghapus sekolah.');
  }

  // Guard: ada riwayat aktivitas?
  const [[{ cnt: aktCount }]] = await pool.query(
    'SELECT COUNT(*) as cnt FROM aktivitas_sekolah WHERE id_sekolah_nama LIKE ? LIMIT 1',
    [`${id}%`]
  );
  if (parseInt(aktCount, 10) > 0) throw new Error('BLOCKED_HAS_ACTIVITY');

  // Guard: Identity / Lead Captured?
  const [[{ cnt: leadCnt }]] = await pool.query(
    "SELECT COUNT(*) as cnt FROM sekolah_periode WHERE id_sekolah = ? AND status_terkini IN ('Identity Captured', 'Lead Captured') LIMIT 1",
    [id]
  );
  if (parseInt(leadCnt, 10) > 0) throw new Error('BLOCKED_LEAD_CAPTURED');

  // Guard: ekstra aktif?
  const [[{ cnt: ekstraCnt }]] = await pool.query(
    "SELECT COUNT(*) as cnt FROM aktivitas_ekstra WHERE id_sekolah LIKE ? AND status_aktivitas = 'Direncanakan' LIMIT 1",
    [`${id}%`]
  );
  if (parseInt(ekstraCnt, 10) > 0) throw new Error('BLOCKED_ACTIVE_TASK');

  // Cascade delete
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM aktivitas_ekstra WHERE id_sekolah LIKE ?', [`${id}%`]);
    await conn.query('DELETE FROM sekolah_periode WHERE id_sekolah = ?', [id]);
    await conn.query('DELETE FROM master_sekolah WHERE id_sekolah = ?', [id]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  return { success: true };
}

// ═══════════════════════════════════════════════════════════════════
// PATCH /api/v1/sekolah/:id/reassign — Ganti PJ CRO
// ═══════════════════════════════════════════════════════════════════
async function reassignCRO(id, croBaru, alasan, user) {
  if (!['Admin', 'Manager'].includes(user.role)) {
    throw new Error('Hanya Manager/Admin yang dapat melakukan reassign CRO.');
  }
  if (!croBaru) throw new Error('croBaru wajib diisi.');

  const mp  = await getActivePeriod();
  const now = new Date();

  const [[sp]] = await pool.query(
    'SELECT pj_sekolah FROM sekolah_periode WHERE id_sekolah = ? AND marketing_period = ? LIMIT 1',
    [id, mp]
  );
  const croLama = sp?.pj_sekolah || '';

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      'UPDATE sekolah_periode SET pj_sekolah = ?, last_updated = ? WHERE id_sekolah = ? AND marketing_period = ?',
      [croBaru, now, id, mp]
    );
    await conn.query(
      "UPDATE aktivitas_ekstra SET pj_aktivitas = ?, last_updated = ? WHERE id_sekolah LIKE ? AND status_aktivitas = 'Direncanakan'",
      [croBaru, now, `${id}%`]
    );
    await conn.query(
      'UPDATE master_sekolah SET pj_sekolah = ?, last_updated = ? WHERE id_sekolah = ?',
      [croBaru, now, id]
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  return { success: true, croLama, croBaru };
}

// ═══════════════════════════════════════════════════════════════════
// POST /api/v1/sekolah/:id/aktivitas — Input aktivitas (BACKWARD COMPAT)
// Tetap berfungsi agar frontend lama tidak rusak. Internally pakai
// HASIL_AKTIVITAS_SEKOLAH (alias lama). Redirect ke logInteraction jika bisa.
// ═══════════════════════════════════════════════════════════════════
async function inputAktivitas(sekolahId, data, user) {
  const mapping = HASIL_AKTIVITAS_SEKOLAH[data.hasilAktivitas];
  if (!mapping) throw new Error('Hasil aktivitas tidak valid: ' + data.hasilAktivitas);

  if (mapping.isDowngrade && (!data.catatan || data.catatan.length < 10)) {
    throw new Error('Catatan minimal 10 karakter untuk aktivitas downgrade.');
  }
  if (mapping.requiresAlasan && !data.alasanTidakBisa) {
    throw new Error('Alasan tidak bisa sosialisasi wajib diisi.');
  }

  const mp  = await getActivePeriod();
  const now = new Date();
  const tgl = data.tanggalAktivitas ? new Date(data.tanggalAktivitas) : now;

  let dueDate = null;
  if (data.dueDateNextAction) {
    dueDate = new Date(data.dueDateNextAction);
  } else if (mapping.autoH1) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    dueDate = d;
  }

  const statusJadwal = mapping.isTerminal ? 'Tidak ada jadwal'
    : (dueDate ? 'Terjadwal' : 'Menunggu Penjadwalan');

  const alasanVal = mapping.requiresAlasan
    ? (data.alasanTidakBisa === 'Alasan lainnya'
        ? `Alasan lainnya: ${data.catatanAlasan || ''}` : data.alasanTidakBisa)
    : '';

  const [[msRow]] = await pool.query('SELECT nama_sekolah FROM master_sekolah WHERE id_sekolah = ? LIMIT 1', [sekolahId]);
  const idSekolahNama = `${sekolahId}-${msRow?.nama_sekolah || ''}`;

  // Write Model: Event Log
  await pool.query(
    `INSERT INTO aktivitas_sekolah
       (marketing_period, \`timestamp\`, tanggal, id_sekolah_nama,
        sekolah_aktif, aktivitas, pic, wa_pic, jabatan_pic,
        hasil, status_terkini, next_action, due_date, status_jadwal,
        catatan, jumlah_siswa, alasan_tidak_bisa_sosialisasi)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      mp, now, tgl, idSekolahNama,
      data.statusAktif || '',
      data.jenisAktivitas || '',
      data.namaPic || '',
      cleanPhone(data.noWaPic || ''),
      data.jabatanPic || '',
      data.hasilAktivitas,
      mapping.status,
      mapping.nextAction === 'Tidak Ada' ? null : mapping.nextAction,
      dueDate,
      statusJadwal,
      data.catatan || '',
      data.jumlahSiswaKelas12 ? Number(data.jumlahSiswaKelas12) : null,
      alasanVal,
    ]
  );

  // Read Model: Proyeksi
  const updClauses = [
    'status_terkini = ?', 'pipeline_state = ?', 'next_action = ?', 'due_date = ?',
    'status_jadwal = ?', 'status_updated_date = ?', 'last_updated = ?',
    'alasan_tidak_bisa_sosialisasi = ?',
  ];
  const updParams = [
    mapping.status,
    getPipelineStateFromStatus(mapping.status),
    mapping.nextAction === 'Tidak Ada' ? null : mapping.nextAction,
    dueDate, statusJadwal, now, now, alasanVal,
  ];

  if (data.statusAktif)        { updClauses.push('sekolah_aktif = ?');  updParams.push(data.statusAktif); }
  if (data.jumlahSiswaKelas12) { updClauses.push('jumlah_siswa = ?');   updParams.push(Number(data.jumlahSiswaKelas12)); }

  updParams.push(sekolahId, mp);
  await pool.query(
    `UPDATE sekolah_periode SET ${updClauses.join(', ')} WHERE id_sekolah = ? AND marketing_period = ?`,
    updParams
  );

  // Update master_sekolah
  const msClauses = ['last_updated = ?'];
  const msParams  = [now];
  if (data.statusAktif)   { msClauses.push('status_sekolah = ?'); msParams.push(data.statusAktif); }
  if (data.alamatLengkap) { msClauses.push('alamat = ?');         msParams.push(data.alamatLengkap); }
  if (msClauses.length > 1) {
    msParams.push(sekolahId);
    await pool.query(`UPDATE master_sekolah SET ${msClauses.join(', ')} WHERE id_sekolah = ?`, msParams);
  }

  // Update pic_sekolah
  const psUpdates = [];
  const psParams = [];
  if (data.namaPic)    { psUpdates.push('nama = ?');    psParams.push(data.namaPic); }
  if (data.noWaPic)    { psUpdates.push('no_wa = ?');   psParams.push(cleanPhone(data.noWaPic)); }
  if (data.jabatanPic) { psUpdates.push('jabatan = ?'); psParams.push(data.jabatanPic); }

  if (psUpdates.length > 0) {
    const fields = psUpdates.map(u => u.split(' =')[0]);
    await pool.query(
      `INSERT INTO pic_sekolah (id_sekolah, ${fields.join(', ')}) VALUES (?, ${fields.map(() => '?').join(', ')})
       ON DUPLICATE KEY UPDATE ${psUpdates.join(', ')}`,
      [sekolahId, ...psParams, ...psParams]
    );
  }

  // Sync to Google Calendar
  if (dueDate) {
    const calendarService = require('./calendar/calendar.service');
    calendarService.syncEventToCalendar(user.id, {
      summary: idSekolahNama,
      description: `Sekolah: ${msRow?.nama_sekolah || ''}\nAktivitas: ${data.jenisAktivitas}\nCatatan: ${data.catatan || ''}`,
      date: dueDate.toISOString().split('T')[0]
    }).catch(err => {
      console.error('[Calendar Sync] Failed in inputAktivitas:', err.message);
    });
  }

  return detailSekolah(sekolahId, user, { period: mp });
}

// ═══════════════════════════════════════════════════════════════════
// POST /api/v1/sekolah/:id/aktivitas-ekstra — Buat aktivitas ekstra
// ═══════════════════════════════════════════════════════════════════
async function buatAktivitasEkstra(sekolahId, data, user) {
  const mp = await getActivePeriod();

  const [[sp]] = await pool.query(
    'SELECT status_terkini FROM sekolah_periode WHERE id_sekolah = ? AND marketing_period = ? LIMIT 1',
    [sekolahId, mp]
  );
  if (!sp || !['Sudah Sosialisasi', 'Identity Captured', 'Lead Captured'].includes(sp.status_terkini)) {
    throw new Error('Aktivitas ekstra hanya bisa dibuat untuk sekolah berstatus Sudah Sosialisasi atau Identity Captured.');
  }

  const VALID_JENIS = ['WhatsApp PIC', 'Telepon PIC', 'Meeting PIC'];
  if (!VALID_JENIS.includes(data.jenisAktivitas)) throw new Error('Jenis aktivitas tidak valid.');
  if (!data.tujuanCatatan)  throw new Error('Tujuan/Catatan wajib diisi.');
  if (!data.tanggalRencana) throw new Error('Tanggal rencana wajib diisi.');

  const pj    = user.role === 'CRO' ? user.nama : (data.pjAktivitas || user.nama);
  const now   = new Date();
  const newId = await generateEkstraId();

  await pool.query(
    `INSERT INTO aktivitas_ekstra
       (id_aktifitas_ekstra, marketing_period, id_sekolah, aktivitas,
        tanggal_rencana, tujuan_catatan, pj_aktivitas, status_aktivitas, \`timestamp\`, last_updated)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'Direncanakan', ?, ?)`,
    [newId, mp, sekolahId, data.jenisAktivitas, data.tanggalRencana, data.tujuanCatatan, pj, now, now]
  );

  // Sync to Google Calendar
  const calendarService = require('./calendar/calendar.service');
  const [[ms]] = await pool.query('SELECT nama_sekolah FROM master_sekolah WHERE id_sekolah = ? LIMIT 1', [sekolahId]);
  const judul = `SKL-${sekolahId.replace('SKL-', '')}-${ms?.nama_sekolah || ''}`;

  calendarService.syncEventToCalendar(user.id, {
    summary: judul,
    description: `Aktivitas Ekstra\nJenis: ${data.jenisAktivitas}\nTujuan: ${data.tujuanCatatan}`,
    date: data.tanggalRencana
  }).catch(err => {
    console.error('[Calendar Sync] Failed in buatAktivitasEkstra:', err.message);
  });

  return { id: newId, statusAktivitas: 'Direncanakan' };
}

// ═══════════════════════════════════════════════════════════════════
// PATCH /api/v1/aktivitas-ekstra/:aeId/selesai
// ═══════════════════════════════════════════════════════════════════
async function selesaikanAktivitasEkstra(aeId, data, user) {
  if (!data.tanggalRealisasi) throw new Error('Tanggal realisasi wajib diisi.');

  await pool.query(
    `UPDATE aktivitas_ekstra
     SET status_aktivitas = 'Selesai', tanggal_realisasi = ?, catatan_hasil = ?, last_updated = NOW()
     WHERE id_aktifitas_ekstra = ?`,
    [data.tanggalRealisasi, data.catatanHasil || '', aeId]
  );

  return { success: true };
}

// ═══════════════════════════════════════════════════════════════════
// PATCH /api/v1/aktivitas-ekstra/:aeId/batalkan
// ═══════════════════════════════════════════════════════════════════
async function batalkanAktivitasEkstra(aeId, data, user) {
  const catatanBatal = data.alasanBatal
    ? `[Dibatalkan] ${data.alasanBatal}`
    : '[Dibatalkan]';

  await pool.query(
    `UPDATE aktivitas_ekstra
     SET status_aktivitas = 'Dibatalkan', catatan_hasil = ?, last_updated = NOW()
     WHERE id_aktifitas_ekstra = ?`,
    [catatanBatal, aeId]
  );

  return { success: true };
}

// ═══════════════════════════════════════════════════════════════════
// GET /api/v1/sekolah/utils/kecamatan-list
// ═══════════════════════════════════════════════════════════════════
async function getKecamatanList() {
  const [rows] = await pool.query(
    "SELECT DISTINCT kecamatan FROM master_sekolah WHERE kecamatan IS NOT NULL AND kecamatan != '' ORDER BY kecamatan ASC"
  );
  return rows.map(r => r.kecamatan);
}

// ═══════════════════════════════════════════════════════════════════
// GET /api/v1/sekolah/utils/cro-list
// ═══════════════════════════════════════════════════════════════════
async function getCROList() {
  const [rows] = await pool.query(
    "SELECT DISTINCT pj_sekolah AS nama FROM sekolah_periode WHERE pj_sekolah IS NOT NULL AND pj_sekolah != '' ORDER BY pj_sekolah ASC"
  );
  return rows.map(r => r.nama);
}

// ── ID Generators ─────────────────────────────────────────────────
async function generateSekolahId() {
  const [rows] = await pool.query(
    "SELECT id_sekolah FROM master_sekolah WHERE id_sekolah LIKE 'SKL-%' ORDER BY LENGTH(id_sekolah) DESC, id_sekolah DESC LIMIT 1"
  );
  let next = 1;
  if (rows.length > 0) {
    const num = parseInt((rows[0].id_sekolah || '').split('-')[1], 10);
    if (!isNaN(num)) next = num + 1;
  }
  return `SKL-${next}`;
}

async function generatePeriodeId() {
  const [rows] = await pool.query(
    "SELECT id_record FROM sekolah_periode WHERE id_record LIKE 'SKP-%' ORDER BY LENGTH(id_record) DESC, id_record DESC LIMIT 1"
  );
  let next = 1;
  if (rows.length > 0) {
    const num = parseInt((rows[0].id_record || '').split('-')[1], 10);
    if (!isNaN(num)) next = num + 1;
  }
  return `SKP-${next}`;
}

async function generateEkstraId() {
  const [rows] = await pool.query(
    "SELECT id_aktifitas_ekstra FROM aktivitas_ekstra WHERE id_aktifitas_ekstra LIKE 'AE-%' ORDER BY LENGTH(id_aktifitas_ekstra) DESC, id_aktifitas_ekstra DESC LIMIT 1"
  );
  let next = 1;
  if (rows.length > 0) {
    const num = parseInt((rows[0].id_aktifitas_ekstra || '').split('-')[1], 10);
    if (!isNaN(num)) next = num + 1;
  }
  return `AE-${String(next).padStart(6, '0')}`;
}

module.exports = {
  listSekolah,
  statSekolah,
  detailSekolah,
  tambahSekolah,
  editSekolah,
  hapusSekolah,
  reassignCRO,
  // Event-Sourcing endpoints (new)
  logInteraction,
  approveSosialisasi,
  completeSosialisasi,
  updateIntent,
  // Backward-compatible
  inputAktivitas,
  buatAktivitasEkstra,
  selesaikanAktivitasEkstra,
  batalkanAktivitasEkstra,
  getKecamatanList,
  getCROList,
};

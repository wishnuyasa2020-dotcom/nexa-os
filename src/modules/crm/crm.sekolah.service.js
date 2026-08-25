'use strict';

/**
 * crm.sekolah.service.js
 * Service RESTful Modul Sekolah — nexa-crm-web integration
 *
 * Skema tabel (dari DESCRIBE production 2026-08-20):
 *   aktivitas_ekstra : id, marketing_period, id_aktifitas_ekstra, id_sekolah,
 *                      aktivitas, tanggal_rencana, tujuan_catatan, pj_aktivitas,
 *                      status_aktivitas, tanggal_realisasi, catatan_hasil,
 *                      timestamp, last_updated
 *   aktivitas_sekolah: id, marketing_period, timestamp, tanggal, id_sekolah_nama,
 *                      sekolah_aktif, aktivitas, pic, wa_pic, jabatan_pic,
 *                      hasil, status_terkini, next_action, due_date, status_jadwal,
 *                      catatan, jumlah_siswa, alasan_tidak_bisa_sosialisasi
 *   sekolah_periode  : id_record, marketing_period, id_sekolah, pj_sekolah,
 *                      status_terkini, next_action, due_date, status_updated_date,
 *                      status_jadwal, catatan, created_date, last_updated,
 *                      sekolah_aktif, jumlah_siswa, alasan_tidak_bisa_sosialisasi, cal_event_id
 *   master_sekolah   : id_sekolah, nama_sekolah, jenjang, status_sekolah,
 *                      kecamatan, alamat, pic_utama, wa_pic, pj_sekolah,
 *                      created_date, last_updated
 */

const { pool, mainPool } = require('../../config/database');

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Cek Kuota Sekolah di Main Registry
// ─────────────────────────────────────────────────────────────────────────────
async function _checkSekolahLimits(requiredCount = 1) {
  const { tenantStorage } = require('../../config/database');
  let tenantId = tenantStorage.getStore();
  
  if (!tenantId) {
    const dbName = process.env.DB_NAME;
    const [dbRows] = await mainPool.query("SELECT tenant_id FROM tenant_databases WHERE db_name = ?", [dbName]);
    if (dbRows.length === 0) return { tenantId: null }; 
    tenantId = dbRows[0].tenant_id;
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
  'Data Siswa Terinput':              { status: 'Lead Captured',             nextAction: 'Tidak Ada', isTerminal: true },
  'Ditolak Final':                    { status: 'Tidak Bisa Sosialisasi',    nextAction: 'Tidak Ada', isTerminal: true, requiresAlasan: true },
  'Tutup / Merger':                   { status: 'Nonaktif / Tutup / Merger', nextAction: 'Tidak Ada', isTerminal: true },
};

function cleanPhone(wa) {
  return wa ? String(wa).replace(/[^0-9]/g, '') : '';
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
  if (query.status)     { whereParts.push('sp.status_terkini = ?'); params.push(query.status); }
  if (query.kecamatan)  { whereParts.push('ms.kecamatan = ?');      params.push(query.kecamatan); }
  if (query.pjCro)      { whereParts.push('sp.pj_sekolah = ?');     params.push(query.pjCro); }
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
    `SELECT sp.status_terkini, COUNT(*) AS cnt FROM sekolah_periode sp WHERE ${where} GROUP BY sp.status_terkini`,
    params
  );

  const map = {};
  let total = 0;
  rows.forEach(r => { map[r.status_terkini] = parseInt(r.cnt, 10); total += parseInt(r.cnt, 10); });

  return {
    total,
    belumVisit:   map['Belum Visit'] || 0,
    proses:       (map['Tunggu Visit Ulang'] || 0) + (map['Tunggu Keputusan'] || 0)
                + (map['Tunggu Jadwal Sosialisasi'] || 0) + (map['Sosialisasi Terjadwal'] || 0),
    sosialisasi:  map['Sudah Sosialisasi'] || 0,
    leadCaptured: map['Lead Captured'] || 0,
    tidakBisa:    map['Tidak Bisa Sosialisasi'] || 0,
    nonaktif:     map['Nonaktif / Tutup / Merger'] || 0,
  };
}

// ═══════════════════════════════════════════════════════════════════
// GET /api/v1/sekolah/:id — Detail + timeline + ekstra
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
      IFNULL(ms.pic_utama, '')                               AS picNama,
      IFNULL(ms.wa_pic, '')                                  AS picWa,
      IFNULL(sp.pj_sekolah, '')                              AS pjCro,
      IFNULL(sp.jumlah_siswa, 0)                             AS jumlahSiswaKelas12,
      IFNULL(sp.status_terkini, '')                          AS status,
      IFNULL(sp.next_action, '')                             AS nextAction,
      IFNULL(DATE_FORMAT(sp.due_date,'%Y-%m-%d'), '')        AS dueDate,
      IFNULL(sp.marketing_period, '')                        AS marketingPeriod,
      IFNULL(sp.alasan_tidak_bisa_sosialisasi, '')           AS alasanTidakBisa,
      IFNULL(sp.catatan, '')                                 AS catatan,
      IFNULL(sp.sekolah_aktif, '')                           AS sekolahAktif,
      IFNULL(DATEDIFF(CURDATE(), sp.status_updated_date), 0) AS aging
    FROM sekolah_periode sp
    LEFT JOIN master_sekolah ms ON sp.id_sekolah = ms.id_sekolah
    WHERE sp.marketing_period = ? AND sp.id_sekolah = ?
    LIMIT 1
  `, [mp, id]);

  if (!row) return null;

  const s = {
    ...row,
    aging:              parseInt(row.aging, 10) || 0,
    jumlahSiswaKelas12: parseInt(row.jumlahSiswaKelas12, 10) || 0,
    dueDate:            row.dueDate || null,
    pic:                row.picNama ? { nama: row.picNama, jabatan: '', noWa: row.picWa } : null,
  };
  delete s.picNama; delete s.picWa;

  // ── Riwayat aktivitas ──────────────────────────────────────────
  // NOTE: aktivitas_sekolah uses 'pic' not 'pic_yang_dihubungi'
  // id_aktivitas might not exist — use `id` (auto-increment PK)
  const [aktRows] = await pool.query(`
    SELECT
      id                                                      AS id,
      IFNULL(aktivitas, '')                                   AS jenisAktivitas,
      IFNULL(DATE_FORMAT(tanggal, '%Y-%m-%d'), '')            AS tanggal,
      IFNULL(hasil, '')                                       AS hasilAktivitas,
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
      IFNULL(DATE_FORMAT(timestamp, '%Y-%m-%dT%H:%i:%s'), '') AS createdAt
    FROM aktivitas_sekolah
    WHERE id_sekolah_nama LIKE ? AND marketing_period = ?
    ORDER BY timestamp DESC
  `, [`${id}%`, mp]);

  s.aktivitas = aktRows.map(r => ({
    id:             r.id,
    jenisAktivitas: r.jenisAktivitas,
    tanggal:        r.tanggal || null,
    hasilAktivitas: r.hasilAktivitas,
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

  // ── Riwayat aktivitas ekstra ────────────────────────────────────
  // NOTE: tabel tidak punya kolom alasan_batal / updated_at
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
      IFNULL(DATE_FORMAT(timestamp, '%Y-%m-%dT%H:%i:%s'), '')     AS createdAt
    FROM aktivitas_ekstra
    WHERE id_sekolah LIKE ? AND marketing_period = ?
    ORDER BY timestamp DESC
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
    `INSERT INTO sekolah_periode
       (id_record, marketing_period, id_sekolah, pj_sekolah, status_terkini, status_updated_date,
        next_action, due_date, status_jadwal, sekolah_aktif, jumlah_siswa, created_date, last_updated)
     VALUES (?, ?, ?, ?, 'Belum Visit', ?, 'Visit Awal', NULL, 'Menunggu Penjadwalan', 'Belum Diketahui', NULL, ?, ?)`,
    [recId, mp, newId, pj, now, now, now]
  );

  // Buat initial aktivitas supaya masuk ke backlog Weekly Planning
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
  if (data.picNama      !== undefined) { msClauses.push('pic_utama = ?');      msParams.push(data.picNama); }
  if (data.picWa        !== undefined) { msClauses.push('wa_pic = ?');         msParams.push(cleanPhone(data.picWa)); }
  msParams.push(id);
  await pool.query(`UPDATE master_sekolah SET ${msClauses.join(', ')} WHERE id_sekolah = ?`, msParams);

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
// DELETE /api/v1/sekolah/:id — Hapus sekolah (guard logic §9)
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

  // Guard: Lead Captured?
  const [[{ cnt: leadCnt }]] = await pool.query(
    "SELECT COUNT(*) as cnt FROM sekolah_periode WHERE id_sekolah = ? AND status_terkini = 'Lead Captured' LIMIT 1",
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
    // Juga update master_sekolah.pj_sekolah sebagai default PJ
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
// POST /api/v1/sekolah/:id/aktivitas — Input laporan aktivitas
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

  // Auto H+1 untuk Sosialisasi Selesai
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

  // Ambil nama sekolah untuk id_sekolah_nama
  const [[msRow]] = await pool.query('SELECT nama_sekolah FROM master_sekolah WHERE id_sekolah = ? LIMIT 1', [sekolahId]);
  const idSekolahNama = `${sekolahId}-${msRow?.nama_sekolah || ''}`;

  // INSERT aktivitas_sekolah (kolom sesuai skema production)
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

  // UPDATE sekolah_periode
  const updClauses = [
    'status_terkini = ?', 'next_action = ?', 'due_date = ?',
    'status_jadwal = ?', 'status_updated_date = ?', 'last_updated = ?',
    'alasan_tidak_bisa_sosialisasi = ?',
  ];
  const updParams = [
    mapping.status,
    mapping.nextAction === 'Tidak Ada' ? null : mapping.nextAction,
    dueDate, statusJadwal, now, now, alasanVal,
  ];

  if (data.statusAktif)         { updClauses.push('sekolah_aktif = ?');  updParams.push(data.statusAktif); }
  if (data.jumlahSiswaKelas12)  { updClauses.push('jumlah_siswa = ?');   updParams.push(Number(data.jumlahSiswaKelas12)); }

  updParams.push(sekolahId, mp);
  await pool.query(
    `UPDATE sekolah_periode SET ${updClauses.join(', ')} WHERE id_sekolah = ? AND marketing_period = ?`,
    updParams
  );

  // Update master_sekolah: PIC + alamat (saat Visit Awal)
  const msClauses = ['last_updated = ?'];
  const msParams  = [now];
  if (data.namaPic)        { msClauses.push('pic_utama = ?');      msParams.push(data.namaPic); }
  if (data.noWaPic)        { msClauses.push('wa_pic = ?');         msParams.push(cleanPhone(data.noWaPic)); }
  if (data.statusAktif)    { msClauses.push('status_sekolah = ?'); msParams.push(data.statusAktif); }
  if (data.alamatLengkap)  { msClauses.push('alamat = ?');         msParams.push(data.alamatLengkap); }
  if (msClauses.length > 1) {
    msParams.push(sekolahId);
    await pool.query(`UPDATE master_sekolah SET ${msClauses.join(', ')} WHERE id_sekolah = ?`, msParams);
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

  // Validasi status sekolah
  const [[sp]] = await pool.query(
    'SELECT status_terkini FROM sekolah_periode WHERE id_sekolah = ? AND marketing_period = ? LIMIT 1',
    [sekolahId, mp]
  );
  if (!sp || !['Sudah Sosialisasi', 'Lead Captured'].includes(sp.status_terkini)) {
    throw new Error('Aktivitas ekstra hanya bisa dibuat untuk sekolah berstatus Sudah Sosialisasi atau Lead Captured.');
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
// NOTE: tabel tidak punya kolom alasan_batal — simpan di catatan_hasil
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
  inputAktivitas,
  buatAktivitasEkstra,
  selesaikanAktivitasEkstra,
  batalkanAktivitasEkstra,
  getKecamatanList,
  getCROList,
};

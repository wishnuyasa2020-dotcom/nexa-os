'use strict';

const { pool } = require('../../config/database');

/**
 * Nexa OS — CRM Service
 *
 * Port dari Code.gs getInitialData() ke Express.
 * Memberikan semua data awal yang dibutuhkan frontend saat startup.
 */

async function getInitialData(user) {
  const [
    [periodRows],
    [allPeriodRows],
    [kecRows],
    [sekolahRows],
    [croRows],
  ] = await Promise.all([
    // Active period
    pool.query(
      'SELECT nama_period FROM marketing_period WHERE status = ? ORDER BY created_date DESC LIMIT 1',
      ['aktif']
    ),
    // All periods
    pool.query(
      'SELECT nama_period, status, start_date, end_date FROM marketing_period ORDER BY created_date DESC'
    ),
    // Kecamatan list
    pool.query(
      "SELECT DISTINCT kecamatan FROM master_sekolah WHERE kecamatan IS NOT NULL AND kecamatan != '' ORDER BY kecamatan ASC"
    ),
    // Sekolah utama (id + nama saja, ringan)
    pool.query(
      'SELECT id_sekolah, nama_sekolah FROM master_sekolah ORDER BY nama_sekolah ASC'
    ),
    // CRO list (hanya untuk Admin/Manager)
    pool.query(
      "SELECT username, nama FROM users WHERE LOWER(role) = 'cro' AND LOWER(status) = 'aktif' ORDER BY nama ASC"
    ),
  ]);

  const activePeriod   = periodRows[0]?.nama_period || '-';
  const selectedPeriod = user.selectedPeriod || activePeriod;

  const marketingPeriods = allPeriodRows.map(r => ({
    nama:        r.nama_period,
    status:      r.status,
    start_date:  r.start_date,
    end_date:    r.end_date,
  }));

  const kecamatans = kecRows.map(r => r.kecamatan);

  const sekolahUtama = sekolahRows.map(r => ({
    idSekolah:    r.id_sekolah,
    namaSekolah:  r.nama_sekolah,
  }));

  const croList = ['Admin', 'Manager'].includes(user.role)
    ? croRows.map(r => ({ username: r.username, nama: r.nama }))
    : [];

  const CONSTANTS = require('./crm.constants');

  return {
    user:            { username: user.username, nama: user.nama, role: user.role },
    activePeriod,
    selectedPeriod,
    marketingPeriods,
    carryForwardNeeded: false, // TODO: cek di fase berikutnya
    siswaPage1:    null,       // Fetched async by frontend
    dashboardTab1: null,       // Fetched async by frontend
    sekolahPage1:  null,       // Fetched async by frontend
    masterData: {
      croList,
      sekolah:                 sekolahUtama,
      siswaSingkat:            [], // Dinonaktifkan: meload 15.000+ data ke <datalist> mematikan browser. Search langsung dikirim ke backend.
      kecamatans,
      statusSekolah:           CONSTANTS.STATUS_SEKOLAH,
      nextActionSekolah:       CONSTANTS.NEXT_ACTION_SEKOLAH,
      aktivitasSekolah:        CONSTANTS.AKTIVITAS_SEKOLAH,
      aktivitasEkstraList:     CONSTANTS.AKTIVITAS_EKSTRA_LIST,
      hasilSekolah:            Object.keys(CONSTANTS.HASIL_AKTIVITAS_SEKOLAH),
      hasilSekolahMap:         CONSTANTS.HASIL_AKTIVITAS_SEKOLAH,
      alasanDitolakSekolah:    CONSTANTS.ALASAN_DITOLAK_SEKOLAH,
      statusSiswa:             CONSTANTS.STATUS_SISWA,
      nextActionSiswa:         CONSTANTS.NEXT_ACTION_SISWA,
      aktivitasSiswa:          CONSTANTS.AKTIVITAS_SISWA,
      hasilSiswa:              Object.keys(CONSTANTS.HASIL_AKTIVITAS_SISWA),
      hasilSiswaMap:           CONSTANTS.HASIL_AKTIVITAS_SISWA,
      alasanTidakLanjutSiswa:  CONSTANTS.ALASAN_TIDAK_LANJUT_SISWA,
      statusHomeVisit:         CONSTANTS.STATUS_HOME_VISIT,
      nextActionHomeVisit:     CONSTANTS.NEXT_ACTION_HOME_VISIT,
      aktivitasHomeVisit:      CONSTANTS.AKTIVITAS_HOME_VISIT,
      hasilHomeVisit:          Object.keys(CONSTANTS.HASIL_AKTIVITAS_HOME_VISIT),
      alasanTidakLanjutHV:     CONSTANTS.ALASAN_TIDAK_LANJUT_HV,
      statusJadwal:            CONSTANTS.STATUS_JADWAL,
      jenisSekolah:            CONSTANTS.JENIS_SEKOLAH,
      statusKepemilikanSekolah: CONSTANTS.STATUS_KEPEMILIKAN_SEKOLAH,
      roles:                   CONSTANTS.ROLES,
      schedulableActions:      CONSTANTS.SCHEDULABLE_ACTIONS,
      hasilButuhAlasanSiswa:   CONSTANTS.HASIL_BUTUH_ALASAN_SISWA,
      hasilButuhAlasanSekolah: CONSTANTS.HASIL_BUTUH_ALASAN_SEKOLAH,
      hasilButuhAlasanHV:      CONSTANTS.HASIL_BUTUH_ALASAN_HV
    },
  };
}

async function getAllSekolah(user, filter = {}) {
  let marketingPeriod = filter.marketingPeriod || user.selectedPeriod;
  if (!marketingPeriod || marketingPeriod === '-') {
    marketingPeriod = await getActiveMarketingPeriod();
  }
  const page = filter.page ? parseInt(filter.page, 10) : 1;
  const pageSize = 15;
  const offset = (page - 1) * pageSize;

  let where = 'WHERE sp.marketing_period = ?';
  const params = [marketingPeriod];

  if (user.role === 'CRO') {
    where += ' AND sp.pj_sekolah = ?';
    params.push(user.nama);
  }
  if (filter.status) {
    where += ' AND sp.status_terkini = ?';
    params.push(filter.status);
  }
  if (filter.kecamatan) {
    where += ' AND ms.kecamatan = ?';
    params.push(filter.kecamatan);
  }
  if (filter.search) {
    const searchParam = `%${filter.search}%`;
    where += ' AND (ms.nama_sekolah LIKE ? OR sp.id_sekolah LIKE ? OR ms.kecamatan LIKE ?)';
    params.push(searchParam, searchParam, searchParam);
  }

  let countSql = 'SELECT COUNT(sp.id_sekolah) as total FROM sekolah_periode sp ';
  if (filter.search || filter.kecamatan) {
    countSql += 'LEFT JOIN master_sekolah ms ON sp.id_sekolah = ms.id_sekolah ';
  }
  countSql += where;

  const [[countResult]] = await pool.query(countSql, params);
  const total = countResult ? parseInt(countResult.total, 10) : 0;
  const totalPages = Math.ceil(total / pageSize);

  if (total === 0) {
    return { data: [], total: 0, page, pageSize, totalPages: 0 };
  }

  let innerJoin = '';
  if (filter.search || filter.kecamatan) {
    innerJoin = 'LEFT JOIN master_sekolah ms ON sp.id_sekolah = ms.id_sekolah ';
  }

  const dataSql = `
    SELECT
      IFNULL(sp.id_record, '') as idRecord,
      IFNULL(sp.id_sekolah, '') as id,
      IFNULL(ms.nama_sekolah, '') as nama,
      IFNULL(ms.jenjang, '') as jenjang,
      IFNULL(ms.status_sekolah, '') as statusSekolah,
      IFNULL(ms.pic_utama, '') as picUtama,
      IFNULL(ms.wa_pic, '') as waPic,
      IFNULL(ms.kecamatan, '') as kecamatan,
      IFNULL(ms.alamat, '') as alamat,
      IFNULL(sp.pj_sekolah, '') as pj,
      IFNULL(sp.status_terkini, '') as status,
      IFNULL(sp.next_action, '') as nextAction,
      IFNULL(DATE_FORMAT(sp.due_date, '%Y-%m-%d'), '') as dueDate,
      IFNULL(sp.status_jadwal, '') as statusJadwal,
      IFNULL(sp.catatan, '') as catatan,
      IFNULL(sp.marketing_period, '') as marketingPeriod,
      IFNULL(DATEDIFF(CURDATE(), sp.status_updated_date), 0) as aging
    FROM (
      SELECT sp.id_record FROM sekolah_periode sp
      ${innerJoin}
      ${where}
      ORDER BY sp.status_updated_date DESC
      LIMIT ${pageSize} OFFSET ${offset}
    ) as sub
    JOIN sekolah_periode sp ON sub.id_record = sp.id_record
    LEFT JOIN master_sekolah ms ON sp.id_sekolah = ms.id_sekolah
    ORDER BY sp.status_updated_date DESC
  `;

  const [data] = await pool.query(dataSql, params);
  
  return { data, total, page, pageSize, totalPages };
}

async function getAllSiswa(user, filter = {}) {
  let marketingPeriod = filter.marketingPeriod || user.selectedPeriod;
  if (!marketingPeriod || marketingPeriod === '-') {
    marketingPeriod = await getActiveMarketingPeriod();
  }
  const page = filter.page ? parseInt(filter.page, 10) : 1;
  const pageSize = 15;
  const offset = (page - 1) * pageSize;

  let where = 'WHERE sp.marketing_period = ?';
  const params = [marketingPeriod];

  if (user.role === 'CRO') {
    where += ' AND sp.cro = ?';
    params.push(user.nama);
  }

  if (filter.status) { where += ' AND sp.status_terkini = ?'; params.push(filter.status); }
  if (filter.sekolah) { where += ' AND ms.id_sekolah = ?'; params.push(filter.sekolah); }
  if (filter.prioritas) { where += ' AND sp.prioritas = ?'; params.push(filter.prioritas); }
  
  if (filter.search) {
    const searchParam = `%${filter.search}%`;
    where += ' AND (ms.nama_lengkap LIKE ? OR sp.id_siswa LIKE ? OR ms.id_sekolah LIKE ? OR sek.nama_sekolah LIKE ?)';
    params.push(searchParam, searchParam, searchParam, searchParam);
  }

  let countSql = 'SELECT COUNT(sp.id_siswa) as total FROM siswa_periode sp ';
  if (filter.search || filter.sekolah) {
    countSql += 'LEFT JOIN master_siswa ms ON sp.id_siswa = ms.id_siswa ';
  }
  if (filter.search) {
    countSql += 'LEFT JOIN master_sekolah sek ON ms.id_sekolah = sek.id_sekolah ';
  }
  countSql += where;

  const [[countResult]] = await pool.query(countSql, params);
  const total = countResult ? parseInt(countResult.total, 10) : 0;
  const totalPages = Math.ceil(total / pageSize);

  if (total === 0) {
    return { data: [], total: 0, page, pageSize, totalPages: 0 };
  }

  let innerJoin = '';
  if (filter.search || filter.sekolah) {
    innerJoin = 'LEFT JOIN master_siswa ms ON sp.id_siswa = ms.id_siswa ';
  }
  if (filter.search) {
    innerJoin += 'LEFT JOIN master_sekolah sek ON ms.id_sekolah = sek.id_sekolah ';
  }

  const dataSql = `
    SELECT
      IFNULL(sp.id_record, '') as idRecord,
      IFNULL(sp.id_siswa, '') as id,
      IFNULL(ms.nama_lengkap, '') as nama,
      IFNULL(ms.id_sekolah, '') as idSekolah,
      IFNULL(sek.nama_sekolah, '') as namaSekolah,
      IFNULL(ms.kelas, '') as kelas,
      IFNULL(ms.wa, '') as wa,
      IFNULL(ms.email, '') as email,
      IFNULL(ms.alamat, '') as alamat,
      IFNULL(ms.minat_awal, '') as minatAwal,
      IFNULL(ms.rencana_lulus, '') as rencanaLulus,
      IFNULL(ms.orangtua_tahu, '') as orangtuaTahu,
      IFNULL(sp.cro, '') as cro,
      IFNULL(sp.prioritas, '') as prioritas,
      IFNULL(sp.status_terkini, '') as status,
      IFNULL(sp.next_action, '') as nextAction,
      IFNULL(DATE_FORMAT(sp.due_date, '%Y-%m-%d'), '') as dueDate,
      IFNULL(DATE_FORMAT(sp.due_date, '%Y-%m-%d'), '') as dueDateISO,
      IFNULL(sp.status_jadwal, '') as statusJadwal,
      IFNULL(sp.alasan_tidak_lanjut, '') as alasan,
      IFNULL(sp.catatan, '') as catatan,
      IFNULL(sp.marketing_period, '') as marketingPeriod,
      IFNULL(DATEDIFF(CURDATE(), sp.status_updated_date), 0) as aging,
      IFNULL(ms.opt_in_wa, 'Belum') as optInWa
    FROM (
      SELECT sp.id_record FROM siswa_periode sp
      ${innerJoin}
      ${where}
      ORDER BY sp.status_updated_date DESC
      LIMIT ${pageSize} OFFSET ${offset}
    ) as sub
    JOIN siswa_periode sp ON sub.id_record = sp.id_record
    LEFT JOIN master_siswa ms ON sp.id_siswa = ms.id_siswa
    LEFT JOIN master_sekolah sek ON ms.id_sekolah = sek.id_sekolah
    ORDER BY sp.status_updated_date DESC
  `;

  const [data] = await pool.query(dataSql, params);
  
  return { data, total, page, pageSize, totalPages };
}

function getMonthYearForPeriod(monthName, periodName) {
  if (!periodName || !periodName.includes('/')) return null;
  const years = periodName.split('/');
  const startYear = parseInt(years[0], 10);
  const endYear = parseInt(years[1], 10);
  if (isNaN(startYear) || isNaN(endYear)) return null;

  const monthsMap = {
    'Agustus':   { month: 8,  year: startYear },
    'September': { month: 9,  year: startYear },
    'Oktober':   { month: 10, year: startYear },
    'November':  { month: 11, year: startYear },
    'Desember':  { month: 12, year: startYear },
    'Januari':   { month: 1,  year: endYear },
    'Februari':  { month: 2,  year: endYear },
    'Maret':     { month: 3,  year: endYear },
    'April':     { month: 4,  year: endYear },
    'Mei':       { month: 5,  year: endYear },
    'Juni':      { month: 6,  year: endYear },
    'Juli':      { month: 7,  year: endYear }
  };
  return monthsMap[monthName] || null;
}

async function getDashboardSummary(user, marketingPeriodArg, monthFilter = 'All') {
  let mp = marketingPeriodArg || user.selectedPeriod;
  if (!mp || mp === '-') mp = await getActiveMarketingPeriod();
  const mf = monthFilter;
  const isAdmin = user.role === 'Admin' || user.role === 'Manager';
  
  const filterParts = (mf !== 'All') ? getMonthYearForPeriod(mf, mp) : null;
  const monthSekClause = filterParts ? ` AND MONTH(sp.created_date) = ${filterParts.month} AND YEAR(sp.created_date) = ${filterParts.year}` : '';
  const monthSiswaClause = filterParts ? ` AND MONTH(sp.created_date) = ${filterParts.month} AND YEAR(sp.created_date) = ${filterParts.year}` : '';
  
  let croSek = '';
  let croSiswa = '';
  const paramsSek = [mp];
  const paramsSiswa = [mp];

  if (!isAdmin) {
    croSek = ' AND sp.pj_sekolah = ?';
    paramsSek.push(user.nama);
    croSiswa = ' AND sp.cro = ?';
    paramsSiswa.push(user.nama);
  }

  const q1 = `SELECT status_terkini, COUNT(*) AS cnt FROM sekolah_periode sp WHERE marketing_period = ?${croSek}${monthSekClause} GROUP BY status_terkini`;
  const [sekolahRows] = await pool.query(q1, paramsSek);

  const funnelSekolahMap = {};
  let totalSekolah = 0;
  sekolahRows.forEach(r => {
    funnelSekolahMap[r.status_terkini] = parseInt(r.cnt, 10);
    totalSekolah += parseInt(r.cnt, 10);
  });
  const sekolahTersosialisasi = funnelSekolahMap['Sudah Sosialisasi'] || 0;

  const q2 = `SELECT status_terkini, COUNT(*) AS cnt FROM siswa_periode sp WHERE marketing_period = ?${croSiswa}${monthSiswaClause} GROUP BY status_terkini`;
  const [siswaRows] = await pool.query(q2, paramsSiswa);

  const funnelSiswaMap = {};
  let totalSiswa = 0;
  siswaRows.forEach(r => {
    funnelSiswaMap[r.status_terkini] = parseInt(r.cnt, 10);
    totalSiswa += parseInt(r.cnt, 10);
  });

  const terdaftar = funnelSiswaMap['Terdaftar'] || 0;
  const prospekAktif = (funnelSiswaMap['Prospek Aktif'] || 0) + (funnelSiswaMap['Konsultasi'] || 0) + (funnelSiswaMap['Layak Home Visit'] || 0) + (funnelSiswaMap['Home Visit'] || 0) + (funnelSiswaMap['Siap Daftar'] || 0) + (funnelSiswaMap['Terdaftar'] || 0);
  const konsultasi = (funnelSiswaMap['Konsultasi'] || 0) + (funnelSiswaMap['Layak Home Visit'] || 0) + (funnelSiswaMap['Home Visit'] || 0) + (funnelSiswaMap['Siap Daftar'] || 0) + (funnelSiswaMap['Terdaftar'] || 0);
  const siapDaftar = (funnelSiswaMap['Siap Daftar'] || 0) + (funnelSiswaMap['Terdaftar'] || 0);
  const calonProspek = (funnelSiswaMap['Calon Prospek'] || 0) + prospekAktif;

  const { mainPool, tenantStorage } = require('../../config/database');
  let quota = { tier: 'Free', limitSiswa: 300, usedSiswa: 0, limitSekolah: 10, usedSekolah: 0, limitUser: 4, usedUser: 0 };
  try {
    let tenantIdForQuota = tenantStorage.getStore();
    
    if (!tenantIdForQuota) {
      const dbName = process.env.DB_NAME;
      const [dbRows] = await mainPool.query("SELECT tenant_id FROM tenant_databases WHERE db_name = ?", [dbName]);
      if (dbRows.length > 0) tenantIdForQuota = dbRows[0].tenant_id;
    }

    if (tenantIdForQuota) {
      const [tenantRows] = await mainPool.query("SELECT tier, limit_siswa, used_siswa, limit_sekolah, used_sekolah, max_admin, max_manager, max_chief_cro, max_cro, addon_cro FROM tenants WHERE tenant_id = ?", [tenantIdForQuota]);
      if (tenantRows.length > 0) {
        const t = tenantRows[0];
        const limitUser = (t.max_admin || 1) + (t.max_manager || 1) + (t.max_chief_cro || 1) + (t.max_cro || 1) + (t.addon_cro || 0);
        
        // Hitung total user aktif di tenant
        const [userRows] = await pool.query("SELECT COUNT(*) as total FROM users WHERE LOWER(status) = 'aktif'");
        const usedUser = userRows[0].total || 0;

        quota = {
          tier: t.tier || 'Free',
          limitSiswa: t.limit_siswa || 300,
          usedSiswa: t.used_siswa || 0,
          limitSekolah: t.limit_sekolah || 10,
          usedSekolah: t.used_sekolah || 0,
          limitUser,
          usedUser
        };
      }
    }
  } catch (err) {
    console.error("Gagal get quota dashboard:", err);
  }

  return {
    stats: {
      totalSekolah, sekolahTersosialisasi,
      totalSiswa, calonProspek: funnelSiswaMap['Calon Prospek'] || 0,
      prospekAktif: funnelSiswaMap['Prospek Aktif'] || 0, konsultasi: funnelSiswaMap['Konsultasi'] || 0,
      siapDaftar: funnelSiswaMap['Siap Daftar'] || 0, totalTerdaftar: terdaftar
    },
    konversi: {
      sekolah: totalSekolah, sudahSosialisasi: sekolahTersosialisasi, pctSosialisasi: totalSekolah > 0 ? Math.round((sekolahTersosialisasi / totalSekolah) * 100) : 0,
      dataSiswa: totalSiswa, calonProspek, pctCalonProspek: totalSiswa > 0 ? Math.round((calonProspek / totalSiswa) * 100) : 0,
      prospekAktif, pctProspek: calonProspek > 0 ? Math.round((prospekAktif / calonProspek) * 100) : 0,
      konsultasi, pctKonsultasi: prospekAktif > 0 ? Math.round((konsultasi / prospekAktif) * 100) : 0,
      siapDaftar, pctSiapDaftar: konsultasi > 0 ? Math.round((siapDaftar / konsultasi) * 100) : 0,
      terdaftar, pctTerdaftar: siapDaftar > 0 ? Math.round((terdaftar / siapDaftar) * 100) : 0
    },
    quota
  };
}

async function getDashboardTasks(user, marketingPeriod) {
  let mp = marketingPeriod || user.selectedPeriod;
  if (!mp || mp === '-') mp = await getActiveMarketingPeriod();
  const isAdmin = user.role === 'Admin' || user.role === 'Manager';
  
  let croSek = '';
  let croSiswa = '';
  let croHv = '';
  let croAe = '';
  
  if (!isAdmin) {
    croSek = ` AND sp.pj_sekolah = ${pool.escape(user.nama)}`;
    croSiswa = ` AND sp.cro = ${pool.escape(user.nama)}`;
    croHv = ` AND sp.cro = ${pool.escape(user.nama)}`;
    croAe = ` AND ae.pj_aktivitas = ${pool.escape(user.nama)}`;
  }

  const getCaseSQL = (col) => `
    CASE 
      WHEN DATEDIFF(${col}, CURDATE()) < -14 THEN 'overdue_gt14' 
      WHEN DATEDIFF(${col}, CURDATE()) < -7 THEN 'overdue_8_14' 
      WHEN DATEDIFF(${col}, CURDATE()) < 0 THEN 'overdue_1_7' 
      WHEN DATEDIFF(${col}, CURDATE()) = 0 THEN 'hari_ini' 
      WHEN DATEDIFF(${col}, CURDATE()) = 1 THEN 'besok' 
      ELSE 'akan_datang' 
    END
  `;

  const q3 = `
    SELECT category, SUM(cnt) as cnt FROM (
      SELECT ${getCaseSQL('sp.due_date')} as category, COUNT(*) as cnt FROM sekolah_periode sp WHERE marketing_period = ? AND due_date IS NOT NULL AND next_action != 'Tidak Ada' AND next_action != ''${croSek} GROUP BY category 
      UNION ALL 
      SELECT ${getCaseSQL('sp.due_date')} as category, COUNT(*) as cnt FROM siswa_periode sp WHERE marketing_period = ? AND due_date IS NOT NULL AND next_action != 'Tidak Ada' AND next_action != ''${croSiswa} GROUP BY category 
      UNION ALL 
      SELECT ${getCaseSQL('hv.due_date')} as category, COUNT(*) as cnt FROM home_visit hv LEFT JOIN siswa_periode sp ON hv.id_siswa_nama LIKE CONCAT(sp.id_siswa, '%') AND sp.marketing_period = hv.marketing_period WHERE hv.marketing_period = ? AND hv.due_date IS NOT NULL AND hv.next_action != 'Tidak Ada' AND hv.next_action != ''${croHv} GROUP BY category 
      UNION ALL 
      SELECT ${getCaseSQL('ae.tanggal_rencana')} as category, COUNT(*) as cnt FROM aktivitas_ekstra ae WHERE marketing_period = ? AND tanggal_rencana IS NOT NULL AND status_aktivitas != 'Selesai' AND status_aktivitas != 'Dibatalkan'${croAe} GROUP BY category
    ) t GROUP BY category
  `;
  
  const [taskRows] = await pool.query(q3, [mp, mp, mp, mp]);
  
  const taskCounts = { overdue_gt14: 0, overdue_8_14: 0, overdue_1_7: 0, hari_ini: 0, besok: 0, akan_datang: 0 };
  taskRows.forEach(row => {
    if (taskCounts.hasOwnProperty(row.category)) {
      taskCounts[row.category] = parseInt(row.cnt, 10);
    }
  });

  const qTasks = `
    SELECT * FROM (
      SELECT sp.id_sekolah as idTarget, ms.nama_sekolah as namaTarget, sp.status_terkini as statusTerkini, sp.next_action as nextAction, DATE_FORMAT(sp.due_date, '%Y-%m-%d') as dueDate, sp.due_date as rawDate
      FROM sekolah_periode sp 
      LEFT JOIN master_sekolah ms ON sp.id_sekolah = ms.id_sekolah
      WHERE sp.marketing_period = ? AND sp.due_date IS NOT NULL AND sp.next_action != 'Tidak Ada' AND sp.next_action != ''${croSek}
      
      UNION ALL 
      
      SELECT sp.id_siswa as idTarget, ms.nama_lengkap as namaTarget, sp.status_terkini as statusTerkini, sp.next_action as nextAction, DATE_FORMAT(sp.due_date, '%Y-%m-%d') as dueDate, sp.due_date as rawDate
      FROM siswa_periode sp 
      LEFT JOIN master_siswa ms ON sp.id_siswa = ms.id_siswa
      WHERE sp.marketing_period = ? AND sp.due_date IS NOT NULL AND sp.next_action != 'Tidak Ada' AND sp.next_action != ''${croSiswa}
    ) t ORDER BY rawDate ASC LIMIT 10
  `;
  
  const [tasksResult] = await pool.query(qTasks, [mp, mp]);

  return { taskSummary: taskCounts, tasks: tasksResult };
}

async function getDashboardFunnels(user, marketingPeriodArg, monthFilter = 'All') {
  let mp = marketingPeriodArg || user.selectedPeriod;
  if (!mp || mp === '-') mp = await getActiveMarketingPeriod();
  const mf = monthFilter;
  const isAdmin = user.role === 'Admin' || user.role === 'Manager';
  
  const filterParts = (mf !== 'All') ? getMonthYearForPeriod(mf, mp) : null;
  const monthSekClause = filterParts ? ` AND MONTH(sp.created_date) = ${filterParts.month} AND YEAR(sp.created_date) = ${filterParts.year}` : '';
  const monthSiswaClause = filterParts ? ` AND MONTH(sp.created_date) = ${filterParts.month} AND YEAR(sp.created_date) = ${filterParts.year}` : '';
  
  let croSek = '';
  let croSiswa = '';
  const paramsSek = [mp];
  const paramsSiswa = [mp];

  if (!isAdmin) {
    croSek = ' AND sp.pj_sekolah = ?';
    paramsSek.push(user.nama);
    croSiswa = ' AND sp.cro = ?';
    paramsSiswa.push(user.nama);
  }

  const q1 = `SELECT status_terkini, COUNT(*) AS cnt FROM sekolah_periode sp WHERE marketing_period = ?${croSek}${monthSekClause} GROUP BY status_terkini`;
  const [sekolahRows] = await pool.query(q1, paramsSek);
  
  const funnelSekolahMap = {};
  sekolahRows.forEach(r => funnelSekolahMap[r.status_terkini] = parseInt(r.cnt, 10));
  
  const { STATUS_SEKOLAH, STATUS_SISWA } = require('./crm.constants');
  
  const funnelSekolah = STATUS_SEKOLAH.map(s => ({ status: s, count: funnelSekolahMap[s] || 0 }));

  const q2 = `SELECT status_terkini, COUNT(*) AS cnt FROM siswa_periode sp WHERE marketing_period = ?${croSiswa}${monthSiswaClause} GROUP BY status_terkini`;
  const [siswaRows] = await pool.query(q2, paramsSiswa);
  
  const funnelSiswaMap = {};
  siswaRows.forEach(r => funnelSiswaMap[r.status_terkini] = parseInt(r.cnt, 10));
  const funnelSiswa = STATUS_SISWA.map(s => ({ status: s, count: funnelSiswaMap[s] || 0 }));

  return { funnelSekolah, funnelSiswa };
}

async function getDashboardAktivitas(user, marketingPeriod, monthFilter = 'All') {
  const mp = marketingPeriod || user.selectedPeriod;
  const mf = monthFilter;
  const isAdmin = user.role === 'Admin' || user.role === 'Manager';
  
  const filterParts = (mf !== 'All') ? getMonthYearForPeriod(mf, mp) : null;
  const monthAktClause = filterParts ? ` AND MONTH(tanggal) = ${filterParts.month} AND YEAR(tanggal) = ${filterParts.year}` : '';
  
  const q5 = `
    SELECT aktivitas, SUM(CASE WHEN DATE(tanggal) = CURDATE() THEN 1 ELSE 0 END) AS cnt_today, COUNT(*) AS cnt_total FROM (
      SELECT aktivitas, tanggal FROM aktivitas_sekolah WHERE marketing_period = ?${monthAktClause}
      UNION ALL 
      SELECT aktivitas, tanggal FROM aktivitas_siswa WHERE marketing_period = ?${monthAktClause}
    ) t GROUP BY aktivitas
  `;
  const [aktRows] = await pool.query(q5, [mp, mp]);
  
  const aktivitasData = aktRows.map(r => ({
    jenis: r.aktivitas, countToday: parseInt(r.cnt_today, 10), countTotal: parseInt(r.cnt_total, 10)
  }));

  let croSiswa = '';
  const paramsTop = [mp];
  if (!isAdmin) {
    croSiswa = ' AND sp.cro = ?';
    paramsTop.push(user.nama);
  }

  const q6 = `
    SELECT sek.nama_sekolah, COUNT(sp.id_siswa) AS jumlah FROM siswa_periode sp 
    JOIN master_siswa ms ON sp.id_siswa = ms.id_siswa 
    JOIN master_sekolah sek ON ms.id_sekolah = sek.id_sekolah 
    WHERE sp.marketing_period = ?${croSiswa}
    GROUP BY sek.nama_sekolah ORDER BY jumlah DESC LIMIT 5
  `;
  const [topSekolahRows] = await pool.query(q6, paramsTop);
  const topSekolah = topSekolahRows.map(r => ({ nama: r.nama_sekolah, jumlah: parseInt(r.jumlah, 10) }));

  return { aktivitasData, topSekolah };
}

async function getDashboardKecamatan(user, marketingPeriod, monthFilter = 'All') {
  const mp = marketingPeriod || user.selectedPeriod;
  const mf = monthFilter;
  const isAdmin = user.role === 'Admin' || user.role === 'Manager';
  
  const filterParts = (mf !== 'All') ? getMonthYearForPeriod(mf, mp) : null;
  const monthSekClause = filterParts ? ` AND MONTH(sp.created_date) = ${filterParts.month} AND YEAR(sp.created_date) = ${filterParts.year}` : '';
  
  let croSek = '';
  const paramsKec = [mp];
  if (!isAdmin) {
    croSek = ' AND sp.pj_sekolah = ?';
    paramsKec.push(user.nama);
  }

  const q7 = `
    SELECT sek.kecamatan, COUNT(*) AS jumlah FROM sekolah_periode sp 
    JOIN master_sekolah sek ON sp.id_sekolah = sek.id_sekolah 
    WHERE sp.marketing_period = ?${croSek}${monthSekClause}
    AND sek.kecamatan IS NOT NULL AND sek.kecamatan != '' 
    GROUP BY sek.kecamatan ORDER BY jumlah DESC LIMIT 10
  `;
  
  const [kecRows] = await pool.query(q7, paramsKec);
  const statistikKecamatan = kecRows.map(r => ({ kecamatan: r.kecamatan, jumlah: parseInt(r.jumlah, 10) }));

  return { statistikKecamatan };
}

/* ── DROPDOWN, MODAL & DETAIL UTILS ── */

async function getSekolahDropdown() {
  const [rows] = await pool.query(
    "SELECT id_sekolah, nama_sekolah FROM master_sekolah ORDER BY nama_sekolah ASC"
  );
  return rows.map(r => ({
    value: r.id_sekolah,
    text: `${r.id_sekolah} - ${r.nama_sekolah}`
  }));
}

async function getAllMarketingPeriods() {
  const [rows] = await pool.query(
    `SELECT id_period as id, nama_period as nama, 
     DATE_FORMAT(start_date, '%d/%m/%Y') as startDate, 
     DATE_FORMAT(end_date, '%d/%m/%Y') as endDate, 
     status 
     FROM marketing_period ORDER BY start_date DESC`
  );
  return rows.map(r => ({
    id: String(r.id || ''),
    nama: String(r.nama || ''),
    startDate: String(r.startDate || ''),
    endDate: String(r.endDate || ''),
    status: String(r.status || '')
  }));
}

async function getActiveMarketingPeriod() {
  const [rows] = await pool.query(
    "SELECT nama_period FROM marketing_period WHERE status = 'aktif' ORDER BY created_date DESC LIMIT 1"
  );
  return rows.length > 0 ? rows[0].nama_period : '-';
}

async function getCarryForwardStatus(user) {
  const activePeriod = await getActiveMarketingPeriod();
  const [[activeCount]] = await pool.query("SELECT COUNT(*) as cnt FROM sekolah_periode WHERE marketing_period = ?", [activePeriod]);
  if (activeCount && activeCount.cnt > 0) return false;
  const [[allCount]] = await pool.query("SELECT COUNT(*) as cnt FROM sekolah_periode LIMIT 1");
  return allCount && allCount.cnt > 0;
}

async function getSiswaById(id, period, user) {
  const mp = period || await getActiveMarketingPeriod();
  
  const [rows] = await pool.query(`
    SELECT 
      sp.id_record as idRecord, ms.id_siswa as id, ms.nama_lengkap as nama,
      ms.id_sekolah as idSekolah, sek.nama_sekolah as namaSekolah, ms.kelas,
      ms.wa, ms.email, ms.alamat, ms.minat_awal as minatAwal,
      ms.rencana_lulus as rencanaLulus, ms.orangtua_tahu as orangtuaTahu,
      sp.cro, sp.prioritas, sp.status_terkini as status, sp.next_action as nextAction,
      DATE_FORMAT(sp.due_date, '%d/%m/%Y') as dueDate,
      DATE_FORMAT(sp.due_date, '%Y-%m-%d') as dueDateISO,
      sp.status_jadwal as statusJadwal,
      sp.alasan_tidak_lanjut as alasan, sp.catatan, sp.marketing_period as marketingPeriod,
      DATEDIFF(CURDATE(), sp.status_updated_date) as aging, ms.opt_in_wa as optInWa
    FROM siswa_periode sp
    LEFT JOIN master_siswa ms ON sp.id_siswa = ms.id_siswa
    LEFT JOIN master_sekolah sek ON ms.id_sekolah = sek.id_sekolah
    WHERE sp.marketing_period = ? AND sp.id_siswa = ? LIMIT 1
  `, [mp, id]);

  if (rows.length === 0) return null;
  const siswa = rows[0];
  siswa.aging = parseInt(siswa.aging) || 0;
  
  // Clean nulls
  Object.keys(siswa).forEach(k => { if (siswa[k] === null) siswa[k] = ''; });

  const [riwayatRows] = await pool.query(`
    SELECT 
      DATE_FORMAT(tanggal, '%d/%m/%Y') as tanggal,
      DATE_FORMAT(tanggal, '%Y-%m-%d') as tanggalISO,
      aktivitas, hasil, status_terkini as status, next_action as nextAction,
      DATE_FORMAT(due_date, '%d/%m/%Y') as dueDate,
      DATE_FORMAT(due_date, '%Y-%m-%d') as dueDateISO,
      catatan, alasan_tidak_lanjut as alasan
    FROM aktivitas_siswa 
    WHERE id_siswa_nama LIKE ? AND marketing_period = ? 
    ORDER BY timestamp DESC
  `, [`${id}%`, mp]);
  
  riwayatRows.forEach(r => {
    Object.keys(r).forEach(k => { if (r[k] === null) r[k] = ''; });
  });

  siswa.riwayat = riwayatRows;
  return siswa;
}

async function getSekolahById(id, period, user) {
  const mp = period || await getActiveMarketingPeriod();
  
  const [rows] = await pool.query(`
    SELECT 
      sp.id_record as idRecord, ms.id_sekolah as id, ms.nama_sekolah as nama,
      ms.alamat, ms.kecamatan, ms.jenjang as tingkat, ms.status_sekolah as statusSekolah, ms.pic_utama as picUtama,
      ms.wa_pic as waPic, sp.pj_sekolah as pj,
      sp.status_terkini as status, sp.next_action as nextAction,
      DATE_FORMAT(sp.due_date, '%d/%m/%Y') as dueDate,
      DATE_FORMAT(sp.due_date, '%Y-%m-%d') as dueDateISO,
      sp.status_jadwal as statusJadwal,
      sp.catatan, sp.marketing_period as marketingPeriod,
      DATEDIFF(CURDATE(), sp.status_updated_date) as aging, sp.sekolah_aktif as sekolahAktif,
      sp.jumlah_siswa as jumlahSiswa, sp.alasan_tidak_bisa_sosialisasi as alasan
    FROM sekolah_periode sp
    LEFT JOIN master_sekolah ms ON sp.id_sekolah = ms.id_sekolah
    WHERE sp.marketing_period = ? AND sp.id_sekolah = ? LIMIT 1
  `, [mp, id]);

  if (rows.length === 0) return null;
  const sekolah = rows[0];
  sekolah.aging = parseInt(sekolah.aging) || 0;
  
  // Clean nulls
  Object.keys(sekolah).forEach(k => { if (sekolah[k] === null) sekolah[k] = ''; });

  const [riwayatRows] = await pool.query(`
    SELECT 
      DATE_FORMAT(tanggal, '%d/%m/%Y') as tanggal,
      DATE_FORMAT(tanggal, '%Y-%m-%d') as tanggalISO,
      sekolah_aktif as sekolahAktif, aktivitas, hasil, status_terkini as status, next_action as nextAction,
      pic, wa_pic as waPic, jabatan_pic as jabatanPic,
      DATE_FORMAT(due_date, '%d/%m/%Y') as dueDate,
      DATE_FORMAT(due_date, '%Y-%m-%d') as dueDateISO,
      catatan, jumlah_siswa as jumlahSiswa, alasan_tidak_bisa_sosialisasi as alasan
    FROM aktivitas_sekolah
    WHERE id_sekolah_nama LIKE ? AND marketing_period = ? 
    ORDER BY timestamp DESC
  `, [`${id}%`, mp]);
  
  riwayatRows.forEach(r => {
    Object.keys(r).forEach(k => { if (r[k] === null) r[k] = ''; });
  });
  sekolah.riwayat = riwayatRows;

  const [riwayatEkstra] = await pool.query(`
    SELECT 
      DATE_FORMAT(COALESCE(tanggal_realisasi, tanggal_rencana), '%d/%m/%Y') as tanggal,
      DATE_FORMAT(COALESCE(tanggal_realisasi, tanggal_rencana), '%Y-%m-%d') as tanggalISO,
      DATE_FORMAT(tanggal_rencana, '%d/%m/%Y') as tanggalRencana,
      DATE_FORMAT(tanggal_realisasi, '%d/%m/%Y') as tanggalRealisasi,
      aktivitas, status_aktivitas as statusAktivitas,
      pj_aktivitas as pic,
      tujuan_catatan as catatan,
      catatan_hasil as catatanHasil
    FROM aktivitas_ekstra
    WHERE id_sekolah LIKE ? AND marketing_period = ?
    ORDER BY timestamp DESC
  `, [`${id}%`, mp]);
  
  riwayatEkstra.forEach(r => {
    Object.keys(r).forEach(k => { if (r[k] === null) r[k] = ''; });
  });
  sekolah.riwayatEkstra = riwayatEkstra;

  return sekolah;
}

function getPrioritySortValue(prioritas) {
  const p = String(prioritas || '').trim().toLowerCase();
  switch (p) {
    case 'tinggi': return 1;
    case 'sedang': return 2;
    case 'rendah': return 3;
    default: return 4;
  }
}

function getDueCategory(diffDays) {
  if (diffDays === null || diffDays === undefined) return { category: 'no_date', label: 'Tanpa Tanggal', emoji: '⚫', sortOrder: 99 };
  if (diffDays < -14) return { category: 'overdue_gt14', label: 'Overdue >14 Hari', emoji: '🔴', sortOrder: 1 };
  if (diffDays < -7) return { category: 'overdue_8_14', label: 'Overdue 8–14 Hari', emoji: '🟠', sortOrder: 2 };
  if (diffDays < 0) return { category: 'overdue_1_7', label: 'Overdue 1–7 Hari', emoji: '🟡', sortOrder: 3 };
  if (diffDays === 0) return { category: 'hari_ini', label: 'Hari Ini', emoji: '🔵', sortOrder: 4 };
  if (diffDays === 1) return { category: 'besok', label: 'Besok', emoji: '🟢', sortOrder: 5 };
  return { category: 'akan_datang', label: 'Akan Datang', emoji: '⚪', sortOrder: 6 };
}

async function getTaskList(category, period, user) {
  const mp = period || await getActiveMarketingPeriod();
  const targetCategory = category || 'hari_ini';
  const isAdmin = user.role === 'Admin' || user.role === 'Manager';

  // 1. Get counts
  const { taskSummary: counts } = await getDashboardTasks(user, mp);

  let dateFilterSqlDue = "";
  let dateFilterSqlRencana = "";
  if (targetCategory === 'overdue') {
    dateFilterSqlDue = " AND DATEDIFF(sp.due_date, CURDATE()) < 0";
    dateFilterSqlRencana = " AND DATEDIFF(ae.tanggal_rencana, CURDATE()) < 0";
  } else if (targetCategory === 'overdue_gt14') {
    dateFilterSqlDue = " AND DATEDIFF(sp.due_date, CURDATE()) < -14";
    dateFilterSqlRencana = " AND DATEDIFF(ae.tanggal_rencana, CURDATE()) < -14";
  } else if (targetCategory === 'overdue_8_14') {
    dateFilterSqlDue = " AND DATEDIFF(sp.due_date, CURDATE()) >= -14 AND DATEDIFF(sp.due_date, CURDATE()) < -7";
    dateFilterSqlRencana = " AND DATEDIFF(ae.tanggal_rencana, CURDATE()) >= -14 AND DATEDIFF(ae.tanggal_rencana, CURDATE()) < -7";
  } else if (targetCategory === 'overdue_1_7') {
    dateFilterSqlDue = " AND DATEDIFF(sp.due_date, CURDATE()) >= -7 AND DATEDIFF(sp.due_date, CURDATE()) < 0";
    dateFilterSqlRencana = " AND DATEDIFF(ae.tanggal_rencana, CURDATE()) >= -7 AND DATEDIFF(ae.tanggal_rencana, CURDATE()) < 0";
  } else if (targetCategory === 'hari_ini') {
    dateFilterSqlDue = " AND DATEDIFF(sp.due_date, CURDATE()) = 0";
    dateFilterSqlRencana = " AND DATEDIFF(ae.tanggal_rencana, CURDATE()) = 0";
  } else if (targetCategory === 'besok') {
    dateFilterSqlDue = " AND DATEDIFF(sp.due_date, CURDATE()) = 1";
    dateFilterSqlRencana = " AND DATEDIFF(ae.tanggal_rencana, CURDATE()) = 1";
  } else if (targetCategory === 'akan_datang') {
    dateFilterSqlDue = " AND DATEDIFF(sp.due_date, CURDATE()) > 1";
    dateFilterSqlRencana = " AND DATEDIFF(ae.tanggal_rencana, CURDATE()) > 1";
  }

  // 2. Fetch all tasks concurrently
  const paramsSekolah = [mp];
  let sqlSekolah = `
    SELECT 
      sp.id_sekolah, ms.nama_sekolah, sp.status_terkini, sp.next_action,
      DATE_FORMAT(sp.due_date, '%d/%m/%Y') as dueDate,
      DATE_FORMAT(sp.due_date, '%Y-%m-%d') as dueDateISO,
      DATEDIFF(sp.due_date, CURDATE()) as dueDiff,
      sp.pj_sekolah,
      DATEDIFF(CURDATE(), sp.status_updated_date) as aging
    FROM sekolah_periode sp
    LEFT JOIN master_sekolah ms ON sp.id_sekolah = ms.id_sekolah
    WHERE sp.marketing_period = ? AND sp.next_action != 'Tidak Ada' AND sp.next_action != '' ${dateFilterSqlDue}
  `;
  if (!isAdmin) {
    sqlSekolah += " AND sp.pj_sekolah = ?";
    paramsSekolah.push(user.nama);
  }

  const paramsSiswa = [mp];
  let sqlSiswa = `
    SELECT 
      sp.id_siswa, ms.nama_lengkap, sp.status_terkini, sp.next_action,
      DATE_FORMAT(sp.due_date, '%d/%m/%Y') as dueDate,
      DATE_FORMAT(sp.due_date, '%Y-%m-%d') as dueDateISO,
      DATEDIFF(sp.due_date, CURDATE()) as dueDiff,
      sp.prioritas, sp.cro,
      DATEDIFF(CURDATE(), sp.status_updated_date) as aging
    FROM siswa_periode sp
    LEFT JOIN master_siswa ms ON sp.id_siswa = ms.id_siswa
    WHERE sp.marketing_period = ? AND sp.next_action != 'Tidak Ada' AND sp.next_action != '' ${dateFilterSqlDue}
  `;
  if (!isAdmin) {
    sqlSiswa += " AND sp.cro = ?";
    paramsSiswa.push(user.nama);
  }

  const dateFilterSqlHV = dateFilterSqlDue.replace(/sp\\.due_date/g, 'hv.due_date');
  const paramsHV = [mp];
  let sqlHV = `
    SELECT 
      hv.id_siswa_nama, hv.status_terkini, hv.next_action,
      DATE_FORMAT(hv.due_date, '%d/%m/%Y') as dueDate,
      DATE_FORMAT(hv.due_date, '%Y-%m-%d') as dueDateISO,
      DATEDIFF(hv.due_date, CURDATE()) as dueDiff,
      sp.cro, sp.prioritas
    FROM home_visit hv
    LEFT JOIN siswa_periode sp ON hv.id_siswa_nama LIKE CONCAT(sp.id_siswa, '%') AND sp.marketing_period = hv.marketing_period
    WHERE hv.marketing_period = ? AND hv.next_action != 'Tidak Ada' AND hv.next_action != '' ${dateFilterSqlHV}
  `;
  if (!isAdmin) {
    sqlHV += " AND sp.cro = ?";
    paramsHV.push(user.nama);
  }

  const paramsEkstra = [mp];
  let sqlEkstra = `
    SELECT 
      ae.id_sekolah, ms.nama_sekolah, ae.id_aktifitas_ekstra, ae.aktivitas as next_action,
      DATE_FORMAT(ae.tanggal_rencana, '%d/%m/%Y') as dueDate,
      DATE_FORMAT(ae.tanggal_rencana, '%Y-%m-%d') as dueDateISO,
      DATEDIFF(ae.tanggal_rencana, CURDATE()) as dueDiff,
      ae.status_aktivitas, ae.pj_aktivitas, ae.tujuan_catatan
    FROM aktivitas_ekstra ae
    LEFT JOIN master_sekolah ms ON ae.id_sekolah = ms.id_sekolah
    WHERE ae.marketing_period = ? AND ae.status_aktivitas != 'Selesai' AND ae.status_aktivitas != 'Dibatalkan' AND ae.tanggal_rencana IS NOT NULL ${dateFilterSqlRencana}
  `;
  if (!isAdmin) {
    sqlEkstra += " AND ae.pj_aktivitas = ?";
    paramsEkstra.push(user.nama);
  }

  const [
    [rowsSekolah], [rowsSiswa], [rowsHV], [rowsEkstra]
  ] = await Promise.all([
    pool.query(sqlSekolah, paramsSekolah),
    pool.query(sqlSiswa, paramsSiswa),
    pool.query(sqlHV, paramsHV),
    pool.query(sqlEkstra, paramsEkstra)
  ]);

  const tasks = [];

  rowsSekolah.forEach(row => {
    tasks.push({
      tipe: 'sekolah',
      id: String(row.id_sekolah || ''),
      nama: String(row.nama_sekolah || ''),
      status: String(row.status_terkini || ''),
      nextAction: String(row.next_action || ''),
      dueDate: String(row.dueDate || ''),
      dueDateISO: String(row.dueDateISO || ''),
      dueCategory: getDueCategory(row.dueDiff),
      prioritas: '',
      pj: String(row.pj_sekolah || ''),
      aging: row.aging ? parseInt(row.aging) : 0
    });
  });

  rowsSiswa.forEach(row => {
    tasks.push({
      tipe: 'siswa',
      id: String(row.id_siswa || ''),
      nama: String(row.nama_lengkap || ''),
      status: String(row.status_terkini || ''),
      nextAction: String(row.next_action || ''),
      dueDate: String(row.dueDate || ''),
      dueDateISO: String(row.dueDateISO || ''),
      dueCategory: getDueCategory(row.dueDiff),
      prioritas: String(row.prioritas || ''),
      cro: String(row.cro || ''),
      aging: row.aging ? parseInt(row.aging) : 0
    });
  });

  rowsHV.forEach(row => {
    const idSiswaNama = String(row.id_siswa_nama || '');
    tasks.push({
      tipe: 'homevisit',
      id: idSiswaNama,
      nama: idSiswaNama,
      status: String(row.status_terkini || ''),
      nextAction: String(row.next_action || ''),
      dueDate: String(row.dueDate || ''),
      dueDateISO: String(row.dueDateISO || ''),
      dueCategory: getDueCategory(row.dueDiff),
      prioritas: String(row.prioritas || ''),
      cro: String(row.cro || ''),
      aging: 0
    });
  });

  rowsEkstra.forEach(row => {
    tasks.push({
      tipe: 'aktifitas_ekstra',
      id: String(row.id_aktifitas_ekstra || ''),
      idSekolah: String(row.id_sekolah || ''),
      nama: String(row.nama_sekolah || ''),
      status: String(row.status_aktivitas || ''),
      nextAction: String(row.next_action || ''),
      dueDate: String(row.dueDate || ''),
      dueDateISO: String(row.dueDateISO || ''),
      dueCategory: getDueCategory(row.dueDiff),
      prioritas: '',
      cro: String(row.pj_aktivitas || ''),
      tujuan: String(row.tujuan_catatan || ''),
      aging: 0
    });
  });

  // Sort: prioritas -> aging desc
  tasks.sort((a, b) => {
    const pa = getPrioritySortValue(a.prioritas);
    const pb = getPrioritySortValue(b.prioritas);
    if (pa !== pb) return pa - pb;
    return b.aging - a.aging;
  });

  return { tasks, counts, _debug: "[Node.js Express SQL Port]" };
}

async function generateId(prefix, tableName, columnName) {
  const [rows] = await pool.query(`SELECT ${columnName} FROM ${tableName} WHERE ${columnName} LIKE ? ORDER BY LENGTH(${columnName}) DESC, ${columnName} DESC LIMIT 1`, [`${prefix}-%`]);
  let nextNumber = 1;
  if (rows.length > 0) {
    const lastId = rows[0][columnName];
    const parts = lastId.split('-');
    if (parts.length > 1) {
      const num = parseInt(parts[1], 10);
      if (!isNaN(num)) nextNumber = num + 1;
    }
  }
  return `${prefix}-${nextNumber}`;
}

// ==========================================
// WEEKLY PLANNING
// ==========================================

async function getWeeklyPlanningData(startDate, endDate, period, user) {
  const mp = period || await getActiveMarketingPeriod();
  const isAdmin = user.role === 'Admin' || user.role === 'Manager';
  
  const startStr = startDate ? startDate.split('T')[0] : '';
  const endStr = endDate ? endDate.split('T')[0] : '';

  let dateFilterSqlDue = "";
  let dateFilterSqlHV = "";
  let dateFilterSqlRencana = "";
  let dateFilterSqlManual = "";
  
  if (startStr && endStr) {
    dateFilterSqlDue = ` AND sp.due_date BETWEEN '${startStr}' AND '${endStr}'`;
    dateFilterSqlHV = ` AND hv.due_date BETWEEN '${startStr}' AND '${endStr}'`;
    dateFilterSqlRencana = ` AND ae.tanggal_rencana BETWEEN '${startStr}' AND '${endStr}'`;
    dateFilterSqlManual = ` AND tanggal BETWEEN '${startStr}' AND '${endStr}'`;
  }

  // 1. Sekolah Tasks
  const paramsSekolah = [mp];
  let sqlSekolah = `
    SELECT 
      IFNULL(sp.id_sekolah, '') as id_sekolah,
      IFNULL(ms.nama_sekolah, '') as nama_sekolah,
      IFNULL(sp.pj_sekolah, '') as pj_sekolah,
      IFNULL(sp.next_action, '') as next_action,
      IFNULL(sp.due_date, '') as due_date,
      IFNULL(sp.status_terkini, '') as status_terkini,
      IFNULL(sp.status_jadwal, '') as status_jadwal,
      IFNULL(ms.alamat, '') as alamat,
      IFNULL(sp.catatan, '') as catatan
    FROM sekolah_periode sp
    LEFT JOIN master_sekolah ms ON sp.id_sekolah = ms.id_sekolah
    WHERE sp.marketing_period = ? AND sp.next_action != 'Tidak Ada' AND sp.next_action != '' AND sp.due_date IS NOT NULL ${dateFilterSqlDue}
  `;
  if (!isAdmin) {
    sqlSekolah += " AND sp.pj_sekolah = ?";
    paramsSekolah.push(user.nama);
  }

  // 2. Siswa Tasks
  const paramsSiswa = [mp];
  let sqlSiswa = `
    SELECT 
      IFNULL(sp.id_siswa, '') as id_siswa,
      IFNULL(ms.nama_lengkap, '') as nama_siswa,
      IFNULL(sp.cro, '') as cro,
      IFNULL(sp.next_action, '') as next_action,
      IFNULL(sp.due_date, '') as due_date,
      IFNULL(sp.catatan, '') as catatan,
      IFNULL(sp.status_terkini, '') as status_terkini,
      IFNULL(sp.status_jadwal, '') as status_jadwal
    FROM siswa_periode sp
    LEFT JOIN master_siswa ms ON sp.id_siswa = ms.id_siswa
    WHERE sp.marketing_period = ? AND sp.next_action != 'Tidak Ada' AND sp.next_action != '' AND sp.due_date IS NOT NULL ${dateFilterSqlDue}
  `;
  if (!isAdmin) {
    sqlSiswa += " AND sp.cro = ?";
    paramsSiswa.push(user.nama);
  }

  // 3. Home Visit Tasks
  const paramsHV = [mp];
  let sqlHV = `
    SELECT 
      IFNULL(hv.id_siswa_nama, '') as id_siswa_nama,
      IFNULL(hv.id_sekolah_nama, '') as id_sekolah_nama,
      IFNULL(hv.next_action, '') as next_action,
      IFNULL(hv.due_date, '') as due_date,
      IFNULL(hv.catatan, '') as catatan,
      IFNULL(sp.cro, '') as cro,
      IFNULL(hv.status_terkini, '') as status_terkini,
      IFNULL(hv.status_jadwal, '') as status_jadwal
    FROM home_visit hv
    LEFT JOIN siswa_periode sp ON hv.id_siswa_nama LIKE CONCAT(sp.id_siswa, '%') AND sp.marketing_period = hv.marketing_period
    WHERE hv.marketing_period = ? AND hv.next_action != 'Tidak Ada' AND hv.next_action != '' AND hv.due_date IS NOT NULL ${dateFilterSqlHV}
  `;
  if (!isAdmin) {
    sqlHV += " AND sp.cro = ?";
    paramsHV.push(user.nama);
  }

  // 4. Aktifitas Ekstra
  const paramsEkstra = [mp];
  let sqlEkstra = `
    SELECT 
      IFNULL(ae.id_aktifitas_ekstra, '') as id_aktifitas_ekstra,
      IFNULL(ae.id_sekolah, '') as id_sekolah,
      IFNULL(ae.aktivitas, '') as aktivitas,
      IFNULL(ae.pj_aktivitas, '') as pj_aktivitas,
      IFNULL(ae.tujuan_catatan, '') as tujuan_catatan,
      IFNULL(ae.status_aktivitas, '') as status_aktivitas,
      IFNULL(ae.tanggal_rencana, '') as tanggal_rencana,
      IFNULL(ms.nama_sekolah, '') as nama_sekolah,
      IFNULL(ms.alamat, '') as alamat
    FROM aktivitas_ekstra ae
    LEFT JOIN master_sekolah ms ON ae.id_sekolah = ms.id_sekolah
    WHERE ae.marketing_period = ? AND ae.status_aktivitas = 'Direncanakan' AND ae.tanggal_rencana IS NOT NULL ${dateFilterSqlRencana}
  `;
  if (!isAdmin) {
    sqlEkstra += " AND ae.pj_aktivitas = ?";
    paramsEkstra.push(user.nama);
  }

  // 5. Manual Agenda
  const paramsWP = [mp];
  let sqlWP = `
    SELECT 
      IFNULL(id_agenda, '') as id_agenda,
      IFNULL(referensi_id, '') as referensi_id,
      IFNULL(judul, '') as judul,
      IFNULL(jenis_agenda, '') as jenis_agenda,
      IFNULL(tanggal, '') as tanggal,
      IFNULL(jam_mulai, '') as jam_mulai,
      IFNULL(jam_selesai, '') as jam_selesai,
      IFNULL(lokasi, '') as lokasi,
      IFNULL(cro, '') as cro,
      IFNULL(catatan, '') as catatan
    FROM weekly_planning 
    WHERE marketing_period = ? AND tanggal IS NOT NULL ${dateFilterSqlManual}
  `;
  if (!isAdmin) {
    sqlWP += " AND sp.cro = ?";
    paramsWP.push(user.nama);
  }

  const [[rowsSekolah], [rowsSiswa], [rowsHV], [rowsEkstra], [rowsWP]] = await Promise.all([
    pool.query(sqlSekolah, paramsSekolah),
    pool.query(sqlSiswa, paramsSiswa),
    pool.query(sqlHV, paramsHV),
    pool.query(sqlEkstra, paramsEkstra),
    pool.query(sqlWP, paramsWP)
  ]);

  const items = [];

  const formatDateISO = (d) => {
    if (!d) return '';
    const dt = new Date(d);
    return dt.toISOString().split('T')[0];
  };

  const formatDateId = (d) => {
    if (!d) return '';
    const dt = new Date(d);
    return ('0' + dt.getDate()).slice(-2) + '/' + ('0' + (dt.getMonth()+1)).slice(-2) + '/' + dt.getFullYear();
  };

  rowsSekolah.forEach(row => {
    items.push({
      id: 'task-sch-' + row.id_sekolah,
      refId: row.id_sekolah,
      source: 'auto',
      tipe: 'sekolah',
      judul: row.next_action + ' - ' + row.nama_sekolah,
      jenisAgenda: row.next_action,
      tanggal: formatDateISO(row.due_date),
      tanggalId: formatDateId(row.due_date),
      jamMulai: '',
      jamSelesai: '',
      lokasi: row.alamat,
      cro: row.pj_sekolah,
      catatan: row.catatan,
      status: row.status_terkini,
      statusJadwal: row.status_jadwal
    });
  });

  rowsSiswa.forEach(row => {
    items.push({
      id: 'task-sis-' + row.id_siswa,
      refId: row.id_siswa,
      source: 'auto',
      tipe: 'siswa',
      judul: row.next_action + ' - ' + row.nama_siswa,
      jenisAgenda: row.next_action,
      tanggal: formatDateISO(row.due_date),
      tanggalId: formatDateId(row.due_date),
      jamMulai: '',
      jamSelesai: '',
      lokasi: '',
      cro: row.cro,
      catatan: row.catatan,
      status: row.status_terkini,
      statusJadwal: row.status_jadwal
    });
  });

  rowsHV.forEach(row => {
    const namaSiswa = String(row.id_siswa_nama).split('-').slice(1).join('-') || row.id_siswa_nama;
    items.push({
      id: 'task-hv-' + row.id_siswa_nama,
      refId: row.id_siswa_nama,
      source: 'auto',
      tipe: 'homevisit',
      judul: row.next_action + ' - ' + namaSiswa,
      jenisAgenda: row.next_action,
      tanggal: formatDateISO(row.due_date),
      tanggalId: formatDateId(row.due_date),
      jamMulai: '',
      jamSelesai: '',
      lokasi: '',
      cro: row.cro,
      catatan: row.catatan,
      status: row.status_terkini,
      statusJadwal: row.status_jadwal
    });
  });

  rowsEkstra.forEach(row => {
    items.push({
      id: 'task-ae-' + row.id_aktifitas_ekstra,
      refId: row.id_sekolah,
      source: 'auto',
      tipe: 'aktifitas_ekstra',
      judul: '[Ekstra] ' + row.aktivitas + ' - ' + row.nama_sekolah,
      jenisAgenda: row.aktivitas,
      tanggal: formatDateISO(row.tanggal_rencana),
      tanggalId: formatDateId(row.tanggal_rencana),
      jamMulai: '',
      jamSelesai: '',
      lokasi: row.alamat,
      cro: row.pj_aktivitas,
      catatan: row.tujuan_catatan,
      status: row.status_aktivitas,
      statusJadwal: 'Terjadwal'
    });
  });

  rowsWP.forEach(row => {
    items.push({
      id: row.id_agenda,
      refId: row.referensi_id,
      source: 'agenda',
      tipe: 'agenda',
      judul: row.judul,
      jenisAgenda: row.jenis_agenda,
      tanggal: formatDateISO(row.tanggal),
      tanggalId: formatDateId(row.tanggal),
      jamMulai: row.jam_mulai,
      jamSelesai: row.jam_selesai,
      lokasi: row.lokasi,
      cro: row.cro,
      catatan: row.catatan,
      status: '',
      statusJadwal: ''
    });
  });

  // Sort
  items.sort((a, b) => {
    if (a.tanggal !== b.tanggal) return a.tanggal < b.tanggal ? -1 : 1;
    if (a.jamMulai && b.jamMulai) return a.jamMulai < b.jamMulai ? -1 : 1;
    if (a.jamMulai) return -1;
    if (b.jamMulai) return 1;
    return 0;
  });

  return items;
}

async function createAgenda(data, user) {
  const mp = await getActiveMarketingPeriod();
  const newId = await generateId('AGD', 'weekly_planning', 'id_agenda');
  const now = new Date();
  
  const sql = "INSERT INTO weekly_planning (marketing_period, id_agenda, referensi_id, jenis_agenda, judul, tanggal, jam_mulai, jam_selesai, lokasi, cro, catatan, calendar_event_id, created_date, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
  
  await pool.query(sql, [
    mp,
    newId,
    data.referensiId || '',
    data.jenisAgenda || '',
    data.judul || '',
    data.tanggal || null,
    data.jamMulai || '',
    data.jamSelesai || '',
    data.lokasi || '',
    (user.role === 'CRO') ? user.nama : (data.cro || user.nama),
    data.catatan || '',
    '', // calendar_event_id
    now,
    now
  ]);
  
  return { success: true, message: 'Agenda berhasil dibuat.', id: newId };
}

async function updateAgenda(id, data, user) {
  const setClauses = ["last_updated = ?"];
  const params = [new Date()];
  
  if (data.judul !== undefined) { setClauses.push("judul = ?"); params.push(data.judul); }
  if (data.tanggal !== undefined) { setClauses.push("tanggal = ?"); params.push(data.tanggal || null); }
  if (data.jamMulai !== undefined) { setClauses.push("jam_mulai = ?"); params.push(data.jamMulai); }
  if (data.jamSelesai !== undefined) { setClauses.push("jam_selesai = ?"); params.push(data.jamSelesai); }
  if (data.lokasi !== undefined) { setClauses.push("lokasi = ?"); params.push(data.lokasi); }
  if (data.catatan !== undefined) { setClauses.push("catatan = ?"); params.push(data.catatan); }
  
  params.push(id);
  
  const [result] = await pool.query("UPDATE weekly_planning SET " + setClauses.join(', ') + " WHERE id_agenda = ?", params);
  
  if (result.affectedRows === 0) {
    throw new Error('Agenda tidak ditemukan.');
  }
  
  return { success: true, message: 'Agenda berhasil diperbarui.' };
}

async function deleteAgenda(id, user) {
  const [result] = await pool.query("DELETE FROM weekly_planning WHERE id_agenda = ?", [id]);
  if (result.affectedRows === 0) {
    throw new Error('Agenda tidak ditemukan.');
  }
  return { success: true, message: 'Agenda berhasil dihapus.' };
}

// ==========================================
// HOME VISIT
// ==========================================

const HASIL_AKTIVITAS_HOME_VISIT = {
  'Jadwal Home Visit Disepakati': { status: 'Home Visit Terjadwal', nextAction: 'Laksanakan Home Visit' },
  'Jadwal Home Visit Ditunda':    { status: 'Menunggu Home Visit',  nextAction: 'Jadwalkan Home Visit' },
  'Home Visit Berhasil':          { status: 'Home Visit Selesai',   nextAction: 'Tidak Ada' },
  'Perlu Follow Up Orang Tua':    { status: 'Home Visit Selesai',   nextAction: 'Follow Up' },
  'Ditolak Orang Tua':            { status: 'Tidak Berhasil',       nextAction: 'Tidak Ada' },
  'Tidak Bertemu Orang Tua':      { status: 'Menunggu Home Visit',  nextAction: 'Jadwalkan Home Visit' }
};

async function getAllHomeVisit(filter, user) {
  const mp = (filter && filter.marketingPeriod) || await getActiveMarketingPeriod();
  const isAdmin = user.role === 'Admin' || user.role === 'Manager';
  
  let sql = `
    SELECT 
      IFNULL(hv.timestamp, '') as timestamp,
      IFNULL(hv.tanggal_hv, '') as tanggal_hv,
      IFNULL(hv.id_siswa_nama, '') as id_siswa_nama,
      IFNULL(hv.id_sekolah_nama, '') as id_sekolah_nama,
      IFNULL(hv.orangtua_ada, '') as orangtua_ada,
      IFNULL(hv.nama_orangtua, '') as nama_orangtua,
      IFNULL(hv.wa_orangtua, '') as wa_orangtua,
      IFNULL(hv.hasil_hv, '') as hasil_hv,
      IFNULL(hv.sikap_orangtua, '') as sikap_orangtua,
      IFNULL(hv.status_terkini, '') as status_terkini,
      IFNULL(hv.next_action, '') as next_action,
      IFNULL(hv.due_date, '') as due_date,
      IFNULL(hv.status_jadwal, '') as status_jadwal,
      IFNULL(hv.alasan_tidak_lanjut, '') as alasan_tidak_lanjut,
      IFNULL(hv.catatan, '') as catatan,
      IFNULL(hv.marketing_period, '') as marketing_period
    FROM home_visit hv
  `;
  const params = [];

  if (!isAdmin) {
    sql += " JOIN siswa_periode sp ON hv.id_siswa_nama LIKE CONCAT(sp.id_siswa, '%') AND sp.marketing_period = hv.marketing_period WHERE hv.marketing_period = ? AND sp.cro = ?";
    params.push(mp, user.nama);
  } else {
    sql += " WHERE hv.marketing_period = ?";
    params.push(mp);
  }

  const [rows] = await pool.query(sql, params);
  
  const formatDateId = (d) => {
    if (!d) return '';
    const dt = new Date(d);
    return ('0' + dt.getDate()).slice(-2) + '/' + ('0' + (dt.getMonth()+1)).slice(-2) + '/' + dt.getFullYear();
  };
  const formatDateISO = (d) => {
    if (!d) return '';
    const dt = new Date(d);
    return dt.toISOString().split('T')[0];
  };

  let result = rows.map(row => {
    const siswaNama = String(row.id_siswa_nama || '');
    const sekolahNama = String(row.id_sekolah_nama || '');
    return {
      timestamp:   row.timestamp ? formatDateId(row.timestamp) : '',
      tanggalHV:   row.tanggal_hv ? formatDateId(row.tanggal_hv) : '',
      sekolah:     sekolahNama,
      siswa:       siswaNama,
      idSiswaNama: siswaNama,
      namaSiswa:   siswaNama.split('-').slice(1).join('-') || siswaNama,
      idSekolahNama: sekolahNama,
      namaSekolah: sekolahNama.split('-').slice(1).join('-') || sekolahNama,
      orangtuaAda: String(row.orangtua_ada || ''),
      namaOrtu:    String(row.nama_orangtua || ''),
      namaOrangtua: String(row.nama_orangtua || ''),
      waOrtu:      String(row.wa_orangtua || ''),
      waOrangtua:  String(row.wa_orangtua || ''),
      hasilHV:     String(row.hasil_hv || ''),
      sikapOrtu:   String(row.sikap_orangtua || ''),
      sikapOrangtua: String(row.sikap_orangtua || ''),
      catatanHV:   String(row.catatan || ''),
      statusTerkini: String(row.status_terkini || ''),
      status:      String(row.status_terkini || ''),
      nextAction:  String(row.next_action || ''),
      dueDate:     row.due_date ? formatDateId(row.due_date) : '',
      dueDateISO:  row.due_date ? formatDateISO(row.due_date) : '',
      statusJadwal: String(row.status_jadwal || ''),
      alasan:      String(row.alasan_tidak_lanjut || ''),
      catatan:     String(row.catatan || ''),
      marketingPeriod: String(row.marketing_period || '')
    };
  });

  if (filter) {
    if (filter.status) result = result.filter(r => r.status === filter.status);
    if (filter.search) {
      const q = filter.search.toLowerCase();
      result = result.filter(r => r.siswa.toLowerCase().includes(q) || r.sekolah.toLowerCase().includes(q));
    }
  }

  return result;
}

async function getHomeVisitById(idSiswa, period, user) {
  const filter = { marketingPeriod: period || await getActiveMarketingPeriod() };
  const allData = await getAllHomeVisit(filter, user);
  return allData.find(r => r.siswa.startsWith(idSiswa)) || null;
}

async function createHomeVisit(idSiswa, data, user) {
  const mp = await getActiveMarketingPeriod();
  
  // Get siswa info
  const { data: siswaData } = await getSiswaById(idSiswa, mp, user);
  if (!siswaData) throw new Error('Siswa tidak ditemukan.');
  
  if (siswaData.status !== 'Layak Home Visit') {
    throw new Error('Siswa harus berstatus "Layak Home Visit".');
  }

  const idSekolahNama = siswaData.idSekolah + '-' + siswaData.namaSekolah;
  const idSiswaNama = idSiswa + '-' + siswaData.nama;
  const now = new Date();

  const sql = "INSERT INTO home_visit (marketing_period, timestamp, tanggal_hv, id_sekolah_nama, id_siswa_nama, orangtua_ada, nama_orangtua, wa_orangtua, hasil_hv, status_terkini, alasan_tidak_lanjut, sikap_orangtua, next_action, due_date, status_jadwal, catatan) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
  
  await pool.query(sql, [
    mp,
    now,
    data.tanggalHV ? new Date(data.tanggalHV) : now,
    idSekolahNama,
    idSiswaNama,
    data.orangtuaAda || '',
    data.namaOrtu || '',
    (data.waOrtu || '').replace(/[^0-9]/g, ''),
    '',
    'Menunggu Home Visit',
    '',
    '',
    'Jadwalkan Home Visit',
    data.dueDate ? new Date(data.dueDate) : null,
    'Menunggu Penjadwalan',
    data.catatan || ''
  ]);

  const sqlSp = "UPDATE siswa_periode SET status_terkini = ?, next_action = ?, status_updated_date = ?, last_updated = ? WHERE id_siswa = ? AND marketing_period = ?";
  await pool.query(sqlSp, ['Home Visit', 'Home Visit', now, now, idSiswa, mp]);

  return { success: true, message: 'Home Visit berhasil dibuat.' };
}

async function addAktivitasHomeVisit(data, user) {
  const mapping = HASIL_AKTIVITAS_HOME_VISIT[data.hasil];
  if (!mapping) throw new Error('Hasil aktivitas tidak valid.');
  
  const mp = await getActiveMarketingPeriod();
  const now = new Date();

  const setClauses = [];
  const params = [];
  
  setClauses.push("hasil_hv = ?"); params.push(data.hasil);
  setClauses.push("status_terkini = ?"); params.push(mapping.status);
  setClauses.push("next_action = ?"); params.push(mapping.nextAction);
  
  if (data.alasan) { setClauses.push("alasan_tidak_lanjut = ?"); params.push(data.alasan); }
  if (data.sikapOrtu) { setClauses.push("sikap_orangtua = ?"); params.push(data.sikapOrtu); }
  if (data.dueDate) { setClauses.push("due_date = ?"); params.push(new Date(data.dueDate)); }
  if (data.statusJadwal) { setClauses.push("status_jadwal = ?"); params.push(data.statusJadwal); }
  if (data.catatan) { setClauses.push("catatan = ?"); params.push(data.catatan); }
  
  params.push(data.idSiswa + '-%', mp);
  const sql = "UPDATE home_visit SET " + setClauses.join(', ') + " WHERE id_siswa_nama LIKE ? AND marketing_period = ?";
  await pool.query(sql, params);

  if (data.idSiswa) {
    let siswaMapping = null;
    if (data.hasil === 'Home Visit Berhasil') {
      siswaMapping = { status: 'Siap Daftar', nextAction: 'Pendaftaran' };
    } else if (data.hasil === 'Ditolak Orang Tua') {
      siswaMapping = { status: 'Tidak Lanjut', nextAction: 'Tidak Ada' };
    }
    
    if (siswaMapping) {
      const spSet = ["status_terkini = ?", "next_action = ?", "status_updated_date = ?", "last_updated = ?"];
      const spParams = [siswaMapping.status, siswaMapping.nextAction, now, now];
      
      if (data.alasan) {
        spSet.push("alasan_tidak_lanjut = ?");
        spParams.push(data.alasan);
      }
      
      spParams.push(data.idSiswa, mp);
      await pool.query("UPDATE siswa_periode SET " + spSet.join(', ') + " WHERE id_siswa = ? AND marketing_period = ?", spParams);
    }
  }
  
  return { success: true, message: 'Aktivitas Home Visit berhasil disimpan.' };
}

// ==========================================
// BROADCAST
// ==========================================

async function getBroadcastSekolahList(user) {
  const mp = await getActiveMarketingPeriod();
  const sql = "SELECT sp.id_sekolah, ms.nama_sekolah FROM sekolah_periode sp JOIN master_sekolah ms ON sp.id_sekolah = ms.id_sekolah WHERE sp.marketing_period = ? AND sp.status_terkini = 'Sudah Sosialisasi'";
  const [rows] = await pool.query(sql, [mp]);
  
  let result = rows.map(r => ({
    id: String(r.id_sekolah || '').trim(),
    nama: String(r.nama_sekolah || '')
  }));
  result.sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
  
  return { success: true, sekolahList: result };
}

async function getBroadcastHistory(user) {
  const [rows] = await pool.query("SELECT * FROM broadcast ORDER BY created_at DESC");
  
  const formatDateId = (d) => {
    if (!d) return '';
    const dt = new Date(d);
    return ('0' + dt.getDate()).slice(-2) + '/' + ('0' + (dt.getMonth()+1)).slice(-2) + '/' + dt.getFullYear();
  };

  const history = rows.map(r => {
    let sekolahIds = [];
    try { sekolahIds = JSON.parse(r.sekolah_ids || '[]'); } catch (e) {}
    
    return {
      id:              String(r.id_broadcast),
      marketingPeriod: String(r.marketing_period || ''),
      sekolahIds:      sekolahIds,
      statusPipeline:  String(r.status_pipeline || ''),
      templateId:      String(r.template_id || ''),
      templateNameApi: String(r.template_name_api || ''),
      templateName:    String(r.template_display_name || ''),
      totalTarget:     Number(r.total_target || 0),
      totalSuccess:    Number(r.total_success || 0),
      totalFailed:     Number(r.total_failed || 0),
      totalPending:    Number(r.total_pending || 0),
      status:          String(r.status || ''),
      createdBy:       String(r.created_by || ''),
      createdAt:       r.created_at ? formatDateId(r.created_at) : '',
      completedAt:     r.completed_at ? formatDateId(r.completed_at) : ''
    };
  });
  
  return { success: true, history };
}

async function checkTemplateHistory(templateNameApi, listIdSiswa, user) {
  if (!templateNameApi || !listIdSiswa || listIdSiswa.length === 0) {
    return { success: true, duplicates: [] };
  }
  
  const placeholders = listIdSiswa.map(() => '?').join(',');
  const params = [templateNameApi, ...listIdSiswa];
  const sql = `SELECT id_siswa, nama_siswa, wa_number, MAX(COALESCE(processed_at, created_at)) AS last_sent 
               FROM broadcast_queue 
               WHERE template_name_api = ? AND id_siswa IN (${placeholders}) 
               AND status IN ('Success', 'Pending', 'Processing') 
               GROUP BY id_siswa, nama_siswa, wa_number`;
               
  const [rows] = await pool.query(sql, params);
  
  const formatDateId = (d) => {
    if (!d) return '';
    const dt = new Date(d);
    return ('0' + dt.getDate()).slice(-2) + '/' + ('0' + (dt.getMonth()+1)).slice(-2) + '/' + dt.getFullYear();
  };

  const duplicates = rows.map(r => ({
    idSiswa: String(r.id_siswa),
    namaSiswa: String(r.nama_siswa),
    waNumber: String(r.wa_number),
    lastSentDate: r.last_sent ? formatDateId(r.last_sent) : ''
  }));

  return { success: true, duplicates };
}

function isValidWA(wa) {
  if (!wa) return false;
  const cleaned = String(wa).replace(/[^0-9]/g, '');
  return cleaned.length >= 10 && cleaned.substring(0, 2) === '62';
}

function parseSekolahIds(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(id => id && String(id).trim()).map(id => String(id).trim());
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter(id => id && String(id).trim()).map(id => String(id).trim());
    } catch (e) {
      const trimmed = raw.trim();
      return trimmed ? [trimmed] : [];
    }
  }
  return [];
}

async function getTargetSiswa(marketingPeriod, sekolahIds, statusPipeline) {
  if (!sekolahIds || sekolahIds.length === 0) return [];
  const placeholders = sekolahIds.map(() => '?').join(',');
  const params = [marketingPeriod, ...sekolahIds];
  let sql = `SELECT ms.id_siswa, ms.nama_lengkap, ms.wa, ms.id_sekolah 
             FROM master_siswa ms 
             JOIN siswa_periode sp ON ms.id_siswa = sp.id_siswa 
             WHERE sp.marketing_period = ? AND ms.id_sekolah IN (${placeholders})`;
  
  if (statusPipeline && statusPipeline.toUpperCase() !== 'ALL') {
    sql += " AND sp.status_terkini = ?";
    params.push(statusPipeline);
  }
  
  const [rows] = await pool.query(sql, params);
  return rows.map(r => ({
    idSiswa:   String(r.id_siswa || ''),
    namaSiswa: String(r.nama_lengkap || ''),
    idSekolah: String(r.id_sekolah || ''),
    waNumber:  String(r.wa || '').replace(/[^0-9]/g, '')
  }));
}

async function getBroadcastTargetPreview(filter, user) {
  const mp = filter.marketingPeriod || await getActiveMarketingPeriod();
  const sekolahIds = parseSekolahIds(filter.sekolahIds);
  const statusPipeline = filter.statusPipeline || '';
  const templateNameApi = filter.templateNameApi || '';

  if (sekolahIds.length === 0) throw new Error('Pilih minimal satu sekolah.');
  if (!statusPipeline) throw new Error('Pilih status pipeline.');

  const targetList = await getTargetSiswa(mp, sekolahIds, statusPipeline);
  
  let duplicateSet = {};
  if (templateNameApi && targetList.length > 0) {
    const allIds = targetList.map(t => t.idSiswa);
    const placeholders = allIds.map(() => '?').join(',');
    const [dupRows] = await pool.query(
      `SELECT DISTINCT id_siswa FROM broadcast_queue WHERE template_name_api = ? AND id_siswa IN (${placeholders}) AND status = 'Success'`,
      [templateNameApi, ...allIds]
    );
    dupRows.forEach(r => { duplicateSet[String(r.id_siswa)] = true; });
  }

  let nomorTidakValid = 0;
  let sudahDikirim = 0;
  let siapDikirim = 0;
  let previewList = [];

  for (let i = 0; i < targetList.length; i++) {
    const t = targetList[i];
    const waValid = isValidWA(t.waNumber);
    const duplicate = templateNameApi && duplicateSet[String(t.idSiswa)];

    let rowStatus = '';
    if (!waValid) {
      nomorTidakValid++;
      rowStatus = 'nomor_invalid';
    } else if (duplicate) {
      sudahDikirim++;
      rowStatus = 'sudah_dikirim';
    } else {
      siapDikirim++;
      rowStatus = 'siap';
    }

    previewList.push({
      idSiswa:   t.idSiswa,
      namaSiswa: t.namaSiswa,
      idSekolah: t.idSekolah,
      waNumber:  t.waNumber || '-',
      status:    rowStatus
    });
  }

  return {
    success: true,
    totalTarget: targetList.length,
    siapDikirim,
    sudahDikirim,
    nomorTidakValid,
    preview: previewList
  };
}

async function createBroadcast(params, user) {
  const mp = await getActiveMarketingPeriod();
  const sekolahIds = parseSekolahIds(params.sekolahIds);
  const statusPipeline = params.statusPipeline || '';
  const templateId = params.templateId || '';
  const templateNameApi = params.templateNameApi || '';
  const templateDisplayName = params.templateDisplayName || templateNameApi;
  const languageCode = params.languageCode || 'id';

  if (!sekolahIds.length) throw new Error('Pilih minimal satu sekolah.');
  if (!statusPipeline) throw new Error('Pilih status pipeline.');
  if (!templateNameApi) throw new Error('Pilih template.');

  const [tplRows] = await pool.query(
    "SELECT * FROM wa_templates WHERE " + (templateId ? "id_template = ?" : "template_name_api = ?"),
    [templateId || templateNameApi]
  );
  if (tplRows.length === 0) throw new Error('Template tidak ditemukan di Library Template CRM.');
  const tpl = tplRows[0];
  if (tpl.status_crm !== 'Aktif' && tpl.status_crm !== 'Active' && tpl.status_crm !== 'AKTIF' && tpl.status_crm !== 'ACTIVE') {
    throw new Error(`Template "${tpl.nama_template}" memiliki status CRM tidak aktif (${tpl.status_crm}).`);
  }
  if (tpl.meta_status !== 'APPROVED') {
    throw new Error(`Template "${tpl.nama_template}" belum disetujui oleh Meta (Status Meta: ${tpl.meta_status}).`);
  }

  const excludedIds = params.excludedIds || [];
  let targetList = await getTargetSiswa(mp, sekolahIds, statusPipeline);
  
  if (excludedIds.length > 0) {
    targetList = targetList.filter(s => !excludedIds.includes(String(s.idSiswa).trim()));
  }

  if (targetList.length === 0) {
    throw new Error('Tidak ada siswa yang cocok dengan filter atau semua siswa dikecualikan.');
  }

  let duplicateSet = {};
  const allIds = targetList.map(t => t.idSiswa);
  const placeholders = allIds.map(() => '?').join(',');
  const [dupRows] = await pool.query(
    `SELECT DISTINCT id_siswa FROM broadcast_queue WHERE template_name_api = ? AND id_siswa IN (${placeholders}) AND status = 'Success'`,
    [templateNameApi, ...allIds]
  );
  dupRows.forEach(r => { duplicateSet[String(r.id_siswa)] = true; });

  const broadcastId = 'BC-' + Date.now() + '-' + Math.floor(Math.random() * 100);
  const now = new Date();

  let queueRows = [];
  let totalSkipped = 0;
  let qIdx = 0;

  for (let i = 0; i < targetList.length; i++) {
    const t = targetList[i];
    if (!isValidWA(t.waNumber)) { totalSkipped++; continue; }
    if (duplicateSet[String(t.idSiswa)]) { totalSkipped++; continue; }

    qIdx++;
    queueRows.push([
      'BQ-' + now.getTime() + '-' + qIdx,
      broadcastId,
      t.idSiswa,
      t.namaSiswa,
      t.waNumber,
      templateNameApi,
      languageCode,
      'Pending',
      '',
      '',
      now,
      null
    ]);
  }

  const totalQueued = queueRows.length;
  if (totalQueued === 0) {
    throw new Error('Semua siswa sudah pernah menerima template ini atau nomor tidak valid. Tidak ada yang perlu dikirim.');
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query(
      "INSERT INTO broadcast (id_broadcast, marketing_period, sekolah_ids, status_pipeline, template_id, template_name_api, template_display_name, total_target, total_success, total_failed, total_pending, status, created_by, created_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        broadcastId, mp, JSON.stringify(sekolahIds), statusPipeline,
        templateId, templateNameApi, templateDisplayName,
        totalQueued, 0, 0, totalQueued, 'Queued', user.nama || user.username || 'CRM',
        now, null
      ]
    );

    if (queueRows.length > 0) {
      await connection.query(
        "INSERT INTO broadcast_queue (id_queue, id_broadcast, id_siswa, nama_siswa, wa_number, template_name_api, language_code, status, error_message, wa_message_id, created_at, processed_at) VALUES ?",
        [queueRows]
      );
    }

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }

  return {
    success: true,
    broadcastId,
    totalQueued,
    totalSkipped,
    message: `Broadcast berhasil dibuat. ${totalQueued} pesan masuk antrian.`
  };
}

async function getBroadcastProgress(broadcastId, user) {
  const [rows] = await pool.query(
    "SELECT SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) AS pending, SUM(CASE WHEN status = 'Processing' THEN 1 ELSE 0 END) AS processing, SUM(CASE WHEN status = 'Success' THEN 1 ELSE 0 END) AS success, SUM(CASE WHEN status = 'Failed' THEN 1 ELSE 0 END) AS failed FROM broadcast_queue WHERE id_broadcast = ?",
    [broadcastId]
  );
  
  let pending = 0, processing = 0, successCount = 0, failed = 0;
  if (rows.length > 0) {
    pending = Number(rows[0].pending) || 0;
    processing = Number(rows[0].processing) || 0;
    successCount = Number(rows[0].success) || 0;
    failed = Number(rows[0].failed) || 0;
  }
  
  const total = pending + processing + successCount + failed;
  const done = successCount + failed;
  const percentDone = total > 0 ? Math.round((done / total) * 100) : 0;
  
  let bcStatus = 'Processing';
  const [bcRows] = await pool.query("SELECT status FROM broadcast WHERE id_broadcast = ?", [broadcastId]);
  if (bcRows.length > 0) {
    bcStatus = String(bcRows[0].status || 'Processing');
  }

  return {
    success: true,
    broadcastId,
    total,
    pending,
    processing,
    successCount,
    failed,
    status: bcStatus,
    percentDone
  };
}

// ==========================================
// NURTURING
// ==========================================

async function getNurturingDashboardData(period, user) {
  const activePeriod = period || await getActiveMarketingPeriod();
  let params = [activePeriod, 'Calon Prospek'];
  let sql = `SELECT ms.id_siswa, ms.nama_lengkap, ms.wa, sek.nama_sekolah, sp.cro, sp.catatan, sp.next_action 
             FROM siswa_periode sp 
             LEFT JOIN master_siswa ms ON sp.id_siswa = ms.id_siswa 
             LEFT JOIN master_sekolah sek ON ms.id_sekolah = sek.id_sekolah 
             WHERE sp.marketing_period = ? AND sp.status_terkini = ?`;
             
  if (user.role === 'CRO') {
    sql += " AND sp.cro = ?";
    params.push(user.nama || user.username);
  }
  
  const [listSiswa] = await pool.query(sql, params);
  
  let summary = {
    total: listSiswa.length,
    probe0: 0, probe1: 0, probe2: 0, probe3: 0, probe4: 0, probe5: 0,
    probeLevel2: 0, probe6: 0, probe7: 0, probe8: 0, probe9: 0, probe10: 0, probe11: 0,
    probeDone: 0, needFollowUp: 0
  };
  
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let dataSiswa = [];
  const probeRegex = /\[PROBE:(\d+)\|(\d{4}-\d{2}-\d{2})\]/;
  
  const formatDateStr = (dt) => {
    return dt.getFullYear() + '-' + ('0' + (dt.getMonth()+1)).slice(-2) + '-' + ('0' + dt.getDate()).slice(-2);
  };
  
  for (let i = 0; i < listSiswa.length; i++) {
    const siswa = listSiswa[i];
    const catatan = siswa.catatan || '';
    
    let currentLevel = 0;
    let lastDateStr = '-';
    let nextDateStr = 'Hari ini (21:00)';
    let daysUntilNext = 0;
    
    const match = catatan.match(probeRegex);
    if (match) {
      currentLevel = parseInt(match[1], 10);
      lastDateStr = match[2];
      
      const lastParts = match[2].split('-');
      const lastDate = new Date(lastParts[0], parseInt(lastParts[1])-1, lastParts[2]);
      
      const interval = currentLevel >= 6 ? 30 : 7;
      const daysDiff = Math.floor((todayMidnight - lastDate) / (1000 * 60 * 60 * 24));
      daysUntilNext = interval - daysDiff;
      if (daysUntilNext < 0) daysUntilNext = 0;
      
      if (currentLevel < 12) {
        let nextDateObj = new Date(lastDate);
        nextDateObj.setDate(nextDateObj.getDate() + interval);
        nextDateStr = formatDateStr(nextDateObj) + ' (21:00)';
      } else {
        nextDateStr = 'Selesai (Tidak Lanjut)';
      }
    }
    
    if (currentLevel === 0) summary.probe0++;
    else if (currentLevel === 1) summary.probe1++;
    else if (currentLevel === 2) summary.probe2++;
    else if (currentLevel === 3) summary.probe3++;
    else if (currentLevel === 4) summary.probe4++;
    else if (currentLevel === 5) summary.probe5++;
    else if (currentLevel === 6)  { summary.probeLevel2++; summary.probe6++;  }
    else if (currentLevel === 7)  { summary.probeLevel2++; summary.probe7++;  }
    else if (currentLevel === 8)  { summary.probeLevel2++; summary.probe8++;  }
    else if (currentLevel === 9)  { summary.probeLevel2++; summary.probe9++;  }
    else if (currentLevel === 10) { summary.probeLevel2++; summary.probe10++; }
    else if (currentLevel === 11) { summary.probeLevel2++; summary.probe11++; }
    else if (currentLevel >= 12) summary.probeDone++;
    
    dataSiswa.push({
      id: siswa.id_siswa,
      nama: siswa.nama_lengkap,
      sekolah: siswa.nama_sekolah,
      wa: siswa.wa,
      cro: siswa.cro,
      currentProbe: currentLevel,
      lastSentDate: lastDateStr,
      nextSendDate: nextDateStr,
      daysUntilNext: currentLevel < 12 ? daysUntilNext : -1,
      nextAction: siswa.next_action
    });
  }
  
  dataSiswa.sort((a, b) => {
    if (a.currentProbe !== b.currentProbe) return b.currentProbe - a.currentProbe;
    return a.daysUntilNext - b.daysUntilNext;
  });
  
  return { success: true, summary, list: dataSiswa };
}

async function getSnoozeDashboardData(period, user) {
  const activePeriod = period || await getActiveMarketingPeriod();
  let params = [activePeriod];
  
  let sql = `SELECT ms.id_siswa as id, ms.nama_lengkap as nama, sek.nama_sekolah as namaSekolah, ms.wa, sp.cro, sp.catatan, sp.next_action as nextAction, sp.status_terkini as status, sp.alasan_tidak_lanjut as alasan, sp.due_date 
             FROM siswa_periode sp 
             LEFT JOIN master_siswa ms ON sp.id_siswa = ms.id_siswa 
             LEFT JOIN master_sekolah sek ON ms.id_sekolah = sek.id_sekolah 
             WHERE sp.marketing_period = ? 
             AND (
               (sp.status_terkini = 'Calon Prospek' AND sp.catatan LIKE '%Siswa keluar dari alur snooze:%') 
               OR (sp.status_terkini = 'Tidak Lanjut' AND (sp.alasan_tidak_lanjut LIKE '%Snooze%' OR sp.alasan_tidak_lanjut LIKE '%Opt-Out%')) 
               OR (sp.status_terkini = 'Data Masuk' AND sp.next_action = 'Follow Up' AND sp.catatan LIKE '%[SNOOZE:%')
             )`;
             
  if (user.role === 'CRO') {
    sql += " AND sp.cro = ?";
    params.push(user.nama || user.username);
  }
  
  const [listSiswa] = await pool.query(sql, params);
  
  let summary = {
    total: 0, snooze1: 0, snooze2: 0, snooze3: 0, reactivated: 0, optOut: 0
  };
  
  let dataSiswa = [];
  const snoozeRegex = /\[SNOOZE:(\d+)(?:\|(?:SENT:)?(\d{4}-\d{2}-\d{2}))?\]/;
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const formatDateStr = (dt) => {
    return dt.getFullYear() + '-' + ('0' + (dt.getMonth()+1)).slice(-2) + '-' + ('0' + dt.getDate()).slice(-2);
  };
  
  for (let i = 0; i < listSiswa.length; i++) {
    const siswa = listSiswa[i];
    const status = siswa.status || '';
    const catatan = siswa.catatan || '';
    const alasan = siswa.alasan || '';

    if (status === 'Calon Prospek' && catatan.indexOf('Siswa keluar dari alur snooze:') > -1) {
      summary.reactivated++;
      dataSiswa.push({
        id: siswa.id, nama: siswa.nama, sekolah: siswa.namaSekolah, wa: siswa.wa, cro: siswa.cro,
        currentSnooze: 99, lastSentDate: '-', nextSendDate: 'Reactivated (Obrolan CRO)',
        daysUntilNext: -1, status: status, alasan: 'Siswa berminat kembali'
      });
      continue;
    }

    if (status === 'Tidak Lanjut' && (alasan.indexOf('Snooze') > -1 || alasan.indexOf('Opt-Out') > -1)) {
      summary.optOut++;
      const match = catatan.match(snoozeRegex) || catatan.match(/\[SNOOZE:(\d+)\]/);
      const currentLevel = match ? parseInt(match[1], 10) : 3;
      dataSiswa.push({
        id: siswa.id, nama: siswa.nama, sekolah: siswa.namaSekolah, wa: siswa.wa, cro: siswa.cro,
        currentSnooze: currentLevel, lastSentDate: '-', 
        nextSendDate: 'Selesai (' + (alasan.indexOf('Opt-Out') > -1 ? 'Opt-Out' : 'Tidak Respon') + ')',
        daysUntilNext: -1, status: status, alasan: alasan
      });
      continue;
    }

    if (status === 'Data Masuk' && siswa.nextAction === 'Follow Up') {
      const match = catatan.match(snoozeRegex);
      if (match) {
        summary.total++;
        const currentLevel = parseInt(match[1], 10);
        const dateStr = match[2];
        const isSent = catatan.indexOf('SENT:') > -1;

        if (currentLevel === 0 || currentLevel === 1) summary.snooze1++;
        else if (currentLevel === 2) summary.snooze2++;
        else if (currentLevel === 3) summary.snooze3++;

        let lastSent = '-';
        let nextSend = '-';
        let daysUntilNext = -1;

        if (isSent && dateStr) {
          lastSent = dateStr;
          const parts = dateStr.split('-');
          const sentDate = new Date(parts[0], parseInt(parts[1])-1, parts[2]);
          const daysDiff = Math.floor((todayMidnight - sentDate) / (1000 * 60 * 60 * 24));
          daysUntilNext = 7 - daysDiff;
          if (daysUntilNext < 0) daysUntilNext = 0;

          let nextDateObj = new Date(sentDate);
          nextDateObj.setDate(nextDateObj.getDate() + 7);
          nextSend = formatDateStr(nextDateObj) + ' (Batas H+7)';
        } else {
          const dueDateVal = siswa.due_date;
          if (dueDateVal) {
            const dueDateObj = new Date(dueDateVal);
            if (!isNaN(dueDateObj.getTime())) {
              const dueMidnight = new Date(dueDateObj.getFullYear(), dueDateObj.getMonth(), dueDateObj.getDate());
              daysUntilNext = Math.floor((dueMidnight - todayMidnight) / (1000 * 60 * 60 * 24));
              if (daysUntilNext < 0) daysUntilNext = 0;
              nextSend = formatDateStr(dueDateObj) + ' (21:00)';
            }
          }
        }

        dataSiswa.push({
          id: siswa.id, nama: siswa.nama, sekolah: siswa.namaSekolah, wa: siswa.wa, cro: siswa.cro,
          currentSnooze: currentLevel, lastSentDate: lastSent, nextSendDate: nextSend,
          daysUntilNext: daysUntilNext, status: status, isSent: isSent
        });
      }
    }
  }

  return { success: true, summary, list: dataSiswa };
}

// ==========================================
// MASTER DATA (SISWA & SEKOLAH CRUD)
// ==========================================

const HASIL_AKTIVITAS_SISWA = {
  'Screening Belum Berhasil':  { status: 'Data Masuk',       nextAction: 'Screening' },
  'Screening Dihentikan':      { status: 'Tidak Lanjut',     nextAction: 'Tidak Ada' },
  'Probing on Progress':       { status: 'Calon Prospek',    nextAction: 'Probing' },
  'Prospek Aktif':             { status: 'Prospek Aktif',    nextAction: 'Konsultasi' },
  'Konsultasi Dijadwalkan':    { status: 'Konsultasi',       nextAction: 'Konsultasi' },
  'Layak Home Visit':          { status: 'Layak Home Visit', nextAction: 'Home Visit' },
  'Home Visit Selesai':        { status: 'Home Visit',       nextAction: 'Follow Up' },
  'Siap Daftar':               { status: 'Siap Daftar',      nextAction: 'Pendaftaran' },
  'Berhasil Daftar':           { status: 'Terdaftar',        nextAction: 'Tidak Ada' },
  'Ditunda':                   { status: 'Prospek Aktif',    nextAction: 'Follow Up' },
  'Tidak Berminat':            { status: 'Tidak Lanjut',     nextAction: 'Tidak Ada' },
  'Tidak Memenuhi Syarat':     { status: 'Tidak Lanjut',     nextAction: 'Tidak Ada' }
};

const HASIL_AKTIVITAS_SEKOLAH = {
  'Belum Bertemu PIC':             { status: 'Tunggu Visit Ulang',        nextAction: 'Visit Ulang' },
  'Diminta Visit Ulang':           { status: 'Tunggu Visit Ulang',        nextAction: 'Visit Ulang' },
  'Menunggu Keputusan':            { status: 'Tunggu Keputusan',          nextAction: 'Follow Up' },
  'Diminta Meeting':               { status: 'Tunggu Keputusan',          nextAction: 'Meeting PIC' },
  'Izin Sosialisasi':              { status: 'Tunggu Jadwal Sosialisasi', nextAction: 'Jadwalkan Sosialisasi' },
  'Jadwal Sosialisasi Disepakati': { status: 'Sosialisasi Terjadwal',     nextAction: 'Laksanakan Sosialisasi' },
  'Jadwal Sosialisasi Ditunda':    { status: 'Tunggu Jadwal Sosialisasi', nextAction: 'Jadwalkan Sosialisasi' },
  'Sosialisasi Selesai':           { status: 'Sudah Sosialisasi',         nextAction: 'Input Data Siswa' },
  'Input Data Siswa Selesai':      { status: 'Sudah Sosialisasi',         nextAction: 'Tidak Ada' },
  'Ditolak Final':                 { status: 'Tidak Bisa Sosialisasi',    nextAction: 'Tidak Ada' },
  'Tutup / Merger':                { status: 'Nonaktif / Tutup / Merger', nextAction: 'Tidak Ada' }
};

function calculatePriority(minatAwal, rencanaLulus) {
  let minat = (minatAwal || '').toUpperCase();
  let rencana = (rencanaLulus || '').toUpperCase();
  if (minat === 'KERJA' && rencana === 'KERJA') return 'A';
  if (minat === 'KERJA' || rencana === 'KERJA') return 'B';
  return 'C';
}

function cleanPhoneNumber(phone) {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) cleaned = '62' + cleaned.substring(1);
  return cleaned;
}

function toSentenceCase(str) {
  if (!str) return '';
  str = String(str);
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

async function addSiswa(data, user) {
  if (!data.nama || !data.idSekolah) throw new Error('Nama dan Sekolah wajib diisi.');

  const now = new Date();
  const activePeriod = await getActiveMarketingPeriod();
  const prioritas = calculatePriority(data.minatAwal, data.rencanaLulus);
  const cro = (user.role === 'CRO') ? user.nama || user.username : (data.cro || user.nama || user.username);
  
  let dueDateObj = new Date(now);
  dueDateObj.setDate(dueDateObj.getDate() + 1); // Tomorrow
  if (data.dueDate) {
    dueDateObj = new Date(data.dueDate);
  }

  const newId = await generateId('STD', 'master_siswa', 'id_siswa');
  const sqlMaster = "INSERT INTO master_siswa (id_siswa, nama_lengkap, id_sekolah, kelas, wa, email, alamat, minat_awal, rencana_lulus, orangtua_tahu, opt_in_wa, created_date, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
  await pool.query(sqlMaster, [
    newId, toSentenceCase(data.nama), data.idSekolah, data.kelas || '', cleanPhoneNumber(data.wa || ''), data.email || '',
    toSentenceCase(data.alamat || ''), data.minatAwal || '', data.rencanaLulus || '', data.orangtuaTahu || '',
    'Belum', now, now
  ]);

  const recId = await generateId('SWP', 'siswa_periode', 'id_record');
  const sqlPeriode = "INSERT INTO siswa_periode (id_record, marketing_period, id_siswa, nama_siswa, cro, prioritas, status_terkini, next_action, due_date, status_updated_date, status_jadwal, alasan_tidak_lanjut, catatan, created_date, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
  await pool.query(sqlPeriode, [
    recId, activePeriod, newId, toSentenceCase(data.nama), cro, prioritas, 'Data Masuk', 'Screening',
    data.dueDate ? dueDateObj : null, now, data.dueDate ? 'Terjadwal' : 'Menunggu Penjadwalan', '', data.catatan || '', now, now
  ]);

  return { success: true, message: 'Siswa berhasil ditambahkan. Prioritas: ' + prioritas, id: newId };
}

async function updateSiswa(id, data, user) {
  if (!id || !data.nama || !data.idSekolah) throw new Error('ID, Nama, dan Sekolah wajib diisi.');
  
  const now = new Date();
  const prioritas = calculatePriority(data.minatAwal, data.rencanaLulus);
  const activePeriod = await getActiveMarketingPeriod();
  
  // Update master_siswa
  const sqlMaster = `
    UPDATE master_siswa 
    SET nama_lengkap = ?, id_sekolah = ?, kelas = ?, wa = ?, email = ?, 
        alamat = ?, minat_awal = ?, rencana_lulus = ?, orangtua_tahu = ?, last_updated = ?
    WHERE id_siswa = ?
  `;
  await pool.query(sqlMaster, [
    toSentenceCase(data.nama), data.idSekolah, data.kelas || '', cleanPhoneNumber(data.wa || ''), data.email || '',
    toSentenceCase(data.alamat || ''), data.minatAwal || '', data.rencanaLulus || '', data.orangtuaTahu || '',
    now, id
  ]);

  // Update siswa_periode (only if dueDate/catatan/etc are provided, or just update the active one)
  // we can just update the basic fields
  let dueDateObj = null;
  if (data.dueDate) {
    dueDateObj = new Date(data.dueDate);
  }
  
  const sqlPeriode = `
    UPDATE siswa_periode 
    SET nama_siswa = ?, prioritas = ?, due_date = COALESCE(?, due_date), catatan = ?, last_updated = ?
    WHERE id_siswa = ? AND marketing_period = ?
  `;
  await pool.query(sqlPeriode, [
    toSentenceCase(data.nama), prioritas, dueDateObj, data.catatan || '', now,
    id, activePeriod
  ]);

  return { success: true, message: 'Siswa berhasil diupdate.' };
}

async function addSiswaBatch(batchData, user) {
  const idSekolah = batchData.idSekolah;
  const students = batchData.students;
  if (!idSekolah || !students || students.length === 0) throw new Error('Data input tidak lengkap.');

  const now = new Date();
  const activePeriod = await getActiveMarketingPeriod();
  const cro = (user.role === 'CRO') ? user.nama || user.username : (batchData.cro || user.nama || user.username);
  let tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  let [resStd] = await pool.query("SELECT id_siswa FROM master_siswa WHERE id_siswa LIKE 'STD-%'");
  let maxStdId = 0;
  resStd.forEach(r => {
    let n = parseInt(r.id_siswa.replace('STD-', ''), 10);
    if (!isNaN(n) && n > maxStdId) maxStdId = n;
  });

  let [resSwp] = await pool.query("SELECT id_record FROM siswa_periode WHERE id_record LIKE 'SWP-%'");
  let maxSwpId = 0;
  resSwp.forEach(r => {
    let n = parseInt(r.id_record.replace('SWP-', ''), 10);
    if (!isNaN(n) && n > maxSwpId) maxSwpId = n;
  });

  let validStudents = 0;
  for (let std of students) {
    if (!std.nama) continue;
    validStudents++;
    
    let newStdIdNum = maxStdId + validStudents;
    let newSwpIdNum = maxSwpId + validStudents;
    
    let newStdId = 'STD-' + String(newStdIdNum).padStart(6, '0');
    let newSwpId = 'SWP-' + String(newSwpIdNum).padStart(6, '0');
    let prioritas = calculatePriority(std.minatAwal, std.rencanaLulus);

    let sqlMaster = "INSERT INTO master_siswa (id_siswa, nama_lengkap, id_sekolah, kelas, wa, email, alamat, minat_awal, rencana_lulus, orangtua_tahu, opt_in_wa, created_date, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    await pool.query(sqlMaster, [
      newStdId, toSentenceCase(std.nama), idSekolah, std.kelas || '', cleanPhoneNumber(std.wa || ''), std.email || '',
      toSentenceCase(std.alamat || ''), std.minatAwal || '', std.rencanaLulus || '', std.orangtuaTahu || '',
      'Belum', now, now
    ]);

    let sqlPeriode = "INSERT INTO siswa_periode (id_record, marketing_period, id_siswa, nama_siswa, cro, prioritas, status_terkini, next_action, due_date, status_updated_date, status_jadwal, alasan_tidak_lanjut, catatan, created_date, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    await pool.query(sqlPeriode, [
      newSwpId, activePeriod, newStdId, toSentenceCase(std.nama), cro, prioritas, 'Data Masuk', 'Screening',
      tomorrow, now, 'Terjadwal', '', std.catatan || '', now, now
    ]);
  }

  if (validStudents === 0) throw new Error('Tidak ada data siswa valid yang diimpor.');

  if (batchData.completeSchoolTask) {
    const schoolObj = await getSekolahById(idSekolah, activePeriod, user);
    if (schoolObj && schoolObj.success && schoolObj.data) {
      const sData = schoolObj.data;
      const idNama = idSekolah + '-' + sData.nama;
      const actData = {
        idSekolah: idSekolah,
        idSekolahNama: idNama,
        tanggal: now,
        aktivitas: 'Input Data Siswa',
        sekolahAktif: sData.sekolahAktif || 'Aktif',
        jumlahSiswa: sData.jumlahSiswa ? Number(sData.jumlahSiswa) : validStudents,
        hasil: 'Input Data Siswa Selesai',
        pic: sData.picUtama || '',
        waPic: sData.waPic || '',
        jabatanPic: '',
        dueDate: '',
        catatan: 'Input data siswa secara massal (' + validStudents + ' siswa) berhasil diinput.'
      };
      await addAktivitasSekolah(actData, user);
    }
  }

  return { success: true, message: 'Berhasil mengimpor ' + validStudents + ' data siswa.', count: validStudents };
}

async function getSiswaByPhone(phone, user) {
  let cleaned = cleanPhoneNumber(phone);
  if (!cleaned) return { success: false, message: 'Nomor telepon kosong' };
  const mp = await getActiveMarketingPeriod();
  
  const sql = `SELECT ms.id_siswa, ms.nama_lengkap, ms.wa, sp.status_terkini, sp.cro, sp.catatan, sp.next_action, sp.marketing_period 
               FROM master_siswa ms 
               JOIN siswa_periode sp ON ms.id_siswa = sp.id_siswa 
               WHERE ms.wa LIKE ? 
               ORDER BY sp.last_updated DESC LIMIT 1`;
  const [rows] = await pool.query(sql, [`%${cleaned}`]);
  if (rows.length === 0) {
    return { success: false, message: 'Siswa tidak ditemukan' };
  }
  return { success: true, siswa: rows[0] };
}

async function updateLastAktivitasSiswa(data, user) {
  const marketingPeriod = await getActiveMarketingPeriod();
  const now = new Date();
  
  let sqlUpdate = "UPDATE aktivitas_siswa SET catatan = ? WHERE timestamp = ? AND id_siswa_nama LIKE ?";
  let params = [data.catatan, data.timestamp, `%${data.idSiswa}%`];
  await pool.query(sqlUpdate, params);

  // Jika perlu merambat ke siswa_periode (catatan disync)
  let syncSql = "UPDATE siswa_periode SET catatan = ?, last_updated = ? WHERE id_siswa = ? AND marketing_period = ?";
  await pool.query(syncSql, [data.catatan, now, data.idSiswa, marketingPeriod]);
  
  return { success: true, message: 'Aktivitas berhasil diupdate' };
}

async function addAktivitasSiswa(data, user) {
  const marketingPeriod = await getActiveMarketingPeriod();
  const now = new Date();
  
  const HASIL_REVIVE_TERLINDUNGI = ['Probing on Progress', 'Prospek Aktif'];
  if (user.role === 'CRO' && HASIL_REVIVE_TERLINDUNGI.includes(data.hasil)) {
    if (data.idSiswa) {
      const [rowStatus] = await pool.query("SELECT status_terkini FROM siswa_periode WHERE id_siswa = ? AND marketing_period = ? LIMIT 1", [data.idSiswa, marketingPeriod]);
      if (rowStatus.length > 0 && rowStatus[0].status_terkini === 'Tidak Lanjut') {
        throw new Error('Hanya Admin/Manager yang dapat me-revive siswa dari status Tidak Lanjut.');
      }
    }
  }

  const mapping = HASIL_AKTIVITAS_SISWA[data.hasil];
  if (!mapping) throw new Error('Hasil aktivitas tidak valid: ' + data.hasil);

  let newStatusJadwal = 'Menunggu Penjadwalan';
  if (mapping.nextAction === 'Tidak Ada') {
    newStatusJadwal = 'Tidak ada jadwal';
    data.dueDate = '';
  } else if (data.dueDate) {
    newStatusJadwal = 'Terjadwal';
  }

  const tgl = data.tanggal ? new Date(data.tanggal) : now;
  const dueDate = data.dueDate ? new Date(data.dueDate) : null;
  const alasanArr = ['Screening Dihentikan', 'Tidak Berminat', 'Tidak Memenuhi Syarat'];
  let alasanValue = (alasanArr.includes(data.hasil) && data.alasan) 
                    ? (data.alasan === 'Lainnya' && data.catatanAlasan ? 'Lainnya: ' + data.catatanAlasan : data.alasan) 
                    : '';

  const insActSql = "INSERT INTO aktivitas_siswa (marketing_period, `timestamp`, tanggal, id_sekolah_nama, id_siswa_nama, aktivitas, hasil, status_terkini, next_action, due_date, status_jadwal, catatan, alasan_tidak_lanjut) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
  await pool.query(insActSql, [
    marketingPeriod, now, tgl, data.idSekolahNama || '', data.idSiswaNama || '',
    data.aktivitas || '', data.hasil, mapping.status, mapping.nextAction, dueDate,
    newStatusJadwal, data.catatan || '', alasanValue
  ]);

  if (data.idSiswa) {
    const updSwpSql = "UPDATE siswa_periode SET status_terkini = ?, next_action = ?, due_date = ?, status_jadwal = ?, status_updated_date = ?, last_updated = ?, alasan_tidak_lanjut = ?, catatan = ? WHERE id_siswa = ? AND marketing_period = ?";
    await pool.query(upSwpSql, [
      mapping.status, mapping.nextAction, dueDate, newStatusJadwal, now, now, alasanValue, data.catatan || '', data.idSiswa, marketingPeriod
    ]);
  }

  return { success: true, message: 'Aktivitas berhasil disimpan.' };
}

async function addSekolah(data, user) {
  if (!data.namaSekolah) throw new Error('Nama sekolah wajib diisi.');
  
  const now = new Date();
  const activePeriod = await getActiveMarketingPeriod();
  
  const newId = await generateId('SKL', 'master_sekolah', 'id_sekolah');
  const sqlMaster = "INSERT INTO master_sekolah (id_sekolah, nama_sekolah, jenjang, status_sekolah, kecamatan, alamat, pic_utama, wa_pic, created_date, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
  await pool.query(sqlMaster, [
    newId, data.namaSekolah, data.tingkat || '', data.statusSekolah || '', data.kecamatan || '', data.alamat || '', 
    data.picUtama || '', data.waPic || '', now, now
  ]);

  const recId = await generateId('SKP', 'sekolah_periode', 'id_record');
  const pjSekolah = user.role === 'CRO' ? user.nama : null;
  const sqlPeriode = "INSERT INTO sekolah_periode (id_record, marketing_period, id_sekolah, status_terkini, status_updated_date, next_action, due_date, status_jadwal, sekolah_aktif, jumlah_siswa, pj_sekolah, created_date, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
  await pool.query(sqlPeriode, [
    recId, activePeriod, newId, 'Belum Visit', now, 'Visit Awal', data.dueDate ? new Date(data.dueDate) : null,
    data.dueDate ? 'Terjadwal' : 'Menunggu Penjadwalan', 'Aktif', data.jumlahSiswa ? Number(data.jumlahSiswa) : null, pjSekolah, now, now
  ]);

  return { success: true, message: 'Sekolah berhasil ditambahkan', id: newId };
}

async function updateSekolah(id, data, user) {
  if (!id || !data.namaSekolah) throw new Error('ID dan Nama sekolah wajib diisi.');
  
  const now = new Date();
  const activePeriod = await getActiveMarketingPeriod();
  
  const sqlMaster = `
    UPDATE master_sekolah 
    SET nama_sekolah = ?, jenjang = ?, status_sekolah = ?, kecamatan = ?, alamat = ?, 
        pic_utama = ?, wa_pic = ?, last_updated = ?
    WHERE id_sekolah = ?
  `;
  await pool.query(sqlMaster, [
    data.namaSekolah, data.tingkat || '', data.statusSekolah || '', data.kecamatan || '', data.alamat || '', 
    data.picUtama || '', data.waPic || '', now, id
  ]);

  let dueDateObj = null;
  if (data.dueDate) {
    dueDateObj = new Date(data.dueDate);
  }

  const sqlPeriode = `
    UPDATE sekolah_periode 
    SET due_date = COALESCE(?, due_date), jumlah_siswa = ?, last_updated = ?
    WHERE id_sekolah = ? AND marketing_period = ?
  `;
  await pool.query(sqlPeriode, [
    dueDateObj, data.jumlahSiswa ? Number(data.jumlahSiswa) : null, now, id, activePeriod
  ]);

  return { success: true, message: 'Sekolah berhasil diupdate' };
}

async function updateLastAktivitasSekolah(data, user) {
  const marketingPeriod = await getActiveMarketingPeriod();
  const now = new Date();
  
  let sqlUpdate = "UPDATE aktivitas_sekolah SET catatan = ? WHERE timestamp = ? AND id_sekolah_nama LIKE ?";
  let params = [data.catatan, data.timestamp, `%${data.idSekolah}%`];
  await pool.query(sqlUpdate, params);
  
  return { success: true, message: 'Aktivitas berhasil diupdate' };
}

async function addAktivitasSekolah(data, user) {
  const marketingPeriod = await getActiveMarketingPeriod();
  const now = new Date();
  const mapping = HASIL_AKTIVITAS_SEKOLAH[data.hasil];
  if (!mapping) throw new Error('Hasil aktivitas sekolah tidak valid: ' + data.hasil);

  let newStatusJadwal = 'Menunggu Penjadwalan';
  if (mapping.nextAction === 'Tidak Ada') {
    newStatusJadwal = 'Tidak ada jadwal';
    data.dueDate = '';
  } else if (data.dueDate) {
    newStatusJadwal = 'Terjadwal';
  }

  const tgl = data.tanggal ? new Date(data.tanggal) : now;
  const dueDate = data.dueDate ? new Date(data.dueDate) : null;

  const sqlIns = "INSERT INTO aktivitas_sekolah (marketing_period, `timestamp`, tanggal, id_sekolah_nama, aktivitas, hasil, status_terkini, next_action, due_date, status_jadwal, catatan, pic_yang_dihubungi, jabatan_pic, wa_pic, jumlah_siswa) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
  await pool.query(sqlIns, [
    marketingPeriod, now, tgl, data.idSekolahNama || '', data.aktivitas || '', data.hasil, mapping.status, mapping.nextAction,
    dueDate, newStatusJadwal, data.catatan || '', data.pic || '', data.jabatanPic || '', cleanPhoneNumber(data.waPic || ''),
    data.jumlahSiswa ? Number(data.jumlahSiswa) : null
  ]);

  if (data.idSekolah) {
    const updSkpSql = "UPDATE sekolah_periode SET status_terkini = ?, next_action = ?, due_date = ?, status_jadwal = ?, status_updated_date = ?, last_updated = ?, sekolah_aktif = ?, pic_utama = ?, jabatan_pic = ?, wa_pic = ?, jumlah_siswa = ? WHERE id_sekolah = ? AND marketing_period = ?";
    await pool.query(updSkpSql, [
      mapping.status, mapping.nextAction, dueDate, newStatusJadwal, now, now, data.sekolahAktif || 'Aktif',
      data.pic || '', data.jabatanPic || '', cleanPhoneNumber(data.waPic || ''), data.jumlahSiswa ? Number(data.jumlahSiswa) : null,
      data.idSekolah, marketingPeriod
    ]);
  }

  return { success: true, message: 'Aktivitas berhasil disimpan.' };
}

/**
 * GET /api/v1/dashboard/leaderboard
 * Top 3 CRO berdasarkan total siswa Terdaftar pada bulan berjalan.
 * Untuk Admin/Manager: semua CRO. Untuk CRO: hanya diri sendiri (rank-nya).
 */
async function getDashboardLeaderboard(user, period) {
  let mp = period || user.selectedPeriod;
  if (!mp || mp === '-') mp = await getActiveMarketingPeriod();
  const isAdmin = user.role === 'Admin' || user.role === 'Manager';

  // Query ranking CRO berdasarkan closing (Terdaftar) bulan ini
  let sql = `
    SELECT 
      sp.cro,
      IFNULL(u.nama, sp.cro) AS nama_cro,
      COUNT(*) AS total_closing
    FROM siswa_periode sp
    LEFT JOIN users u ON sp.cro = u.username
    WHERE 
      sp.marketing_period = ?
      AND sp.status_terkini = 'Terdaftar'
      AND MONTH(sp.status_updated_date) = MONTH(CURDATE())
      AND YEAR(sp.status_updated_date) = YEAR(CURDATE())
    GROUP BY sp.cro, u.nama
    ORDER BY total_closing DESC
    LIMIT 3
  `;

  const [rows] = await pool.query(sql, [mp]);

  const leaderboard = rows.map((r, idx) => ({
    rank:          idx + 1,
    username:      r.cro,
    nama:          r.nama_cro,
    totalClosing:  parseInt(r.total_closing, 10),
    medal:         ['🥇', '🥈', '🥉'][idx] || ''
  }));

  // Cari posisi user saat ini jika bukan admin (bisa saja tidak masuk top 3)
  let userRank = null;
  if (!isAdmin) {
    const [rankRows] = await pool.query(`
      SELECT sub.cro, sub.total_closing, sub.rn FROM (
        SELECT sp.cro, COUNT(*) AS total_closing,
               RANK() OVER (ORDER BY COUNT(*) DESC) AS rn
        FROM siswa_periode sp
        WHERE sp.marketing_period = ?
          AND sp.status_terkini = 'Terdaftar'
          AND MONTH(sp.status_updated_date) = MONTH(CURDATE())
          AND YEAR(sp.status_updated_date) = YEAR(CURDATE())
        GROUP BY sp.cro
      ) sub WHERE sub.sp.cro = ?
    `, [mp, user.username]);

    if (rankRows.length > 0) {
      userRank = {
        rank:         parseInt(rankRows[0].rn, 10),
        totalClosing: parseInt(rankRows[0].total_closing, 10)
      };
    }
  }

  return { leaderboard, userRank, period: mp };
}

/**
 * POST /api/v1/tasks/:id/reschedule
 * Reschedule due_date sebuah task (sekolah/siswa/homevisit/aktifitas_ekstra).
 * Body: { tipe, newDate, alasan, period }
 */
async function rescheduleTask(id, tipe, newDate, alasan, user) {
  if (!id || !tipe || !newDate || !alasan) {
    throw new Error('id, tipe, newDate, dan alasan wajib diisi.');
  }
  if (!['sekolah', 'siswa', 'homevisit', 'aktifitas_ekstra'].includes(tipe)) {
    throw new Error(`Tipe tidak valid: ${tipe}. Gunakan sekolah/siswa/homevisit/aktifitas_ekstra.`);
  }

  const now = new Date();
  const updatedBy = user.username;

  if (tipe === 'sekolah') {
    // Update due_date di sekolah_periode + append catatan reschedule
    const [rows] = await pool.query(
      'SELECT catatan FROM sekolah_periode WHERE id_sekolah = ?',
      [id]
    );
    const oldCatatan = rows[0]?.catatan || '';
    const logEntry = `\n[Tunda ${now.toLocaleDateString('id-ID')} oleh ${updatedBy}]: ${alasan}`;
    await pool.query(
      `UPDATE sekolah_periode SET due_date = ?, catatan = CONCAT(IFNULL(catatan,''), ?), status_updated_date = NOW() WHERE id_sekolah = ?`,
      [newDate, logEntry, id]
    );

  } else if (tipe === 'siswa') {
    const [rows] = await pool.query(
      'SELECT catatan FROM siswa_periode WHERE id_siswa = ?',
      [id]
    );
    const logEntry = `\n[Tunda ${now.toLocaleDateString('id-ID')} oleh ${updatedBy}]: ${alasan}`;
    await pool.query(
      `UPDATE siswa_periode SET due_date = ?, catatan = CONCAT(IFNULL(catatan,''), ?), status_updated_date = NOW() WHERE id_siswa = ?`,
      [newDate, logEntry, id]
    );

  } else if (tipe === 'homevisit') {
    await pool.query(
      `UPDATE home_visit SET due_date = ?, status_updated_date = NOW() WHERE id_siswa_nama = ?`,
      [newDate, id]
    );

  } else if (tipe === 'aktifitas_ekstra') {
    const logEntry = `[Tunda ${now.toLocaleDateString('id-ID')} oleh ${updatedBy}]: ${alasan}`;
    await pool.query(
      `UPDATE aktivitas_ekstra SET tanggal_rencana = ?, tujuan_catatan = CONCAT(IFNULL(tujuan_catatan,''), '\n', ?), updated_at = NOW() WHERE id_aktifitas_ekstra = ?`,
      [newDate, logEntry, id]
    );
  }

  return {
    success: true,
    id,
    tipe,
    newDate,
    alasan,
    updatedBy,
    updatedAt: now.toISOString()
  };
}

module.exports = { 
  getInitialData, 
  getAllSekolah, 
  getAllSiswa,
  getDashboardSummary,
  getDashboardTasks,
  getDashboardFunnels,
  getDashboardAktivitas,
  getDashboardKecamatan,
  getSekolahDropdown,
  getAllMarketingPeriods,
  getActiveMarketingPeriod,
  getCarryForwardStatus,
  getSiswaById,
  getBroadcastSekolahList,
  getBroadcastHistory,
  getBroadcastTargetPreview,
  createBroadcast,
  getBroadcastProgress,
  checkTemplateHistory,
  getNurturingDashboardData,
  getSnoozeDashboardData,
  getSekolahById,
  getTaskList,
  getWeeklyPlanningData,
  createAgenda,
  updateAgenda,
  deleteAgenda,
  getAllHomeVisit,
  getHomeVisitById,
  createHomeVisit,
  addAktivitasHomeVisit,
  addSiswa,
  updateSiswa,
  addSiswaBatch,
  updateLastAktivitasSiswa,
  addAktivitasSiswa,
  getSiswaByPhone,
  addSekolah,
  updateSekolah,
  updateLastAktivitasSekolah,
  addAktivitasSekolah,
  getDashboardLeaderboard,
  rescheduleTask
};

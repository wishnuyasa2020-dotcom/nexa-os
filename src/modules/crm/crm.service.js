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
    nama_period: r.nama_period,
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

module.exports = { getInitialData };

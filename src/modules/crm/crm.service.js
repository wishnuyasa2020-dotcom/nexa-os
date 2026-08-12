'use strict';

const { pool } = require('../../../config/database');

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
      sekolah:      sekolahUtama,
      kecamatans,
      croList,
    },
  };
}

module.exports = { getInitialData };

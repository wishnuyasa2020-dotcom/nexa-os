'use strict';

/**
 * demo-reset.cron.js
 * Scheduler background job untuk reset otomatis database akun Demo Version.
 *
 * Jadwal: Setiap 1 minggu sekali pada hari Minggu malam pukul 21:00 WIB.
 * Cron expression: '0 21 * * 0' dengan timezone: 'Asia/Jakarta'
 *
 * Catatan keamanan:
 * - Hanya menargetkan akun demo ('crm-demo').
 * - Mengecualikan tabel 'users', 'marketing_period', 'master_kota', 'master_kecamatan', 'master_kelas'.
 */

const cron = require('node-cron');
const demoResetService = require('./demo-reset.service');

function initDemoResetCron() {
  // Jadwal: Setiap Minggu jam 21:00 WIB (Asia/Jakarta)
  // Menit 0, Jam 21, Hari *, Bulan *, Hari-dalam-minggu 0 (Minggu)
  cron.schedule('0 21 * * 0', async () => {
    const wibStr = new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      dateStyle: 'full',
      timeStyle: 'medium'
    }).format(new Date());

    console.log(`\n[Demo Reset Cron] ⏰ Terpicu jadwal mingguan pada ${wibStr} (Minggu 21:00 WIB)`);

    try {
      const result = await demoResetService.resetDemoData('crm-demo', 'cron');
      console.log(`[Demo Reset Cron] ✅ Sukses reset database demo: ${result.totalTablesReset} tabel dibersihkan.`);
    } catch (err) {
      console.error(`[Demo Reset Cron] ❌ Gagal mengeksekusi reset mingguan:`, err.message);
    }
  }, {
    scheduled: true,
    timezone: 'Asia/Jakarta'
  });

  console.log('✅ [Demo Reset Cron] Scheduler terdaftar → Setiap Minggu pukul 21:00 WIB (Asia/Jakarta)');
}

module.exports = { initDemoResetCron };

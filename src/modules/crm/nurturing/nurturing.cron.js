'use strict';

/**
 * nurturing.cron.js
 * Scheduler background job untuk Modul Automated Nurturing & Snooze Campaign.
 *
 * Jadwal: Setiap hari pukul 21:00 WIB (UTC+7 = 14:00 UTC)
 *
 * Catatan keamanan:
 * - node-cron berjalan in-process bersama server Express.
 * - Aman untuk environment lokal maupun production (Hostinger + PM2).
 * - Jika server restart, cron akan aktif kembali otomatis.
 * - Pastikan tidak ada duplikasi instance (gunakan PM2 cluster_mode: false atau
 *   gunakan 1 instance saja jika multi-process).
 */

const cron    = require('node-cron');
const svc     = require('./nurturing.service');
const { mainPool, tenantStorage } = require('../../../config/database');

/**
 * Jalankan kedua job (nurturing + snooze) dalam satu schedule.
 * Waktu: 14:00 UTC = 21:00 WIB
 *
 * Format cron: 'menit jam hari bulan hari-minggu'
 *   0 14 * * *  → setiap hari jam 14:00 UTC (21:00 WIB)
 */
function initNurturingCron() {
  cron.schedule('0 14 * * *', async () => {
    const ts = new Date().toISOString();
    console.log(`\n[Nurturing Cron] ⏰ Terpicu pada ${ts} (21:00 WIB)`);

    try {
      // Ambil semua tenant yang aktif dan memiliki token WA
      const [tenants] = await mainPool.query(
        'SELECT tenant_id, whatsapp_phone_id, whatsapp_access_token FROM tenants'
      );

      console.log(`[Nurturing Cron] Memproses ${tenants.length} tenants...`);

      for (const tenant of tenants) {
        if (!tenant.tenant_id) continue;
        const tenantId = tenant.tenant_id;
        
        console.log(`\n[Nurturing Cron] --- Tenant: ${tenantId} ---`);
        const credentials = {
          phoneId: tenant.whatsapp_phone_id,
          token: tenant.whatsapp_access_token
        };

        // Jalankan service di dalam context tenantStorage
        await tenantStorage.run(tenantId, async () => {
          try {
            const nurturingResult = await svc.runNurturingCron(credentials);
            console.log(`[Nurturing Cron][${tenantId}] Nurturing Probing:`, nurturingResult);
          } catch (err) {
            console.error(`[Nurturing Cron][${tenantId}] ❌ Error pada nurturing job:`, err.message);
          }

          try {
            const snoozeResult = await svc.runSnoozeCron(credentials);
            console.log(`[Nurturing Cron][${tenantId}] Snooze Campaign:`, snoozeResult);
          } catch (err) {
            console.error(`[Nurturing Cron][${tenantId}] ❌ Error pada snooze job:`, err.message);
          }
        });
      }
    } catch (err) {
      console.error('[Nurturing Cron] ❌ Error mengambil daftar tenant:', err.message);
    }

    console.log('[Nurturing Cron] ✅ Semua job selesai.\n');
  }, {
    scheduled: true,
    timezone:  'Asia/Jakarta', // Langsung gunakan timezone WIB — tidak perlu konversi manual
  });

  console.log('[Nurturing Cron] Scheduler terdaftar → setiap hari 21:00 WIB (Asia/Jakarta)');
}

module.exports = { initNurturingCron };

# Technical Debt: Modul Broadcast & Worker WA

**Status Saat Ini (Fase Transisi):**
Saat ini antarmuka pengguna (UI) dari Modul Broadcast (termasuk filter siswa, validasi form, dan pembuatan jadwal queue) telah di-porting sepenuhnya ke Node.js (Express.js) agar performanya jauh lebih cepat. 

Akan tetapi, **Worker Background** yang bertugas menembakkan WhatsApp ke Meta API berdasarkan data `broadcast_queue` **masih berjalan di Google Apps Script (GAS) via Time-based Trigger setiap 1 menit**.

### Mengapa hal ini dilakukan?
- Keamanan sistem (Scope Control): Jika kita memindahkannya sekarang, kita harus membongkar ulang seluruh integrasi Meta API Token, modul Chat, sinkronisasi *Inbox*, dan Templating Variabel secara bersamaan yang akan memperbesar resiko *error*.
- Aplikasi GAS dan Node.js Express membaca *database* MySQL yang sama, jadi hal ini sangat aman secara arsitektur sementara.

### To-Do Saat Pindah ke Hosting Bisnis (Fase 2)
Saat Anda sudah memiliki VPS/Hosting Bisnis dan semua modul CRM (termasuk modul Inbox/Chat) telah selesai di-porting ke Express.js, Anda wajib:

1. **Mematikan Trigger GAS:**
   Masuk ke Editor Google Apps Script > Triggers (icon jam di kiri) > Hapus trigger `processBroadcastQueue`.
   
2. **Membuat Cron Job di Node.js:**
   Gunakan library Node.js seperti `node-cron` di dalam `server.js` atau `app.js` Anda:
   ```javascript
   const cron = require('node-cron');
   const { processBroadcastQueueWorker } = require('./modules/crm/crm.worker');

   // Jalankan setiap 1 menit
   cron.schedule('* * * * *', async () => {
       await processBroadcastQueueWorker();
   });
   ```

3. **Porting Logika Pengiriman Meta API:**
   Pastikan Anda telah memiliki modul pengirim WhatsApp (setara dengan `WhatsAppService.gs` di GAS) yang terhubung ke Graph API Meta di dalam environment Node.js.

*Dokumen ini dibuat agar tidak kelupaan saat nanti Anda migrasi server penuh ke hosting bisnis.*

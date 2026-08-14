# Technical Debt: Form Publik & Public API

**Status Saat Ini (Fase Transisi):**
Semua fungsi baca/tulis data operasional (Tambah Siswa, Edit Status, Catat Aktivitas) yang dipakai oleh *internal* (Admin / CRO) melalui UI CRM Dashboard sudah dipindahkan (di-porting) ke Node.js (Express) untuk ngebut. 

Namun, **Google Forms / Web App Public** yang dipakai *lead/user/siswa* secara langsung di internet (di luar dari Dashboard CRM kita) masih menggunakan script `form_crm.html` dan `SiswaService.gs` (Fungsi `addSiswaPublic` dan `getSekolahPublicInfo`) murni bawaan Google Apps Script. 

### Mengapa hal ini dilakukan?
- Endpoint Express kita saat ini diamankan oleh middleware autentikasi (JWT + Bearer Token). Form publik yang diakses oleh anonim tidak punya akses token ini. 
- Kalau kita memindahkannya sekarang, kita butuh mengatur ulang skema autentikasi *public access API* dan mengurus *Cross-Origin Resource Sharing (CORS)* untuk domain hosting form eksternal. Di lingkungan GAS transisi saat ini, form publik yang melekat ke script GAS sebagai Web App sudah jalan sangat stabil.

### To-Do Saat Pindah ke Hosting Bisnis (Fase 2)
Saat aplikasi ini sudah dilepas total dari Google Apps Script dan berjalan independen di VPS / Domain Bisnis, Anda harus memindahkan form pendaftaran ke Next.js (atau sistem *frontend* publik Anda) dengan cara:

1. **Membuat Public API Endpoints di Express:**
   Di dalam `crm.routes.js`, buat endpoint yang tidak dilewati middleware auth.
   ```javascript
   // Endpoint Khusus Publik
   router.get('/public/sekolah-info/:id', ctrl.getSekolahPublicInfo);
   router.post('/public/siswa/register', ctrl.addSiswaPublic);
   ```

2. **Pengaturan CORS:**
   Pastikan konfigurasi `cors()` di `server.js` Anda memperbolehkan domain form publik.
   ```javascript
   app.use(cors({
     origin: ['https://pendaftaran.dermaindonesia.com', 'https://crm.dermaindonesia.com']
   }));
   ```

3. **Rate Limiting / Recaptcha:**
   Karena API ini *public*, jangan lupa pasang `express-rate-limit` atau validasi token Google reCAPTCHA agar database tidak di-*spam* bot.

*Simpan catatan ini sebagai panduan saat melakukan migrasi infrastruktur Frontend Form ke hosting baru.*

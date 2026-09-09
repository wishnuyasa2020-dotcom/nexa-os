# WhatsApp Webhook Architecture di nexa-os

Perhatian untuk semua agen (AI Assistant) yang bekerja di repositori `nexa-os`! 
Terdapat **DUA (2)** jalur *webhook* WhatsApp yang aktif secara bersamaan, dan keduanya HARUS diperhatikan ketika membuat pembaruan yang berkaitan dengan penerimaan pesan WhatsApp:

1. **Jalur Baru / BYOW (Bring Your Own WhatsApp)**
   - **URL:** `/webhook/:tenantSlug`
   - **File Handler:** `src/modules/crm/webhook.router.js`
   - **Konteks:** Sistem terbaru yang ditujukan untuk *multi-tenant* di mana masing-masing klinik dapat mengatur *webhook* Meta mereka sendiri.

2. **Jalur Lama / Legacy (Single/Global)**
   - **URL:** `/api/webhook/:tenantId` (atau `/api/webhook/global`)
   - **File Handler:** `src/modules/crm/crm.webhook.routes.js`
   - **Konteks:** Sistem *legacy* yang sebagian besar *tenant* (termasuk Derma) MASIH gunakan di konfigurasi aplikasi Meta Developer mereka.

**Peringatan:**
Jika Anda membuat perubahan pada logika penerimaan pesan dari Meta (seperti menangani tipe pesan `interactive`, `button`, pemrosesan file, dsb.), Anda **WAJIB** menerapkan perubahan tersebut di KEDUA file di atas (`webhook.router.js` dan `crm.webhook.routes.js`) agar fitur berjalan secara menyeluruh tanpa peduli *webhook* mana yang sedang diakses oleh Meta.

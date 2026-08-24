# Panduan Akses Database Backend via MCP

**Konteks Sistem Database:**
Backend Nexa OS menggunakan arsitektur *multi-tenant* di MySQL:
- **Main Database** (`u294320793_nexamain`): Menyimpan data konfigurasi inti, fitur plan, dan kredensial akses di tabel `tenant_databases`.
- **Tenant Databases** (contoh: `u294320793_crmdemo`): Menyimpan operasional spesifik per *tenant*.

**Instruksi Utama (Wajib Diikuti Agent AI):**
Mulai sekarang, setiap kali diminta untuk membangun, menganalisis, atau me-debug fitur backend yang berinteraksi dengan database:

1. **Jadikan MCP Server sebagai Sumber Utama:** Selalu gunakan MCP Server `mysql-hostinger` untuk mengeksplorasi skema dan melihat sampel data. Dilarang menebak struktur tabel!
2. **Tools yang Digunakan:**
   - Gunakan `list_tables` untuk melihat tabel.
   - Gunakan `describe_table` untuk melihat kolom dan tipe datanya.
   - Gunakan `read_query` untuk mengeksekusi `SELECT` query uji coba.
3. **Koneksi Dinamis Tenant:**
   Tools tersebut mendukung argumen opsional `tenant_id`. Saat kamu butuh mengeksplorasi database milik *tenant* (bukan Main DB), WAJIB sertakan argumen `tenant_id` (misal: `tenant_id: "crm-demo"`) pada pemanggilan *tool*. MCP server lokal akan mengurus koneksinya secara dinamis tanpa perlu setup manual.

*Rule ini berlaku secara otomatis untuk semua pekerjaan pengembangan backend di dalam workspace ini.*

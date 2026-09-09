# WhatsApp Smart Routing & Template Fallback (SW Open)

Perhatian untuk semua agen (AI Assistant) yang bekerja di repositori `nexa-os`!
Ini adalah panduan utama terkait sistem **Smart Routing** penghematan biaya pengiriman pesan WhatsApp ketika *Service Window* (SW) pelanggan sedang terbuka.

## Latar Belakang
Secara default, pesan menggunakan *Template* WhatsApp (yang dibuat di Meta Business Manager) dikenakan biaya per pengiriman meskipun SW terbuka. Untuk menghindari biaya tersebut, sistem kita mencegat permintaan pengiriman *Template* ketika SW sedang OPEN, dan mengubahnya menjadi pesan *Interactive* biasa atau teks.

## Mekanisme Parsing & Routing (Wajib Diikuti)

Jika Anda perlu memodifikasi logika pengiriman pesan di `chat.service.js` (khususnya fungsi `sendToMetaApi` atau fungsi *wrapper* yang memanggilnya), pertahankan pola ini:

### 1. Deteksi SW Terbuka
- Sistem mendeteksi `is_sw_open = true`.
- Pesan yang seharusnya bertipe `template` dicegat dan diubah secara otomatis menjadi tipe `interactive` (tombol) atau `text` biasa.

### 2. Resolusi Parameter Template
- *Template* biasanya mengandung variabel `{{1}}`, `{{2}}`, dsb.
- Gunakan fungsi `resolveTemplateVariables(tmplRecord, data)` untuk mengganti teks tersebut.
- Parameter *template* di *database* tersimpan di kolom `parameters` dalam bentuk JSON (contoh: `{"body": ["STUDENT_NAME", "SCHOOL_NAME"]}`).
- Fungsi `resolveTemplateVariables` bertugas melacak urutan variabel tersebut dan menugaskannya secara dinamis (sehingga tidak tertukar, seperti nama anak menjadi nomor HP).

### 3. Merakit Pesan Interaktif (Interactive Message)
Ekstrak komponen *Template* dan bentuk menjadi objek *Interactive* Meta:
- **Header:** Jika *template* memiliki URL gambar (dari `header_type = 'IMAGE'`), jadikan tipe `image`. Jika dokumen, jadikan `document`. Jika hanya teks panjang, ambil maksimal 60 karakter saja sebagai `text` (*limit* API Meta).
- **Body:** Hasil teks panjang dari `resolveTemplateVariables`.
- **Buttons (Quick Replies):** Jika *template* punya tombol (misalnya melalui parameter ekstensi), rakit menjadi format `action.buttons` (maksimal 3 tombol). Tipe id-nya buat seperti `btn_0`. Teks tombol dipotong maksimal 20 karakter.

### 4. Sistem Fallback Berlapis
Karena API Meta sangat ketat terhadap format pesan *Interactive* (panjang karakter *header*, karakter tombol, dll.), Anda **WAJIB** membungkus pemanggilan API Meta (`axios.post`) dengan sebuah blok `try-catch` atau `.catch()` khusus.
- Jika API Meta me-reject/menggagalkan pengiriman `type: 'interactive'`, langsung cegat kegagalannya.
- Ubah pesan interaktif tersebut menjadi pesan `type: 'text'` (teks biasa).
- Tambahkan daftar pilihan secara manual di bagian akhir teks (*Numbered List*), misalnya: `\n\n*Silakan balas dengan mengetikkan angka:*\n1. Ya, berminat\n2. Tidak`.
- Kirim ulang pesan *text* tersebut. Hal ini memastikan 100% *deliverability* (pesan pasti sampai walau gagal tampil sebagai tombol).

Setiap AI yang bekerja pada modul *chat* WhatsApp di proyek ini dilarang keras menghapus atau melewatkan pola arsitektur **Smart Routing & Fallback** ini!

'use strict';

/**
 * defaultTemplates.data.js
 * ============================================================
 * Pustaka Template NexaMOS Default (Template Library)
 * Disusun dari 27 template teruji di Derma (Pilot Tenant)
 * dan diselaraskan penuh dengan Pedoman Ontologi NexaMOS:
 * - LEAD
 * - PROSPECT
 * - OPPORTUNITY
 * - REGISTERED_OPPORTUNITY
 * - CUSTOMER
 * - SNOOZE
 *
 * Catatan:
 * Seluruh nama brand telah dinetralkan menjadi placeholder `{{tenant_name}}`.
 * ============================================================
 */

const DEFAULT_TEMPLATES_LIBRARY = [
  // ── 1. LEAD (Onboarding & Initial Verification) ─────────────
  {
    id_template: 'TPL-014',
    pipeline: 'LEAD',
    nama_template: 'Welcome siswa baru',
    template_name_api: 'followup_h0_v2',
    language_code: 'id',
    body_text: 'Terima kasih sudah hadir di kegiatan sosialisasi {{tenant_name}} di {{1}}.\n\nSaya ingin memastikan, setelah mengikuti sosialisasi itu, apakah Kak {{2}} mulai tertarik dan berminat dengan program pelatihan dan persiapan kerja dari {{tenant_name}}?\n\nSilakan pilih salah satu jawaban di bawah ya.',
    kategori: 'Onboarding',
    urutan: 1,
    status_crm: 'ACTIVE',
    meta_status: 'APPROVED',
    header_type: null,
    header_url: null,
    parameters: JSON.stringify({
      header: { type: 'text', params: ['STUDENT_NAME'] },
      body: ['SCHOOL_NAME', 'STUDENT_NAME'],
      meta_buttons: [
        { type: 'QUICK_REPLY', index: 0, text: 'Ya, saya berminat' },
        { type: 'QUICK_REPLY', index: 1, text: 'Saya masih ragu' },
        { type: 'QUICK_REPLY', index: 2, text: 'Tidak, saya tidak berminat' }
      ]
    }),
    meta_buttons: JSON.stringify([
      { type: 'QUICK_REPLY', text: 'Ya, saya berminat' },
      { type: 'QUICK_REPLY', text: 'Saya masih ragu' },
      { type: 'QUICK_REPLY', text: 'Tidak, saya tidak berminat' }
    ])
  },
  {
    id_template: 'TPL-001',
    pipeline: 'LEAD',
    nama_template: 'Welcome Siswa Lama',
    template_name_api: 'followup_h1',
    language_code: 'id',
    body_text: 'Terimakasih sudah mengkonfirmasi kehadiran sosialisasi di {{1}}\n\nSaya mau memastikan, apakah kak {{2}} mulai ada minatnya untuk lanjut ikut program bersama {{tenant_name}} lulus sekolah ini kak?\n*Pilih salah satu tombol dibawah :',
    kategori: 'Onboarding',
    urutan: 2,
    status_crm: 'INACTIVE',
    meta_status: 'APPROVED',
    header_type: null,
    header_url: null,
    parameters: JSON.stringify({
      body: ['SCHOOL_NAME', 'STUDENT_NAME']
    }),
    meta_buttons: JSON.stringify([
      { type: 'QUICK_REPLY', text: 'Ya, saya masih berminat' },
      { type: 'QUICK_REPLY', text: 'Ragu, mau dipikir dulu' },
      { type: 'QUICK_REPLY', text: 'Tidak, berhenti kirimi saya pesan' }
    ])
  },
  {
    id_template: 'TPL-002',
    pipeline: 'LEAD',
    nama_template: 'Info Program',
    template_name_api: 'info_program',
    language_code: 'id',
    body_text: 'Halo {{1}}, berikut informasi lengkap program pelatihan dan penempatan kerja melalui {{tenant_name}}. Apakah ada yang ingin ditanyakan?',
    kategori: 'Informasi',
    urutan: 3,
    status_crm: 'INACTIVE',
    meta_status: 'DELETED',
    header_type: null,
    header_url: null,
    parameters: JSON.stringify({
      body: ['STUDENT_NAME']
    }),
    meta_buttons: null
  },
  {
    id_template: 'TPL-003',
    pipeline: 'LEAD',
    nama_template: 'Follow-up H+1',
    template_name_api: 'followup_h2',
    language_code: 'id',
    body_text: 'Terimakasih sudah mengkonfirmasi kehadiran sosialisasi bersama {{tenant_name}} di {{1}}\n\nSaya mau memastikan, apakah kak {{2}} mulai ada minatnya untuk ikut program pelatihan kerja lulus sekolah ini kak?',
    kategori: 'Follow Up',
    urutan: 4,
    status_crm: 'INACTIVE',
    meta_status: 'DELETED',
    header_type: null,
    header_url: null,
    parameters: JSON.stringify({
      body: ['SCHOOL_NAME', 'STUDENT_NAME']
    }),
    meta_buttons: JSON.stringify([
      { type: 'QUICK_REPLY', text: 'Ya, saya masih berminat' },
      { type: 'QUICK_REPLY', text: 'Ragu, mau dipikir dulu' },
      { type: 'QUICK_REPLY', text: 'Tidak, berhenti kirimi saya pesan' }
    ])
  },
  {
    id_template: 'TPL-015',
    pipeline: 'LEAD',
    nama_template: 'Autosend - reminder onboarding',
    template_name_api: 'followup_h2_reminder',
    language_code: 'id',
    body_text: 'Kemarin kami sempat mengirimkan pesan mengenai peluang karir bersama {{tenant_name}} pasca sosialisasi di sekolahmu. Kami paham kamu mungkin sedang sibuk, sedang belajar, atau butuh waktu untuk berdiskusi dengan orang tua.\n\nAgar kami bisa memberikan informasi yang paling sesuai dengan rencana masa depanmu, bolehkah bantu kami dengan menekan salah satu pilihan di bawah ini? \n\nHak keputusan sepenuhnya ada di tanganmu ya!',
    kategori: 'Onboarding',
    urutan: 5,
    status_crm: 'ACTIVE',
    meta_status: 'APPROVED',
    header_type: null,
    header_url: null,
    parameters: JSON.stringify({
      header: { type: 'text', params: ['STUDENT_NAME'] },
      body: ['STUDENT_NAME'],
      meta_buttons: [
        { type: 'QUICK_REPLY', index: 0, text: 'Ya, saya berminat' },
        { type: 'QUICK_REPLY', index: 1, text: 'Saya masih ragu' },
        { type: 'QUICK_REPLY', index: 2, text: 'Tidak, saya tidak minat' }
      ]
    }),
    meta_buttons: JSON.stringify([
      { type: 'QUICK_REPLY', text: 'Ya, saya berminat' },
      { type: 'QUICK_REPLY', text: 'Saya masih ragu' },
      { type: 'QUICK_REPLY', text: 'Tidak, saya tidak minat' }
    ])
  },

  // ── 2. PROSPECT (Kualifikasi 4 Dimensi FNAR) ────────────────
  {
    id_template: 'TPL-004',
    pipeline: 'PROSPECT',
    nama_template: 'Info Benefit',
    template_name_api: 'info_benefit',
    language_code: 'id',
    body_text: 'Halo {{1}}, kami ingin berbagi informasi tentang benefit dan keunggulan program di {{tenant_name}}. Tertarik untuk tahu lebih lanjut?',
    kategori: 'Informasi',
    urutan: 1,
    status_crm: 'INACTIVE',
    meta_status: 'DELETED',
    header_type: null,
    header_url: null,
    parameters: JSON.stringify({
      body: ['STUDENT_NAME']
    }),
    meta_buttons: null
  },
  {
    id_template: 'TPL-016',
    pipeline: 'PROSPECT',
    nama_template: 'Rencana setelah lulus',
    template_name_api: 'rencana_lulus',
    language_code: 'id',
    body_text: 'Kalau boleh tau rencana setelah lulus sekolah ini kak {{1}} mau lanjut kemana kak?\n\nKlik salah satu tombol dibawah ini untuk menjawab :',
    kategori: 'Follow Up',
    urutan: 2,
    status_crm: 'ACTIVE',
    meta_status: 'APPROVED',
    header_type: null,
    header_url: null,
    parameters: JSON.stringify({
      body: ['STUDENT_NAME'],
      meta_buttons: [
        { type: 'QUICK_REPLY', index: 0, text: 'Kerja' },
        { type: 'QUICK_REPLY', index: 1, text: 'Kuliah' },
        { type: 'QUICK_REPLY', index: 2, text: 'Bisnis' },
        { type: 'QUICK_REPLY', index: 3, text: 'Belum tahu' }
      ]
    }),
    meta_buttons: JSON.stringify([
      { type: 'QUICK_REPLY', text: 'Kerja' },
      { type: 'QUICK_REPLY', text: 'Kuliah' },
      { type: 'QUICK_REPLY', text: 'Bisnis' },
      { type: 'QUICK_REPLY', text: 'Belum tahu' }
    ])
  },
  {
    id_template: 'TPL-017',
    pipeline: 'PROSPECT',
    nama_template: 'Apa orangtua tahu?',
    template_name_api: 'orangtua_tahu',
    language_code: 'id',
    body_text: 'Kalau boleh tau, apa orangtua kak {{1}} sudah tau soal minat itu atau belum kak?',
    kategori: 'Follow Up',
    urutan: 3,
    status_crm: 'ACTIVE',
    meta_status: 'APPROVED',
    header_type: null,
    header_url: null,
    parameters: JSON.stringify({
      body: ['STUDENT_NAME']
    }),
    meta_buttons: null
  },
  {
    id_template: 'TPL-018',
    pipeline: 'PROSPECT',
    nama_template: 'Orangtua mendukung?',
    template_name_api: 'sikap_orangtua',
    language_code: 'id',
    body_text: 'Trus gimana sikapnya kak, apa kelihatan setuju/mendukung minat kak {{1}} untuk bergabung di program {{tenant_name}}?',
    kategori: 'Follow Up',
    urutan: 4,
    status_crm: 'ACTIVE',
    meta_status: 'APPROVED',
    header_type: null,
    header_url: null,
    parameters: JSON.stringify({
      body: ['STUDENT_NAME']
    }),
    meta_buttons: null
  },
  {
    id_template: 'TPL-019',
    pipeline: 'PROSPECT',
    nama_template: 'Alhamdulillah itu kabar baik!',
    template_name_api: 'kabar_baik',
    language_code: 'id',
    body_text: 'Oh alhamdulillah itu kabar baik kak, biasanya banyak orangtua kurang mendukung anaknya untuk mandiri atau berkarir jauh dari rumah. Tim {{tenant_name}} siap membantu mendampingi! 👍',
    kategori: 'Follow Up',
    urutan: 5,
    status_crm: 'ACTIVE',
    meta_status: 'APPROVED',
    header_type: null,
    header_url: null,
    parameters: JSON.stringify({
      body: ['STUDENT_NAME']
    }),
    meta_buttons: null
  },
  {
    id_template: 'TPL-021',
    pipeline: 'PROSPECT',
    nama_template: 'Autosend - probe 1',
    template_name_api: 'probe_1',
    language_code: 'id',
    body_text: 'Halo Kak {{1}}...\n\nSaya ijin kirim info ya kak :\n\nProgram pelatihan intensif dengan persiapan karir profesional bersama {{tenant_name}} untuk lulusan SMA/MA/SMK Sederajat.\n\nJelajahi masa depanmu mulai sekarang! 🚀',
    kategori: 'auto probe',
    urutan: 6,
    status_crm: 'ACTIVE',
    meta_status: 'APPROVED',
    header_type: null,
    header_url: null,
    parameters: JSON.stringify({
      body: ['STUDENT_NAME'],
      meta_buttons: [{ type: 'QUICK_REPLY', index: 0, text: 'Tanya Info Program' }]
    }),
    meta_buttons: JSON.stringify([
      { type: 'QUICK_REPLY', text: 'Tanya Info Program' }
    ])
  },
  {
    id_template: 'TPL-022',
    pipeline: 'PROSPECT',
    nama_template: 'Autosend - probe 2',
    template_name_api: 'probe_2',
    language_code: 'id',
    body_text: 'Halo kak {{1}}! 👋 Gimana kabarnya hari ini?\n\nPasti masih penasaran kan gimana serunya kegiatan belajar praktek di {{tenant_name}}? 😍\n\nBiar nggak makin penasaran, yuk intip keseruan teman-teman yang udah gabung dan ngerasain langsung asyiknya belajar bareng instruktur profesional kita! Di sini kita banyak praktek seru yang aplikatif.\n\nHubungi kami jika ada yang ingin ditanyakan ya! 👇',
    kategori: 'auto probe',
    urutan: 7,
    status_crm: 'ACTIVE',
    meta_status: 'APPROVED',
    header_type: null,
    header_url: null,
    parameters: JSON.stringify({
      body: ['STUDENT_NAME'],
      meta_buttons: [{ type: 'QUICK_REPLY', index: 0, text: 'Lihat Info Praktek' }]
    }),
    meta_buttons: JSON.stringify([
      { type: 'QUICK_REPLY', text: 'Lihat Info Praktek' }
    ])
  },
  {
    id_template: 'TPL-023',
    pipeline: 'PROSPECT',
    nama_template: 'Autosend - probe 3',
    template_name_api: 'probe_3',
    language_code: 'id',
    body_text: 'Halo Kak {{1}}! Mau tanya, apakah ada keraguan tertentu mengenai persiapan karir bersama {{tenant_name}}? Kami siap berdiskusi santai kapan saja.',
    kategori: 'auto probe',
    urutan: 8,
    status_crm: 'INACTIVE',
    meta_status: 'DELETED',
    header_type: null,
    header_url: null,
    parameters: JSON.stringify({
      body: ['STUDENT_NAME']
    }),
    meta_buttons: null
  },
  {
    id_template: 'TPL-024',
    pipeline: 'PROSPECT',
    nama_template: 'Autosend - probe 4',
    template_name_api: 'probe_4',
    language_code: 'id',
    body_text: 'Semangat pagi Kak {{1}}! Jangan lewatkan kesempatan meraih karir impian bersama {{tenant_name}}. Jika ingin berkonsultasi mengenai peluang yang tersedia, silakan balas pesan ini ya.',
    kategori: 'auto probe',
    urutan: 9,
    status_crm: 'INACTIVE',
    meta_status: 'DELETED',
    header_type: null,
    header_url: null,
    parameters: JSON.stringify({
      body: ['STUDENT_NAME']
    }),
    meta_buttons: null
  },
  {
    id_template: 'TPL-025',
    pipeline: 'PROSPECT',
    nama_template: 'Autosend - probe 5',
    template_name_api: 'probe_5',
    language_code: 'id',
    body_text: 'Halo Kak {{1}}, pendaftaran gelombang baru di {{tenant_name}} sudah dibuka. Yuk konsultasikan kesiapanmu bersama tim kami sebelum kuota penuh!',
    kategori: 'auto probe',
    urutan: 10,
    status_crm: 'INACTIVE',
    meta_status: 'DELETED',
    header_type: null,
    header_url: null,
    parameters: JSON.stringify({
      body: ['STUDENT_NAME']
    }),
    meta_buttons: null
  },

  // ── 3. OPPORTUNITY (Commitment Threshold & Decision Consultation) ─
  {
    id_template: 'TPL-005',
    pipeline: 'OPPORTUNITY',
    nama_template: 'Undangan Konsultasi',
    template_name_api: 'undangan_konsultasi',
    language_code: 'id',
    body_text: 'Halo {{1}}, kami mengundang Kakak dan orang tua untuk sesi konsultasi tatap muka gratis bersama {{tenant_name}}. Apakah Kakak ada waktu luang minggu ini?',
    kategori: 'Undangan',
    urutan: 1,
    status_crm: 'INACTIVE',
    meta_status: 'DELETED',
    header_type: null,
    header_url: null,
    parameters: JSON.stringify({
      body: ['STUDENT_NAME']
    }),
    meta_buttons: JSON.stringify([
      { type: 'QUICK_REPLY', text: 'Jadwalkan Konsultasi' },
      { type: 'QUICK_REPLY', text: 'Tanya-tanya Dulu' }
    ])
  },
  {
    id_template: 'TPL-006',
    pipeline: 'OPPORTUNITY',
    nama_template: 'Follow-up Konsultasi',
    template_name_api: 'followup_konsultasi',
    language_code: 'id',
    body_text: 'Halo {{1}}, bagaimana kabarnya? Kami ingin menindaklanjuti hasil sesi konsultasi kita kemarin bersama tim {{tenant_name}}. Ada hal yang perlu didiskusikan kembali bersama keluarga?',
    kategori: 'Follow Up',
    urutan: 2,
    status_crm: 'INACTIVE',
    meta_status: 'DELETED',
    header_type: null,
    header_url: null,
    parameters: JSON.stringify({
      body: ['STUDENT_NAME']
    }),
    meta_buttons: null
  },
  {
    id_template: 'TPL-007',
    pipeline: 'OPPORTUNITY',
    nama_template: 'Reminder Home Visit',
    template_name_api: 'reminder_hv',
    language_code: 'id',
    body_text: 'Halo {{1}}, mengingatkan jadwal kunjungan silaturahmi & konsultasi (Home Visit) dari tim {{tenant_name}} besok. Pastikan orang tua/wali berkenan hadir ya kak.',
    kategori: 'Reminder',
    urutan: 3,
    status_crm: 'INACTIVE',
    meta_status: 'DELETED',
    header_type: null,
    header_url: null,
    parameters: JSON.stringify({
      body: ['STUDENT_NAME']
    }),
    meta_buttons: JSON.stringify([
      { type: 'QUICK_REPLY', text: 'Siap, Jadwal Sesuai' },
      { type: 'QUICK_REPLY', text: 'Mohon Reschedule' }
    ])
  },
  {
    id_template: 'TPL-008',
    pipeline: 'OPPORTUNITY',
    nama_template: 'Konfirmasi Jadwal HV',
    template_name_api: 'konfirmasi_jadwal_hv',
    language_code: 'id',
    body_text: 'Halo {{1}}, kami ingin mengonfirmasi jadwal kunjungan Home Visit tim {{tenant_name}} ke rumah Kakak. Apakah hari dan jam yang direncanakan sudah cocok untuk keluarga?',
    kategori: 'Penjadwalan',
    urutan: 4,
    status_crm: 'INACTIVE',
    meta_status: 'DELETED',
    header_type: null,
    header_url: null,
    parameters: JSON.stringify({
      body: ['STUDENT_NAME']
    }),
    meta_buttons: JSON.stringify([
      { type: 'QUICK_REPLY', text: 'Sudah Cocok' },
      { type: 'QUICK_REPLY', text: 'Ubah Waktu' }
    ])
  },
  {
    id_template: 'TPL-009',
    pipeline: 'OPPORTUNITY',
    nama_template: 'Reschedule Home Visit',
    template_name_api: 'reschedule_hv',
    language_code: 'id',
    body_text: 'Halo {{1}}, terkait penjadwalan ulang sesi kunjungan Home Visit bersama {{tenant_name}}, kira-kira hari apa yang paling luang bagi Kakak dan orang tua?',
    kategori: 'Penjadwalan',
    urutan: 5,
    status_crm: 'INACTIVE',
    meta_status: 'DELETED',
    header_type: null,
    header_url: null,
    parameters: JSON.stringify({
      body: ['STUDENT_NAME']
    }),
    meta_buttons: null
  },
  {
    id_template: 'TPL-010',
    pipeline: 'OPPORTUNITY',
    nama_template: 'Follow-up Home Visit',
    template_name_api: 'followup_hv',
    language_code: 'id',
    body_text: 'Halo {{1}}, terima kasih banyak atas sambutan hangat keluarga saat sesi Home Visit bersama tim {{tenant_name}} kemarin. Semoga informasi yang kami sampaikan bermanfaat ya kak!',
    kategori: 'Follow Up',
    urutan: 6,
    status_crm: 'INACTIVE',
    meta_status: 'DELETED',
    header_type: null,
    header_url: null,
    parameters: JSON.stringify({
      body: ['STUDENT_NAME']
    }),
    meta_buttons: null
  },
  {
    id_template: 'TPL-020',
    pipeline: 'OPPORTUNITY',
    nama_template: 'Push Konsultasi',
    template_name_api: 'benefit_konsultasi',
    language_code: 'id',
    body_text: 'Mengambil keputusan besar dalam merencanakan karir masa depan tentu butuh banyak pertimbangan matang kamu dan keluarga.\n\nSupaya gak salah langkah, saya mengundang kak {{1}} (dan orang tua, jika berkenan) untuk ngobrol santai dalam sesi Pemetaan Karir & Konsultasi Bebas Hambatan di kantor {{tenant_name}}.\n\nDi sesi santai ini, kita hanya akan fokus pada:\n\n🔍 Edukasi Pilihan Kerja: Memetakan minat bidang keahlianmu\n\n💰 Rincian Transparan: Menghitung simulasi tahapan persiapan secara transparan agar bisa didiskusikan dengan keluarga.\n\n🎯 Penilaian Awal: Menilai potensi kecocokanmu terhadap kualifikasi yang dibutuhkan.\n\n*Saya Menjamin :* Sesi ini 100% gratis dan bersifat edukatif tanpa paksaan pendaftaran.\n\nJika setelah itu kamu merasa program ini belum cocok, tidak masalah sama sekali, hak keputusan sepenuhnya di tanganmu.',
    kategori: 'Follow Up',
    urutan: 7,
    status_crm: 'ACTIVE',
    meta_status: 'APPROVED',
    header_type: null,
    header_url: null,
    parameters: JSON.stringify({
      body: ['STUDENT_NAME'],
      meta_buttons: [
        { type: 'QUICK_REPLY', index: 0, text: 'Jadwalkan Sesi (Santai)' },
        { type: 'QUICK_REPLY', index: 1, text: 'Tanya lewat Chat dulu' }
      ]
    }),
    meta_buttons: JSON.stringify([
      { type: 'QUICK_REPLY', text: 'Jadwalkan Sesi (Santai)' },
      { type: 'QUICK_REPLY', text: 'Tanya lewat Chat dulu' }
    ])
  },

  // ── 4. REGISTERED_OPPORTUNITY (Komitmen Formulir & Pre-Core) ─
  {
    id_template: 'TPL-011',
    pipeline: 'REGISTERED_OPPORTUNITY',
    nama_template: 'Reminder Dokumen',
    template_name_api: 'reminder_dokumen',
    language_code: 'id',
    body_text: 'Halo {{1}}, mohon bantuan untuk melengkapi berkas administrasi formulir pendaftaran {{tenant_name}} agar proses pra-pelatihan Kakak dapat segera dijadwalkan ya.',
    kategori: 'Reminder',
    urutan: 1,
    status_crm: 'INACTIVE',
    meta_status: 'DELETED',
    header_type: null,
    header_url: null,
    parameters: JSON.stringify({
      body: ['STUDENT_NAME']
    }),
    meta_buttons: null
  },
  {
    id_template: 'TPL-012',
    pipeline: 'REGISTERED_OPPORTUNITY',
    nama_template: 'Reminder Pendaftaran',
    template_name_api: 'reminder_pendaftaran',
    language_code: 'id',
    body_text: 'Halo {{1}}, batas waktu konfirmasi kuota kelas di {{tenant_name}} akan segera berakhir. Segera selesaikan kelengkapan berkas Anda untuk mengamankan slot keberangkatan!',
    kategori: 'Reminder',
    urutan: 2,
    status_crm: 'INACTIVE',
    meta_status: 'DELETED',
    header_type: null,
    header_url: null,
    parameters: JSON.stringify({
      body: ['STUDENT_NAME']
    }),
    meta_buttons: null
  },
  {
    id_template: 'TPL-BC00DB54',
    pipeline: 'REGISTERED_OPPORTUNITY',
    nama_template: 'push_bayar',
    template_name_api: 'push_bayar',
    language_code: 'id',
    body_text: 'Semangat pagi Kak {{1}}...\n\nSelangkah lagi Kakak akan memulai perjalanan seru persiapan karir bersama {{tenant_name}}.\n\nKuota kelas baru sudah kami siapkan khusus untuk Kakak.\n\nAgar persiapannya tidak tertunda dan bisa berangkat tepat waktu, yuk segera selesaikan administrasi pendaftarannya.\n\nSemakin cepat mulai belajar, semakin cepat juga Kakak bisa meraih karier impian!\n\nButuh bantuan terkait pembayaran? Silakan klik tombol di bawah:',
    kategori: 'closing',
    urutan: 3,
    status_crm: 'ACTIVE',
    meta_status: 'APPROVED',
    header_type: null,
    header_url: null,
    parameters: JSON.stringify({
      body: ['STUDENT_NAME'],
      meta_buttons: [
        { type: 'QUICK_REPLY', index: 0, text: 'Tanya Pilihan Pembayaran' },
        { type: 'QUICK_REPLY', index: 1, text: 'Bayar dan Daftar' }
      ]
    }),
    meta_buttons: JSON.stringify([
      { type: 'QUICK_REPLY', text: 'Tanya Pilihan Pembayaran' },
      { type: 'QUICK_REPLY', text: 'Bayar dan Daftar' }
    ])
  },

  // ── 5. CUSTOMER (Core Conversion DP Pelatihan Tervalidasi) ──
  {
    id_template: 'TPL-013',
    pipeline: 'CUSTOMER',
    nama_template: 'Konfirmasi Pendaftaran',
    template_name_api: 'konfirmasi_daftar',
    language_code: 'id',
    body_text: 'Selamat Kak {{1}}! Pembayaran dan pendaftaran resmi Anda di {{tenant_name}} telah terverifikasi. Selamat bergabung sebagai keluarga besar {{tenant_name}}, jadwal orientasi kelas akan kami infokan segera!',
    kategori: 'Konfirmasi',
    urutan: 1,
    status_crm: 'INACTIVE',
    meta_status: 'DELETED',
    header_type: null,
    header_url: null,
    parameters: JSON.stringify({
      body: ['STUDENT_NAME']
    }),
    meta_buttons: null
  },

  // ── 6. SNOOZE (Re-engagement Minat Tertunda) ────────────────
  {
    id_template: 'TPL--026',
    pipeline: 'SNOOZE',
    nama_template: 'snooze_1, snooze_2, snooze_3',
    template_name_api: 'snooze_campaign',
    language_code: 'id',
    body_text: 'Assalamualaikum kak {{1}}! Semoga kabarnya sehat selalu ya...\n\nMasih ingat waktu kamu menunda minat program karena "belum waktunya/Jangan sekarang"?\n\nHanya ingin mengabarkan saja, saat ini ada beberapa update kemudahan syarat serta program baru yang sedang berjalan di {{tenant_name}}. Siapa tahu peluang kali ini justru sangat pas dengan rencana karier kamu sekarang!\n\nBagaimana, tertarik untuk sekadar tahu info singkatnya dulu? Klik pilihan kamu di bawah ini ya:',
    kategori: 'snooze',
    urutan: 1,
    status_crm: 'ACTIVE',
    meta_status: 'APPROVED',
    header_type: null,
    header_url: null,
    parameters: JSON.stringify({
      body: ['STUDENT_NAME'],
      meta_buttons: [
        { type: 'QUICK_REPLY', index: 0, text: 'Mau tanya program' },
        { type: 'QUICK_REPLY', index: 1, text: 'Jangan sekarang' },
        { type: 'QUICK_REPLY', index: 2, text: 'Hentikan pesan' }
      ]
    }),
    meta_buttons: JSON.stringify([
      { type: 'QUICK_REPLY', text: 'Mau tanya program' },
      { type: 'QUICK_REPLY', text: 'Jangan sekarang' },
      { type: 'QUICK_REPLY', text: 'Hentikan pesan' }
    ])
  }
];

module.exports = {
  DEFAULT_TEMPLATES_LIBRARY
};

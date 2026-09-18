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
 * - REGISTERED
 * - CUSTOMER
 * - SNOOZE
 *
 * Catatan:
 * Seluruh nama brand telah dinetralkan menjadi placeholder `{{tenant_name}}`.
 * ============================================================
 */

const LPK_TEMPLATES = [
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

  // ── 4. REGISTERED (Komitmen Formulir & Pre-Core) ─
  {
    id_template: 'TPL-011',
    pipeline: 'REGISTERED',
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
    pipeline: 'REGISTERED',
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
    pipeline: 'REGISTERED',
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

// ─────────────────────────────────────────────────────────────
// PUSTAKA TEMPLATE KHUSUS TENANT UMUM / NON-LPK (GENERAL)
// ─────────────────────────────────────────────────────────────
const GENERAL_TEMPLATES = [
  // ── 1. LEAD (Onboarding & Initial Qualification) ───────────
  {
    id_template: 'TPL-GEN-001',
    pipeline: 'LEAD',
    target_type: 'general',
    nama_template: 'Welcome Kontak Baru (Bisnis & Umum)',
    template_name_api: 'gen_welcome_lead_v1',
    language_code: 'id',
    body_text: 'Halo Kak {{1}},\n\nTerima kasih telah menghubungi {{tenant_name}}.\n\nUntuk membantu memberikan solusi terbaik, boleh kami tahu apakah kebutuhan Kak {{1}} saat ini untuk keperluan pribadi, bisnis, atau ingin berkonsultasi terlebih dahulu?\n\nSilakan pilih salah satu opsi di bawah ya.',
    kategori: 'Onboarding',
    urutan: 1,
    status_crm: 'ACTIVE',
    meta_status: 'APPROVED',
    header_type: null,
    header_url: null,
    parameters: JSON.stringify({
      body: ['CONTACT_NAME'],
      meta_buttons: [
        { type: 'QUICK_REPLY', index: 0, text: 'Kebutuhan Bisnis' },
        { type: 'QUICK_REPLY', index: 1, text: 'Kebutuhan Pribadi' },
        { type: 'QUICK_REPLY', index: 2, text: 'Konsultasi Dulu' }
      ]
    }),
    meta_buttons: JSON.stringify([
      { type: 'QUICK_REPLY', text: 'Kebutuhan Bisnis' },
      { type: 'QUICK_REPLY', text: 'Kebutuhan Pribadi' },
      { type: 'QUICK_REPLY', text: 'Konsultasi Dulu' }
    ])
  },
  {
    id_template: 'TPL-GEN-002',
    pipeline: 'LEAD',
    target_type: 'general',
    nama_template: 'Katalog Produk & Penjelasan Layanan',
    template_name_api: 'gen_catalog_info_v1',
    language_code: 'id',
    body_text: 'Halo Kak {{1}},\n\nBerikut ringkasan katalog produk dan layanan unggulan dari {{tenant_name}} yang siap membantu kebutuhan Anda:\n\n1. Paket Starter / Standar\n2. Paket Professional\n3. Layanan Kustom / Enterprise\n\nApakah Kak {{1}} ingin kami kirimkan brosur detail dan simulasi harganya?',
    kategori: 'Informasi',
    urutan: 2,
    status_crm: 'ACTIVE',
    meta_status: 'APPROVED',
    header_type: null,
    header_url: null,
    parameters: JSON.stringify({
      body: ['CONTACT_NAME'],
      meta_buttons: [
        { type: 'QUICK_REPLY', index: 0, text: 'Kirim Brosur Harga' },
        { type: 'QUICK_REPLY', index: 1, text: 'Tanya Detail Dulu' }
      ]
    }),
    meta_buttons: JSON.stringify([
      { type: 'QUICK_REPLY', text: 'Kirim Brosur Harga' },
      { type: 'QUICK_REPLY', text: 'Tanya Detail Dulu' }
    ])
  },
  {
    id_template: 'TPL-GEN-003',
    pipeline: 'LEAD',
    target_type: 'general',
    nama_template: 'Follow-up Minat H+1 (General)',
    template_name_api: 'gen_followup_h1_v1',
    language_code: 'id',
    body_text: 'Halo Kak {{1}}, semoga harinya menyenangkan.\n\nMenyambung informasi {{tenant_name}} kemarin, apakah ada hal yang ingin ditanyakan lebih lanjut sebelum kami jadwalkan sesi diskusi lanjutan?\n\nTim kami siap membantu menjawab pertanyaan Kak {{1}}.',
    kategori: 'Follow Up',
    urutan: 3,
    status_crm: 'ACTIVE',
    meta_status: 'APPROVED',
    header_type: null,
    header_url: null,
    parameters: JSON.stringify({
      body: ['CONTACT_NAME'],
      meta_buttons: [
        { type: 'QUICK_REPLY', index: 0, text: 'Ada yang mau ditanya' },
        { type: 'QUICK_REPLY', index: 1, text: 'Sudah cukup jelas' }
      ]
    }),
    meta_buttons: JSON.stringify([
      { type: 'QUICK_REPLY', text: 'Ada yang mau ditanya' },
      { type: 'QUICK_REPLY', text: 'Sudah cukup jelas' }
    ])
  },

  // ── 2. PROSPECT (FNAR & Solution Fit) ───────────────────────
  {
    id_template: 'TPL-GEN-004',
    pipeline: 'PROSPECT',
    target_type: 'general',
    nama_template: 'Kualifikasi Kebutuhan & Eksplorasi Solusi',
    template_name_api: 'gen_solution_fit_v1',
    language_code: 'id',
    body_text: 'Halo Kak {{1}},\n\nBerdasarkan kebutuhan yang Kakak sampaikan, tim {{tenant_name}} telah menyiapkan rekomendasi solusi yang paling pas dan efisien.\n\nBoleh kami konfirmasi estimasi waktu implementasi atau kebutuhan kuantitas yang direncanakan?\n\nSilakan pilih salah satu respon di bawah.',
    kategori: 'Kualifikasi',
    urutan: 4,
    status_crm: 'ACTIVE',
    meta_status: 'APPROVED',
    header_type: null,
    header_url: null,
    parameters: JSON.stringify({
      body: ['CONTACT_NAME'],
      meta_buttons: [
        { type: 'QUICK_REPLY', index: 0, text: 'Bulan Ini' },
        { type: 'QUICK_REPLY', index: 1, text: '1-3 Bulan Kedepan' },
        { type: 'QUICK_REPLY', index: 2, text: 'Masih Eksplorasi' }
      ]
    }),
    meta_buttons: JSON.stringify([
      { type: 'QUICK_REPLY', text: 'Bulan Ini' },
      { type: 'QUICK_REPLY', text: '1-3 Bulan Kedepan' },
      { type: 'QUICK_REPLY', text: 'Masih Eksplorasi' }
    ])
  },
  {
    id_template: 'TPL-GEN-005',
    pipeline: 'PROSPECT',
    target_type: 'general',
    nama_template: 'Kirim Proposal Penawaran Resmi',
    template_name_api: 'gen_send_proposal_v1',
    language_code: 'id',
    body_text: 'Yth. Kak {{1}},\n\nProposal penawaran resmi dari {{tenant_name}} telah kami siapkan sesuai spesifikasi kebutuhan yang didiskusikan.\n\nDokumen lengkap telah kami lampirkan. Apakah Kak {{1}} ingin kami jadwalkan panggilan singkat untuk membedah rincian proposal ini bersama tim pengambil keputusan?',
    kategori: 'Proposal',
    urutan: 5,
    status_crm: 'ACTIVE',
    meta_status: 'APPROVED',
    header_type: null,
    header_url: null,
    parameters: JSON.stringify({
      body: ['CONTACT_NAME'],
      meta_buttons: [
        { type: 'QUICK_REPLY', index: 0, text: 'Jadwalkan Panggilan' },
        { type: 'QUICK_REPLY', index: 1, text: 'Pelajari Dulu' }
      ]
    }),
    meta_buttons: JSON.stringify([
      { type: 'QUICK_REPLY', text: 'Jadwalkan Panggilan' },
      { type: 'QUICK_REPLY', text: 'Pelajari Dulu' }
    ])
  },

  // ── 3. OPPORTUNITY (Decision Consultation & Demo) ───────────
  {
    id_template: 'TPL-GEN-006',
    pipeline: 'OPPORTUNITY',
    target_type: 'general',
    nama_template: 'Undangan Product Demo & Meeting Keputusan',
    template_name_api: 'gen_demo_invite_v1',
    language_code: 'id',
    body_text: 'Halo Kak {{1}},\n\nUntuk memastikan solusi dari {{tenant_name}} berjalan optimal bagi bisnis Anda, kami mengundang Kak {{1}} dalam sesi Live Demo & Konsultasi Teknis (30 Menit).\n\nKira-kira waktu mana yang paling nyaman untuk Anda?',
    kategori: 'Undangan',
    urutan: 6,
    status_crm: 'ACTIVE',
    meta_status: 'APPROVED',
    header_type: null,
    header_url: null,
    parameters: JSON.stringify({
      body: ['CONTACT_NAME'],
      meta_buttons: [
        { type: 'QUICK_REPLY', index: 0, text: 'Pagi (09.00 - 12.00)' },
        { type: 'QUICK_REPLY', index: 1, text: 'Siang (13.00 - 16.00)' },
        { type: 'QUICK_REPLY', index: 2, text: 'Atur Jadwal Lain' }
      ]
    }),
    meta_buttons: JSON.stringify([
      { type: 'QUICK_REPLY', text: 'Pagi (09.00 - 12.00)' },
      { type: 'QUICK_REPLY', text: 'Siang (13.00 - 16.00)' },
      { type: 'QUICK_REPLY', text: 'Atur Jadwal Lain' }
    ])
  },
  {
    id_template: 'TPL-GEN-007',
    pipeline: 'OPPORTUNITY',
    target_type: 'general',
    nama_template: 'Follow-up Negosiasi & Finalisasi Kontrak',
    template_name_api: 'gen_contract_followup_v1',
    language_code: 'id',
    body_text: 'Halo Kak {{1}},\n\nMenindaklanjuti pertemuan kita sebelumnya, kami ingin memastikan apakah ada poin penawaran atau klausul kerjasama dari {{tenant_name}} yang perlu disesuaikan kembali?\n\nKami siap memberikan fleksibilitas terbaik demi kelancaran kolaborasi kita.',
    kategori: 'Follow Up',
    urutan: 7,
    status_crm: 'ACTIVE',
    meta_status: 'APPROVED',
    header_type: null,
    header_url: null,
    parameters: JSON.stringify({
      body: ['CONTACT_NAME'],
      meta_buttons: [
        { type: 'QUICK_REPLY', index: 0, text: 'Siap Lanjut Order' },
        { type: 'QUICK_REPLY', index: 1, text: 'Perlu Revisi Harga' }
      ]
    }),
    meta_buttons: JSON.stringify([
      { type: 'QUICK_REPLY', text: 'Siap Lanjut Order' },
      { type: 'QUICK_REPLY', text: 'Perlu Revisi Harga' }
    ])
  },

  // ── 4. REGISTERED (Order Confirmation / Invoice) ───────────
  {
    id_template: 'TPL-GEN-008',
    pipeline: 'REGISTERED',
    target_type: 'general',
    nama_template: 'Konfirmasi Order & Invoice Pembayaran',
    template_name_api: 'gen_invoice_order_v1',
    language_code: 'id',
    body_text: 'Yth. Kak {{1}},\n\nPemesanan Anda di {{tenant_name}} telah berhasil didaftarkan ke dalam sistem kami.\n\nNomor Invoice: {{2}}\n\nSilakan selesaikan pembayaran sesuai tagihan yang tertera agar pesanan/layanan dapat segera kami proses. Balas pesan ini jika memerlukan bantuan rekening atau konfirmasi.',
    kategori: 'Transaksi',
    urutan: 8,
    status_crm: 'ACTIVE',
    meta_status: 'APPROVED',
    header_type: null,
    header_url: null,
    parameters: JSON.stringify({
      body: ['CONTACT_NAME', 'INVOICE_NUMBER'],
      meta_buttons: [
        { type: 'QUICK_REPLY', index: 0, text: 'Sudah Transfer' },
        { type: 'QUICK_REPLY', index: 1, text: 'Tanya Rekening' }
      ]
    }),
    meta_buttons: JSON.stringify([
      { type: 'QUICK_REPLY', text: 'Sudah Transfer' },
      { type: 'QUICK_REPLY', text: 'Tanya Rekening' }
    ])
  },

  // ── 5. CUSTOMER (Closing & Official Onboarding) ────────────
  {
    id_template: 'TPL-GEN-009',
    pipeline: 'CUSTOMER',
    target_type: 'general',
    nama_template: 'Selamat Datang Pelanggan Resmi (Onboarding)',
    template_name_api: 'gen_welcome_customer_v1',
    language_code: 'id',
    body_text: 'Selamat datang Kak {{1}} di keluarga besar pelanggan {{tenant_name}}!\n\nPembayaran Anda telah kami terima dan diverifikasi resmi. Layanan/produk Anda saat ini telah aktif dan siap digunakan.\n\nJika membutuhkan bantuan teknis atau layanan purna jual, tim support kami siap melayani Anda.',
    kategori: 'Onboarding',
    urutan: 9,
    status_crm: 'ACTIVE',
    meta_status: 'APPROVED',
    header_type: null,
    header_url: null,
    parameters: JSON.stringify({
      body: ['CONTACT_NAME'],
      meta_buttons: [
        { type: 'QUICK_REPLY', index: 0, text: 'Mulai Penggunaan' },
        { type: 'QUICK_REPLY', index: 1, text: 'Hubungi Support' }
      ]
    }),
    meta_buttons: JSON.stringify([
      { type: 'QUICK_REPLY', text: 'Mulai Penggunaan' },
      { type: 'QUICK_REPLY', text: 'Hubungi Support' }
    ])
  },

  // ── 6. SNOOZE (Re-engagement Kontak Pasif) ─────────────────
  {
    id_template: 'TPL-GEN-010',
    pipeline: 'SNOOZE',
    target_type: 'general',
    nama_template: 'Re-engagement Kontak Pasif (General)',
    template_name_api: 'gen_reengage_snooze_v1',
    language_code: 'id',
    body_text: 'Halo Kak {{1}}, sudah cukup lama sejak komunikasi terakhir kita dengan {{tenant_name}}.\n\nKami hanya ingin menyapa dan mengecek apakah kebutuhan terkait produk/layanan Anda saat ini masih berjalan atau sedang ada rencana pengembangan baru?\n\nSilakan pilih respon yang paling sesuai ya.',
    kategori: 'Snooze',
    urutan: 10,
    status_crm: 'ACTIVE',
    meta_status: 'APPROVED',
    header_type: null,
    header_url: null,
    parameters: JSON.stringify({
      body: ['CONTACT_NAME'],
      meta_buttons: [
        { type: 'QUICK_REPLY', index: 0, text: 'Masih Butuh Solusi' },
        { type: 'QUICK_REPLY', index: 1, text: 'Belum Butuh Sekarang' },
        { type: 'QUICK_REPLY', index: 2, text: 'Hentikan Kontak' }
      ]
    }),
    meta_buttons: JSON.stringify([
      { type: 'QUICK_REPLY', text: 'Masih Butuh Solusi' },
      { type: 'QUICK_REPLY', text: 'Belum Butuh Sekarang' },
      { type: 'QUICK_REPLY', text: 'Hentikan Kontak' }
    ])
  }
];

const DEFAULT_TEMPLATES_LIBRARY = [
  ...LPK_TEMPLATES.map(t => ({ ...t, target_type: 'lpk' })),
  ...GENERAL_TEMPLATES
];

module.exports = {
  DEFAULT_TEMPLATES_LIBRARY,
  LPK_TEMPLATES,
  GENERAL_TEMPLATES
};

'use strict';

const STATUS_SEKOLAH = [
  'Belum Visit',
  'Tunggu Visit Ulang',
  'Tunggu Keputusan',
  'Tunggu Jadwal Sosialisasi',
  'Sosialisasi Terjadwal',
  'Sudah Sosialisasi',
  'Tidak Bisa Sosialisasi',
  'Nonaktif / Tutup / Merger'
];

const NEXT_ACTION_SEKOLAH = [
  'Visit Awal',
  'Visit Ulang',
  'Follow Up',
  'Meeting PIC',
  'Jadwalkan Sosialisasi',
  'Laksanakan Sosialisasi',
  'Input Data Siswa',
  'Tidak Ada'
];

const AKTIVITAS_SEKOLAH = [
  'Visit Awal',
  'Visit Ulang',
  'WhatsApp PIC',
  'Telepon PIC',
  'Meeting PIC',
  'Sosialisasi',
  'Input Data Siswa'
];

const AKTIVITAS_EKSTRA_LIST = [
  'WhatsApp PIC',
  'Telepon PIC',
  'Meeting PIC'
];

const HASIL_AKTIVITAS_SEKOLAH = {
  'Belum Bertemu PIC':             { status: 'Tunggu Visit Ulang',        nextAction: 'Visit Ulang' },
  'Diminta Visit Ulang':           { status: 'Tunggu Visit Ulang',        nextAction: 'Visit Ulang' },
  'Menunggu Keputusan':            { status: 'Tunggu Keputusan',          nextAction: 'Follow Up' },
  'Diminta Meeting':               { status: 'Tunggu Keputusan',          nextAction: 'Meeting PIC' },
  'Izin Sosialisasi':              { status: 'Tunggu Jadwal Sosialisasi', nextAction: 'Jadwalkan Sosialisasi' },
  'Jadwal Sosialisasi Disepakati': { status: 'Sosialisasi Terjadwal',     nextAction: 'Laksanakan Sosialisasi' },
  'Jadwal Sosialisasi Ditunda':    { status: 'Tunggu Jadwal Sosialisasi', nextAction: 'Jadwalkan Sosialisasi' },
  'Sosialisasi Selesai':           { status: 'Sudah Sosialisasi',         nextAction: 'Input Data Siswa' },
  'Input Data Siswa Selesai':      { status: 'Sudah Sosialisasi',         nextAction: 'Tidak Ada' },
  'Ditolak Final':                 { status: 'Tidak Bisa Sosialisasi',    nextAction: 'Tidak Ada' },
  'Tutup / Merger':                { status: 'Nonaktif / Tutup / Merger', nextAction: 'Tidak Ada' }
};

const STATUS_SISWA = [
  'Data Masuk',
  'Tunggu alasan penolakan',
  'Calon Prospek',   
  'Prospek Aktif',
  'Konsultasi',
  'Layak Home Visit',
  'Home Visit',
  'Siap Daftar',
  'Terdaftar',
  'Tidak Lanjut'
];

const STATUS_SISWA_CARRY_FORWARD = [
  'Data Masuk',
  'Calon Prospek',   
  'Prospek Aktif',
  'Konsultasi',
  'Layak Home Visit',
  'Home Visit',
  'Siap Daftar'
];

const NEXT_ACTION_SISWA = [
  'Screening',
  'Probing',         
  'Follow Up',
  'Konsultasi',
  'Konsultasi (Lanjutan)',
  'Home Visit',
  'Pendaftaran',
  'Tidak Ada'
];

const AKTIVITAS_SISWA = [
  'WhatsApp',
  'Telepon',
  'Konsultasi',
  'Home Visit',
  'Pendaftaran'
];

const HASIL_AKTIVITAS_SISWA = {
  'Screening Belum Berhasil':  { status: 'Data Masuk',       nextAction: 'Screening' },
  'Screening Dihentikan':      { status: 'Tidak Lanjut',     nextAction: 'Tidak Ada' },
  'Probing on Progress':       { status: 'Calon Prospek',    nextAction: 'Probing' },  
  'Prospek Aktif':             { status: 'Prospek Aktif',    nextAction: 'Konsultasi' },
  'Konsultasi Dijadwalkan':    { status: 'Konsultasi',       nextAction: 'Konsultasi' },
  'Layak Home Visit':          { status: 'Layak Home Visit', nextAction: 'Home Visit' },
  'Home Visit Selesai':        { status: 'Home Visit',       nextAction: 'Follow Up' },
  'Siap Daftar':               { status: 'Siap Daftar',      nextAction: 'Pendaftaran' },
  'Berhasil Daftar':           { status: 'Terdaftar',        nextAction: 'Tidak Ada' },
  'Ditunda':                   { status: 'Prospek Aktif',    nextAction: 'Follow Up' },
  'Tidak Berminat':            { status: 'Tidak Lanjut',     nextAction: 'Tidak Ada' },
  'Tidak Memenuhi Syarat':     { status: 'Tidak Lanjut',     nextAction: 'Tidak Ada' }
};

const ALASAN_TIDAK_LANJUT_SISWA = [
  'Tidak pernah merespons',
  'Nomor tidak aktif',
  'Nomor salah',
  'Tidak menggunakan WhatsApp',
  'Tidak berminat',
  'Tidak memenuhi syarat usia',
  'Tidak memenuhi syarat kesehatan awal',
  'Orang tua tidak mengizinkan',
  'Memilih kuliah',
  'Memilih bekerja di Indonesia',
  'Lainnya'
];

const ALASAN_DITOLAK_SEKOLAH = [
  'Kebijakan Kepala Sekolah',
  'Kebijakan Yayasan',
  'Sudah bekerja sama dengan lembaga lain',
  'Tidak menerima lembaga luar',
  'Tidak ada kelas XII',
  'Jurusan tidak sesuai',
  'Waktu tidak memungkinkan',
  'Lainnya'
];

const STATUS_HOME_VISIT = [
  'Menunggu Home Visit',
  'Home Visit Terjadwal',
  'Home Visit Selesai',
  'Tidak Berhasil'
];

const NEXT_ACTION_HOME_VISIT = [
  'Jadwalkan Home Visit',
  'Laksanakan Home Visit',
  'Follow Up',
  'Tidak Ada'
];

const AKTIVITAS_HOME_VISIT = [
  'WhatsApp Orang Tua',
  'Telepon Orang Tua',
  'Home Visit'
];

const HASIL_AKTIVITAS_HOME_VISIT = {
  'Jadwal Home Visit Disepakati': { status: 'Home Visit Terjadwal', nextAction: 'Laksanakan Home Visit' },
  'Jadwal Home Visit Ditunda':    { status: 'Menunggu Home Visit',  nextAction: 'Jadwalkan Home Visit' },
  'Home Visit Berhasil':          { status: 'Home Visit Selesai',   nextAction: 'Tidak Ada' },
  'Perlu Follow Up Orang Tua':    { status: 'Home Visit Selesai',   nextAction: 'Follow Up' },
  'Ditolak Orang Tua':            { status: 'Tidak Berhasil',       nextAction: 'Tidak Ada' },
  'Tidak Bertemu Orang Tua':      { status: 'Menunggu Home Visit',  nextAction: 'Jadwalkan Home Visit' }
};

const ALASAN_TIDAK_LANJUT_HV = [
  'Tidak ada biaya',
  'Orang tua tidak mengizinkan',
  'Memilih kuliah',
  'Memilih bekerja di Indonesia',
  'Tidak berminat',
  'Lainnya'
];

const STATUS_JADWAL = [
  'Terjadwal',
  'Menunggu Penjadwalan',
  'Coba lagi tahun depan',
  'Tidak ada jadwal'
];

const JENIS_SEKOLAH = [
  'SMA',
  'SMK',
  'MA',
  'Lainnya'
];

const STATUS_KEPEMILIKAN_SEKOLAH = [
  'Negeri',
  'Swasta'
];

const SCHEDULABLE_ACTIONS = [
  'Visit Awal',
  'Visit Ulang',
  'Jadwalkan Sosialisasi',
  'Laksanakan Sosialisasi',
  'Meeting PIC',
  'Jadwalkan Home Visit',
  'Laksanakan Home Visit'
];

const HASIL_BUTUH_ALASAN_SISWA = [
  'Screening Dihentikan',
  'Tidak Berminat',
  'Tidak Memenuhi Syarat'
];

const HASIL_BUTUH_ALASAN_SEKOLAH = [
  'Ditolak Final'
];

const HASIL_BUTUH_ALASAN_HV = [
  'Ditolak Orang Tua'
];

const ROLES = [
  'Admin',
  'Manager',
  'CRO'
];

module.exports = {
  STATUS_SEKOLAH,
  NEXT_ACTION_SEKOLAH,
  AKTIVITAS_SEKOLAH,
  AKTIVITAS_EKSTRA_LIST,
  HASIL_AKTIVITAS_SEKOLAH,
  STATUS_SISWA,
  STATUS_SISWA_CARRY_FORWARD,
  NEXT_ACTION_SISWA,
  AKTIVITAS_SISWA,
  HASIL_AKTIVITAS_SISWA,
  ALASAN_TIDAK_LANJUT_SISWA,
  ALASAN_DITOLAK_SEKOLAH,
  STATUS_HOME_VISIT,
  NEXT_ACTION_HOME_VISIT,
  AKTIVITAS_HOME_VISIT,
  HASIL_AKTIVITAS_HOME_VISIT,
  ALASAN_TIDAK_LANJUT_HV,
  STATUS_JADWAL,
  JENIS_SEKOLAH,
  STATUS_KEPEMILIKAN_SEKOLAH,
  SCHEDULABLE_ACTIONS,
  HASIL_BUTUH_ALASAN_SISWA,
  HASIL_BUTUH_ALASAN_SEKOLAH,
  HASIL_BUTUH_ALASAN_HV,
  ROLES
};

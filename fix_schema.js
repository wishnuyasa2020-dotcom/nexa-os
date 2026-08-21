const fs = require('fs');
const file = './src/modules/crm/crm.siswa.service.js';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(/sp\.pj_cro/g, 'sp.cro');
code = code.replace(/ms\.id/g, 'ms.id_siswa');
code = code.replace(/ms\.no_wa/g, 'ms.wa');
code = code.replace(/ms\.prioritas/g, 'sp.prioritas');
code = code.replace(/WHERE id =/g, 'WHERE id_siswa =');
code = code.replace(/IFNULL\(ms\.id_siswa/g, 'IFNULL(ms.id_siswa');
code = code.replace(/IFNULL\(sp\.id_record/g, 'IFNULL(sp.id_record');
code = code.replace(/SELECT id FROM master_siswa/g, 'SELECT id_siswa FROM master_siswa');

// Manual fixes for INSERT/UPDATE
code = code.replace(/UPDATE master_siswa SET\s+nama_lengkap = \?, no_wa = \?, kelas = \?, minat_awal = \?, rencana_lulus = \?, prioritas = \?/, 'UPDATE master_siswa SET \\n        nama_lengkap = ?, wa = ?, kelas = ?, minat_awal = ?, rencana_lulus = ?');
code = code.replace(/data\.rencana_lulus \|\| rows\[0\]\.rencana_lulus,\n\s+prioritasBaru,\n\s+id/, 'data.rencana_lulus || rows[0].rencana_lulus,\\n      id');
code = code.replace(/UPDATE siswa_periode SET pj_cro = \? WHERE id_siswa = \? AND marketing_period = \?/, 'UPDATE siswa_periode SET cro = ?, prioritas = ? WHERE id_siswa = ? AND marketing_period = ?');
code = code.replace(/\[data\.pj_cro, id, mp\]/, '[data.pj_cro, prioritasBaru, id, mp]');

code = code.replace(/INSERT INTO master_siswa \(id, id_sekolah, nama_lengkap, no_wa, kelas, minat_awal, rencana_lulus, prioritas\)/g, 'INSERT INTO master_siswa (id_siswa, id_sekolah, nama_lengkap, wa, kelas, minat_awal, rencana_lulus)');
code = code.replace(/row\.rencana_lulus \|\| 'Belum Tahu', prioritas\]\)/g, "row.rencana_lulus || 'Belum Tahu'])");
code = code.replace(/data\.rencana_lulus \|\| 'Belum Tahu', prioritas\]\)/, "data.rencana_lulus || 'Belum Tahu'])");

code = code.replace(/INSERT INTO siswa_periode \(id_siswa, marketing_period, status_terkini, next_action, due_date, pj_cro\)/g, 'INSERT INTO siswa_periode (id_siswa, nama_siswa, marketing_period, status_terkini, next_action, due_date, cro, prioritas)');
code = code.replace(/DATE_ADD\(CURDATE\(\), INTERVAL 1 DAY\), \?\]\)/g, "DATE_ADD(CURDATE(), INTERVAL 1 DAY), ?, ?])");
code = code.replace(/\[idSiswa, mp, croName\]/g, '[idSiswa, row.nama_lengkap, mp, croName, prioritas]');
code = code.replace(/\[idSiswa, mp, data\.pj_cro\]/, '[idSiswa, data.nama_lengkap, mp, data.pj_cro, prioritasBaru]'); // wait, data.pj_cro vs user.nama?
// In tambahSiswa: [idSiswa, mp, user.role === 'CRO' ? user.nama : (data.pj_cro || user.nama)]
// Original was: [idSiswa, mp, pjCro] -> wait, let's just replace `[idSiswa, mp, pjCro]`
code = code.replace(/\[idSiswa, mp, pjCro\]/, '[idSiswa, data.nama_lengkap, mp, pjCro, prioritasBaru]');

code = code.replace(/SELECT\s+ms\.id_siswa, ms\.id_sekolah, sek\.nama_sekolah as nama_sekolah, ms\.nama_lengkap,\s+ms\.wa, ms\.bsuid, ms\.kelas, ms\.minat_awal, ms\.rencana_lulus, sp\.prioritas,\s+sp\.status_terkini, sp\.next_action, DATE_FORMAT\(sp\.due_date, '%Y-%m-%d'\) as due_date, sp\.cro, sp\.orangtua_tahu, sp\.alasan_tidak_lanjut/s, 
  "SELECT ms.id_siswa as id, ms.id_sekolah, sek.nama_sekolah as nama_sekolah, ms.nama_lengkap, ms.wa as no_wa, ms.kelas, ms.minat_awal, ms.rencana_lulus, sp.prioritas, sp.status_terkini, sp.next_action, DATE_FORMAT(sp.due_date, '%Y-%m-%d') as due_date, sp.cro as pj_cro, ms.orangtua_tahu, sp.alasan_tidak_lanjut");

fs.writeFileSync(file, code);
console.log('Fixed crm.siswa.service.js');

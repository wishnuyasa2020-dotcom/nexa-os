'use strict';

/**
 * crm.siswa.service.js
 * Service RESTful Modul Siswa — nexa-crm-web integration
 */

const { pool, mainPool } = require('../../config/database');

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Cek Kuota Siswa di Main Registry
// ─────────────────────────────────────────────────────────────────────────────
async function _checkSiswaLimits(requiredCount = 1) {
  const { tenantStorage } = require('../../config/database');
  let tenantId = tenantStorage.getStore();
  
  if (!tenantId) {
    const dbName = process.env.DB_NAME;
    const [dbRows] = await mainPool.query("SELECT tenant_id FROM tenant_databases WHERE db_name = ?", [dbName]);
    if (dbRows.length === 0) return { tenantId: null }; 
    tenantId = dbRows[0].tenant_id;
  }

  // 2. Get limits from tenants
  const [tenantRows] = await mainPool.query("SELECT limit_siswa, used_siswa FROM tenants WHERE tenant_id = ?", [tenantId]);
  if (tenantRows.length === 0) return { tenantId };

  const { limit_siswa, used_siswa } = tenantRows[0];
  const sisa = (limit_siswa || 0) - (used_siswa || 0);

  if (sisa < requiredCount) {
    throw new Error(`Kuota input siswa telah habis atau tidak mencukupi (Sisa: ${sisa}, Dibutuhkan: ${requiredCount}). Silakan upgrade tier.`);
  }

  return { tenantId };
}

async function _incrementUsedSiswa(tenantId, incrementCount) {
  if (!tenantId) return;
  await mainPool.query("UPDATE tenants SET used_siswa = used_siswa + ? WHERE tenant_id = ?", [incrementCount, tenantId]);
}

// Konstanta Hasil Aktivitas (dari modul-siswa.md)
const HASIL_AKTIVITAS_SISWA = {
  'Screening Belum Berhasil':     { status: 'Data Masuk',       nextAction: 'Screening' },
  'Screening Dihentikan':         { status: 'Tidak Lanjut',     nextAction: 'Tidak Ada', isTerminal: true, requiresAlasan: true },
  'Probing on Progress':          { status: 'Calon Prospek',    nextAction: 'Probing' },
  'Prospek Aktif':                { status: 'Prospek Aktif',    nextAction: 'Konsultasi' },
  'Konsultasi Dijadwalkan':       { status: 'Konsultasi',       nextAction: 'Konsultasi' },
  'Layak Home Visit':             { status: 'Layak Home Visit', nextAction: 'Home Visit' },
  'Home Visit Selesai':           { status: 'Home Visit',       nextAction: 'Follow Up' },
  'Siap Daftar':                  { status: 'Siap Daftar',      nextAction: 'Pendaftaran' },
  'Berhasil Daftar':              { status: 'Terdaftar',        nextAction: 'Tidak Ada', isTerminal: true },
  'Ditunda':                      { status: 'Prospek Aktif',    nextAction: 'Follow Up' },
  'Tidak Berminat':               { status: 'Tidak Lanjut',     nextAction: 'Tidak Ada', isTerminal: true, requiresAlasan: true },
  'Tdk Memenuhi Syarat':          { status: 'Tidak Lanjut',     nextAction: 'Tidak Ada', isTerminal: true, requiresAlasan: true },
};

function hitungPrioritas(minatAwal, rencanaLulus) {
  if (minatAwal === 'Ya' && rencanaLulus === 'Kerja') {
    return 'Tinggi';
  } else if (minatAwal === 'Ya' || (minatAwal === 'Ragu' && rencanaLulus === 'Kerja')) {
    return 'Sedang';
  } else {
    return 'Rendah';
  }
}

async function getActivePeriod() {
  const [rows] = await pool.query(
    "SELECT nama_period FROM marketing_period WHERE status = 'aktif' ORDER BY created_date DESC LIMIT 1"
  );
  return rows.length > 0 ? rows[0].nama_period : '-';
}

function cleanPhone(wa) {
  return wa ? String(wa).replace(/[^0-9]/g, '') : '';
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/siswa — List dengan filter & paginasi
// ─────────────────────────────────────────────────────────────────────────────
async function listSiswa(user, query = {}) {
  let mp = query.period || user.selectedPeriod;
  if (!mp || mp === '-') mp = await getActivePeriod();

  const page = Math.max(1, parseInt(query.page || '1', 10));
  const pageSize = 20;
  const offset = (page - 1) * pageSize;

  const whereParts = ['sp.marketing_period = ?'];
  const params = [mp];

  if (user.role === 'CRO') {
    whereParts.push('sp.cro = ?');
    params.push(user.nama);
  } else if (query.cro) {
    whereParts.push('sp.cro = ?');
    params.push(query.cro);
  }

  if (query.status) { whereParts.push('sp.status_terkini = ?'); params.push(query.status); }
  if (query.kelas) { whereParts.push('mk.nama_kelas = ?'); params.push(query.kelas); }
  if (query.prioritas) { whereParts.push('sp.prioritas = ?'); params.push(query.prioritas); }
  
  if (query.search) {
    const s = `%${query.search}%`;
    whereParts.push('(ms.nama_lengkap LIKE ? OR sp.id_siswa LIKE ? OR sek.nama_sekolah LIKE ?)');
    params.push(s, s, s);
  }

  const where = whereParts.join(' AND ');

  const countSql = `
    SELECT COUNT(sp.id_siswa) as total FROM siswa_periode sp
    LEFT JOIN master_siswa ms ON sp.id_siswa = ms.id_siswa
    LEFT JOIN master_kelas mk ON ms.kelas_id = mk.id
    LEFT JOIN master_sekolah sek ON ms.id_sekolah = sek.id_sekolah
    WHERE ${where}
  `;

  const [[{ total }]] = await pool.query(countSql, params);
  const totalCount = parseInt(total, 10);
  if (totalCount === 0) return { data: [], total: 0, page, pageSize, totalPages: 0 };

  const dataSql = `
    SELECT
      IFNULL(ms.id_siswa, '') as id,
      IFNULL(sp.id_siswa, '') as idRecord,
      IFNULL(ms.nama_lengkap, '') as nama,
      IFNULL(sek.nama_sekolah, '') as namaSekolah,
      IFNULL(mk.nama_kelas, '') as kelas,
      IFNULL(sp.cro, '') as cro,
      IFNULL(sp.status_terkini, '') as status,
      IFNULL(sp.next_action, '') as nextAction,
      IFNULL(sp.prioritas, '') as prioritas,
      IFNULL(DATE_FORMAT(sp.due_date, '%Y-%m-%d'), '') as dueDate,
      ms.wa,
      ms.bsuid
    FROM siswa_periode sp
    LEFT JOIN master_siswa ms ON sp.id_siswa = ms.id_siswa
    LEFT JOIN master_kelas mk ON ms.kelas_id = mk.id
    LEFT JOIN master_sekolah sek ON ms.id_sekolah = sek.id_sekolah
    WHERE ${where}
    ORDER BY sp.due_date ASC
    LIMIT ${pageSize} OFFSET ${offset}
  `;

  const [rows] = await pool.query(dataSql, params);
  
  return { data: rows, total: totalCount, page, pageSize, totalPages: Math.ceil(totalCount / pageSize) };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/siswa/:id — Detail
// ─────────────────────────────────────────────────────────────────────────────
async function detailSiswa(id, user, query = {}) {
  let mp = query.period || user.selectedPeriod;
  if (!mp || mp === '-') mp = await getActivePeriod();

  const [rows] = await pool.query(`
    SELECT
      ms.id_siswa, ms.id_sekolah, sek.nama_sekolah as nama_sekolah, ms.nama_lengkap, 
      ms.wa, ms.bsuid, mk.nama_kelas as kelas, ms.minat_awal, ms.rencana_lulus, sp.prioritas,
      sp.status_terkini, sp.next_action, DATE_FORMAT(sp.due_date, '%Y-%m-%d') as due_date, sp.cro as pj_cro, ms.orangtua_tahu, sp.alasan_tidak_lanjut
    FROM master_siswa ms
    LEFT JOIN master_kelas mk ON ms.kelas_id = mk.id
    LEFT JOIN siswa_periode sp ON ms.id_siswa = sp.id_siswa AND sp.marketing_period = ?
    LEFT JOIN master_sekolah sek ON ms.id_sekolah = sek.id_sekolah
    WHERE ms.id_siswa = ?
  `, [mp, id]);

  if (rows.length === 0) return null;
  const siswa = rows[0];

  // Pastikan CRO hanya bisa lihat data asuhannya sendiri (jika status pipeline ada)
  if (user.role === 'CRO' && siswa.cro && String(siswa.cro).toLowerCase() !== String(user.nama).toLowerCase()) {
    throw new Error('Unauthorized: Siswa ini bukan dalam tanggung jawab Anda.');
  }

  // Get log aktivitas
  const [logs] = await pool.query(
    "SELECT *, DATE_FORMAT(tanggal, '%Y-%m-%d') as tanggal FROM aktivitas_siswa WHERE id_siswa = ? ORDER BY tanggal DESC, created_at DESC",
    [id]
  );

  return { ...siswa, logs };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/siswa — Tambah Siswa Baru
// ─────────────────────────────────────────────────────────────────────────────
async function tambahSiswa(data, user) {
  let mp = data.period || user.selectedPeriod;
  if (!mp || mp === '-') mp = await getActivePeriod();

  // Validate required
  if (!data.nama_lengkap || (!data.no_wa && !data.bsuid) || !data.id_sekolah || !data.minat_awal || !data.rencana_lulus) {
    throw new Error('Data tidak lengkap (nama, kontak (wa/bsuid), sekolah, minat, rencana lulus wajib).');
  }

  // ── Validasi Kuota Ingestion ──
  const { tenantId } = await _checkSiswaLimits(1);

  // Hitung prioritas
  const prioritas = hitungPrioritas(data.minat_awal, data.rencana_lulus);
  const waClean = cleanPhone(data.no_wa);
  
  // Generate ID: STD-{timestamp}-{rand}
  const idSiswa = `STD-${Date.now().toString().slice(-6)}-${Math.floor(Math.random()*1000)}`;
  const pjCro = data.pj_cro || (user.role === 'CRO' ? user.nama : null);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    
    // ── Resolve kelas_id ──
    let kelasId = data.kelas_id;
    if (!kelasId && data.kelas) {
      const [kRows] = await conn.query('SELECT id FROM master_kelas WHERE nama_kelas = ?', [data.kelas]);
      if (kRows.length > 0) {
        kelasId = kRows[0].id;
      } else {
        const [insResult] = await conn.query('INSERT INTO master_kelas (nama_kelas) VALUES (?)', [data.kelas]);
        kelasId = insResult.insertId;
      }
    }

    // ── Validasi: 1 Kelas 1 CRO (di sekolah & periode yang sama) ──
    if (kelasId && pjCro) {
      const [existingCroRow] = await conn.query(`
        SELECT sp.cro 
        FROM siswa_periode sp
        JOIN master_siswa ms ON ms.id_siswa = sp.id_siswa
        WHERE ms.id_sekolah = ? AND ms.kelas_id = ? AND sp.marketing_period = ?
        LIMIT 1
      `, [data.id_sekolah, kelasId, mp]);
      
      if (existingCroRow.length > 0) {
        const existingCro = existingCroRow[0].cro;
        if (existingCro !== pjCro) {
          throw new Error(`Kelas ini sudah dipegang oleh CRO lain (${existingCro}). Satu kelas di suatu sekolah hanya boleh dipegang oleh satu CRO.`);
        }
      }
    }
    
    // Check duplikat nomor WA atau BSUID
    if (waClean) {
      const [existing] = await conn.query("SELECT id_siswa FROM master_siswa WHERE wa = ?", [waClean]);
      if (existing.length > 0) {
        throw new Error(`Nomor WA ${waClean} sudah terdaftar di sistem.`);
      }
    }
    if (data.bsuid) {
      const [existing] = await conn.query("SELECT id_siswa FROM master_siswa WHERE bsuid = ?", [data.bsuid]);
      if (existing.length > 0) {
        throw new Error(`BSUID ${data.bsuid} sudah terdaftar di sistem.`);
      }
    }

    // Insert master_siswa
    await conn.query(`
      INSERT INTO master_siswa 
      (id_siswa, id_sekolah, nama_lengkap, wa, bsuid, kelas_id, minat_awal, rencana_lulus)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [idSiswa, data.id_sekolah, data.nama_lengkap, waClean || null, data.bsuid || null, kelasId || null, data.minat_awal, data.rencana_lulus]);

    // Insert siswa_periode (default Data Masuk)
    await conn.query(`
      INSERT INTO siswa_periode 
      (id_siswa, nama_siswa, marketing_period, status_terkini, next_action, due_date, cro, prioritas)
      VALUES (?, ?, ?, ?, ?, DATE_ADD(CURDATE(), INTERVAL 1 DAY), ?, ?)
    `, [idSiswa, data.nama_lengkap, mp, 'Data Masuk', 'Screening', pjCro, prioritas]);

    await conn.commit();

    // Increment Kuota setelah sukses
    await _incrementUsedSiswa(tenantId, 1).catch(e => console.error("Gagal increment used_siswa:", e));

    return { id: idSiswa, prioritas, status: 'Data Masuk' };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/v1/siswa/:id — Edit Master Siswa
// ─────────────────────────────────────────────────────────────────────────────
async function editSiswa(id, data, user) {
  if (user.role === 'CRO') throw new Error('Hanya Admin/Manager yang bisa mengedit biodata master siswa.');

  // Check
  const [rows] = await pool.query("SELECT * FROM master_siswa WHERE id_siswa = ?", [id]);
  if (rows.length === 0) throw new Error('Siswa tidak ditemukan.');
  
  const prioritasBaru = hitungPrioritas(data.minat_awal || rows[0].minat_awal, data.rencana_lulus || rows[0].rencana_lulus);
  const waClean = cleanPhone(data.no_wa || rows[0].wa);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    let kelasId = data.kelas_id || rows[0].kelas_id;
    if (!data.kelas_id && data.kelas) {
      const [kRows] = await conn.query('SELECT id FROM master_kelas WHERE nama_kelas = ?', [data.kelas]);
      if (kRows.length > 0) {
        kelasId = kRows[0].id;
      } else {
        const [insResult] = await conn.query('INSERT INTO master_kelas (nama_kelas) VALUES (?)', [data.kelas]);
        kelasId = insResult.insertId;
      }
    }

    await conn.query(`
      UPDATE master_siswa SET 
        nama_lengkap = ?, wa = ?, bsuid = ?, kelas_id = ?, minat_awal = ?, rencana_lulus = ?
      WHERE id_siswa = ?
    `, [
      data.nama_lengkap || rows[0].nama_lengkap,
      waClean || null,
      data.bsuid || rows[0].bsuid || null,
      kelasId,
      data.minat_awal || rows[0].minat_awal,
      data.rencana_lulus || rows[0].rencana_lulus,
      id
    ]);

    if (data.pj_cro) {
      let mp = user.selectedPeriod;
      if (!mp || mp === '-') mp = await getActivePeriod();
      await conn.query("UPDATE siswa_periode SET cro = ?, prioritas = ? WHERE id_siswa = ? AND marketing_period = ?", [data.pj_cro, prioritasBaru, id, mp]);
    }

    await conn.commit();
    return { id, prioritas: prioritasBaru };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/v1/siswa/:id — Hapus Siswa (Hard Delete)
// ─────────────────────────────────────────────────────────────────────────────
async function hapusSiswa(id, user) {
  if (user.role === 'CRO') throw new Error('Hanya Admin/Manager yang bisa menghapus siswa.');

  const [aktivitas] = await pool.query("SELECT id FROM aktivitas_siswa WHERE id_siswa = ?", [id]);
  if (aktivitas.length > 0) {
    throw new Error('BLOCKED_HAS_ACTIVITY'); // Frontend akan parse error ini
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM siswa_periode WHERE id_siswa = ?", [id]);
    await conn.query("DELETE FROM master_siswa WHERE id_siswa = ?", [id]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/siswa/:id/aktivitas — Input Aktivitas Baru
// ─────────────────────────────────────────────────────────────────────────────
async function inputAktivitas(id, data, user) {
  let mp = user.selectedPeriod;
  if (!mp || mp === '-') mp = await getActivePeriod();

  const [periodeRows] = await pool.query("SELECT * FROM siswa_periode WHERE id_siswa = ? AND marketing_period = ?", [id, mp]);
  if (periodeRows.length === 0) throw new Error('Siswa tidak terdaftar di periode ini.');
  
  const statusSebelum = periodeRows[0].status_terkini;
  const config = HASIL_AKTIVITAS_SISWA[data.hasil_aktivitas];
  if (!config) throw new Error('Hasil aktivitas tidak dikenali oleh sistem CRM.');

  if (config.requiresAlasan && !data.alasan_tidak_lanjut) {
    throw new Error('Alasan wajib diisi untuk hasil aktivitas ini.');
  }

  const statusSesudah = config.status;
  const nextAction = config.nextAction;
  const dueDate = config.isTerminal ? null : data.due_date;
  const pjCro = user.role === 'CRO' ? user.nama : (data.pj_cro || user.nama);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(`
      INSERT INTO aktivitas_siswa 
      (id_siswa, jenis_aktivitas, tanggal, hasil_aktivitas, status_sebelum, status_sesudah, next_action, due_date, catatan, alasan_tidak_lanjut, pj_cro)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, data.jenis_aktivitas, data.tanggal || new Date(), data.hasil_aktivitas, 
      statusSebelum, statusSesudah, nextAction, dueDate, data.catatan, data.alasan_tidak_lanjut || null, pjCro
    ]);

    await conn.query(`
      UPDATE siswa_periode 
      SET status_terkini = ?, next_action = ?, due_date = ?, alasan_tidak_lanjut = ?
      WHERE id_siswa = ? AND marketing_period = ?
    `, [statusSesudah, nextAction, dueDate, data.alasan_tidak_lanjut || null, id, mp]);

    await conn.commit();
    return { statusSesudah, nextAction };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/v1/siswa/:id/aktivitas/:logId/koreksi — Koreksi Aktivitas
// ─────────────────────────────────────────────────────────────────────────────
async function koreksiAktivitas(idSiswa, logId, data, user) {
  const [logRows] = await pool.query("SELECT * FROM aktivitas_siswa WHERE id = ? AND id_siswa = ?", [logId, idSiswa]);
  if (logRows.length === 0) throw new Error('Log aktivitas tidak ditemukan.');
  
  const log = logRows[0];
  const now = new Date();
  const logTime = new Date(log.created_at);
  const diffHours = (now - logTime) / (1000 * 60 * 60);

  if (user.role === 'CRO' && diffHours > 1) {
    throw new Error('Batas waktu koreksi untuk CRO maksimal 1 jam setelah diinput.');
  }
  if (user.role === 'Manager' && diffHours > 24) {
    throw new Error('Batas waktu koreksi untuk Manager maksimal 24 jam.');
  }

  const config = HASIL_AKTIVITAS_SISWA[data.hasil_aktivitas];
  if (!config) throw new Error('Hasil aktivitas tidak dikenali oleh sistem CRM.');

  const statusSesudah = config.status;
  const nextAction = config.nextAction;
  const dueDate = config.isTerminal ? null : data.due_date;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(`
      UPDATE aktivitas_siswa 
      SET jenis_aktivitas = ?, hasil_aktivitas = ?, status_sesudah = ?, next_action = ?, due_date = ?, catatan = ?
      WHERE id = ?
    `, [data.jenis_aktivitas, data.hasil_aktivitas, statusSesudah, nextAction, dueDate, data.catatan, logId]);

    // Override siswa_periode if this is the latest log
    const [latest] = await conn.query("SELECT id FROM aktivitas_siswa WHERE id_siswa = ? ORDER BY created_at DESC LIMIT 1", [idSiswa]);
    if (latest.length > 0 && latest[0].id == logId) {
      let mp = user.selectedPeriod;
      if (!mp || mp === '-') mp = await getActivePeriod();
      
      await conn.query(`
        UPDATE siswa_periode 
        SET status_terkini = ?, next_action = ?, due_date = ?
        WHERE id_siswa = ? AND marketing_period = ?
      `, [statusSesudah, nextAction, dueDate, idSiswa, mp]);
    }

    await conn.commit();
    return { statusSesudah, nextAction };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/siswa/batch — Import Massal dari Excel
// ─────────────────────────────────────────────────────────────────────────────
async function importBatch(dataBatch, croName, user) {
  if (!Array.isArray(dataBatch) || dataBatch.length === 0) throw new Error('Data batch kosong.');
  if (!croName) throw new Error('CRO penanggung jawab wajib diisi saat import.');

  // ── Validasi Kuota Ingestion Batch ──
  const { tenantId } = await _checkSiswaLimits(dataBatch.length);

  let mp = user.selectedPeriod;
  if (!mp || mp === '-') mp = await getActivePeriod();

  const conn = await pool.getConnection();
  let successCount = 0;
  let skipCount = 0;

  try {
    await conn.beginTransaction();

    for (const row of dataBatch) {
      if (!row.nama_lengkap || (!row.no_wa && !row.bsuid) || !row.id_sekolah) {
        skipCount++; continue;
      }
      const waClean = cleanPhone(row.no_wa);
      if (waClean) {
        const [existing] = await conn.query("SELECT id_siswa FROM master_siswa WHERE wa = ?", [waClean]);
        if (existing.length > 0) {
          skipCount++; continue;
        }
      }
      if (row.bsuid) {
        const [existing] = await conn.query("SELECT id_siswa FROM master_siswa WHERE bsuid = ?", [row.bsuid]);
        if (existing.length > 0) {
          skipCount++; continue;
        }
      }

      // ── Resolve kelas_id ──
      let kelasId = row.kelas_id;
      if (!kelasId && row.kelas) {
        const [kRows] = await conn.query('SELECT id FROM master_kelas WHERE nama_kelas = ?', [row.kelas]);
        if (kRows.length > 0) {
          kelasId = kRows[0].id;
        } else {
          const [insResult] = await conn.query('INSERT INTO master_kelas (nama_kelas) VALUES (?)', [row.kelas]);
          kelasId = insResult.insertId;
        }
      }

      // ── Validasi: 1 Kelas 1 CRO ──
      if (kelasId && croName) {
        const [existingCroRow] = await conn.query(`
          SELECT sp.cro 
          FROM siswa_periode sp
          JOIN master_siswa ms ON ms.id_siswa = sp.id_siswa
          WHERE ms.id_sekolah = ? AND ms.kelas_id = ? AND sp.marketing_period = ?
          LIMIT 1
        `, [row.id_sekolah, kelasId, mp]);
        
        if (existingCroRow.length > 0) {
          const existingCro = existingCroRow[0].cro;
          if (existingCro !== croName) {
            skipCount++; continue; // Kelas ini sudah milik CRO lain, skip row ini
          }
        }
      }

      const idSiswa = `STD-${Date.now().toString().slice(-6)}-${Math.floor(Math.random()*1000)}`;
      const prioritas = hitungPrioritas(row.minat_awal || 'Ragu', row.rencana_lulus || 'Belum Tahu');

      await conn.query(`
        INSERT INTO master_siswa (id_siswa, id_sekolah, nama_lengkap, wa, bsuid, kelas_id, minat_awal, rencana_lulus)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [idSiswa, row.id_sekolah, row.nama_lengkap, waClean || null, row.bsuid || null, kelasId || null, row.minat_awal || 'Ragu', row.rencana_lulus || 'Belum Tahu']);

      await conn.query(`
        INSERT INTO siswa_periode (id_siswa, nama_siswa, marketing_period, status_terkini, next_action, due_date, cro, prioritas)
        VALUES (?, ?, ?, ?, ?, DATE_ADD(CURDATE(), INTERVAL 1 DAY), ?, ?)
      `, [idSiswa, row.nama_lengkap, mp, 'Data Masuk', 'Screening', croName, prioritas]);

      successCount++;
    }

    await conn.commit();
    
    // Increment Kuota berdasarkan data yang beneran masuk (sukses)
    if (successCount > 0) {
      await _incrementUsedSiswa(tenantId, successCount).catch(e => console.error("Gagal increment used_siswa:", e));
    }

    return { successCount, skipCount };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = {
  listSiswa,
  detailSiswa,
  tambahSiswa,
  editSiswa,
  hapusSiswa,
  inputAktivitas,
  koreksiAktivitas,
  importBatch
};

'use strict';
/**
 * weekly.service.js
 * Business logic untuk modul Weekly Planning.
 *
 * Backlog  = aktivitas_sekolah + aktivitas_siswa + home_visit + aktivitas_ekstra
 *            WHERE due_date IS NULL / status_jadwal = 'belum dijadwalkan'
 * Board    = weekly_planning WHERE tanggal BETWEEN startDate AND endDate
 *
 * Task ID Format: "{prefix}:{id}"
 *   as:{id}  → aktivitas_sekolah
 *   asi:{id} → aktivitas_siswa
 *   hv:{id}  → home_visit
 *   ae:{id}  → aktivitas_ekstra
 */

const { pool } = require('../../../config/database');
const { v4: uuidv4 } = require('uuid');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
async function getActivePeriod() {
  const [rows] = await pool.query(
    "SELECT nama_period FROM marketing_period WHERE status = 'aktif' ORDER BY created_date DESC LIMIT 1"
  );
  return rows[0]?.nama_period || null;
}

/**
 * Parse taskId prefix → tabel dan kolom yang relevan.
 * Dipakai oleh scheduleTask, rescheduleTask, unscheduleTask.
 */
function parseTaskId(taskId) {
  const colonIdx = taskId.indexOf(':');
  const prefix   = taskId.substring(0, colonIdx);
  const id       = taskId.substring(colonIdx + 1);

  const map = {
    as:  {
      table:     'aktivitas_sekolah',
      dateCol:   'due_date',
      statusCol: 'status_jadwal',
      nameCol:   'id_sekolah_nama',
    },
    asi: {
      table:     'aktivitas_siswa',
      dateCol:   'due_date',
      statusCol: 'status_jadwal',
      nameCol:   'id_siswa_nama',
    },
    hv:  {
      table:     'home_visit',
      dateCol:   'due_date',
      statusCol: 'status_jadwal',
      nameCol:   'id_siswa_nama',
    },
    ae:  {
      table:     'aktivitas_ekstra',
      dateCol:   'tanggal_rencana', // aktivitas_ekstra pakai kolom ini, bukan due_date
      statusCol: 'status_aktivitas',
      nameCol:   'aktivitas',       // judul dari kolom aktivitas
    },
  };

  const meta = map[prefix];
  if (!meta) throw new Error(`Prefix task tidak dikenali: "${prefix}"`);
  return { prefix, id, ...meta };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/weekly/backlog
// ─────────────────────────────────────────────────────────────────────────────
async function getBacklog(user, query = {}) {
  let mp = query.period || user.selectedPeriod;
  if (!mp || mp === '-') mp = await getActivePeriod();

  const isCRO = user.role === 'CRO';
  const search = query.search?.trim() ? `%${query.search.trim()}%` : null;

  // Backlog condition per tabel (tidak boleh hilang meski punya due_date selama belum masuk board)
  const blAS  = `(IFNULL(as_t.status_jadwal,'') NOT IN ('dijadwalkan', 'Tidak ada jadwal', 'Selesai', 'Batal'))`;
  const blASI = `(IFNULL(asi_t.status_jadwal,'') NOT IN ('dijadwalkan', 'Tidak ada jadwal', 'Selesai', 'Batal'))`;
  const blHV  = `(IFNULL(hv_t.status_jadwal,'') NOT IN ('dijadwalkan', 'Tidak ada jadwal', 'Selesai', 'Batal'))`;
  const blAE  = `(IFNULL(status_aktivitas,'') NOT IN ('dijadwalkan', 'Selesai', 'Batal'))`;

  // ── aktivitas_sekolah ──────────────────────────────────────────────────────
  const asParams = [mp];
  const asWhere  = ['as_t.marketing_period = ?', blAS];
  if (isCRO)  { asWhere.push('sp.pj_sekolah = ?');              asParams.push(user.nama);  }
  if (search) { asWhere.push('as_t.id_sekolah_nama LIKE ?');    asParams.push(search);     }

  const [asRows] = await pool.query(`
    SELECT
      CONCAT('as:', as_t.id) AS taskId,
      'sekolah'              AS jenis,
      as_t.id_sekolah_nama   AS judul,
      as_t.next_action,
      as_t.status_terkini    AS status,
      sp.pj_sekolah          AS owner,
      as_t.marketing_period,
      DATE_FORMAT(as_t.due_date, '%Y-%m-%d') AS date_val
    FROM aktivitas_sekolah as_t
    LEFT JOIN sekolah_periode sp 
      ON as_t.id_sekolah_nama LIKE CONCAT(sp.id_sekolah, '-%') 
      AND sp.marketing_period = as_t.marketing_period
    WHERE ${asWhere.join(' AND ')}
    ORDER BY as_t.timestamp DESC
    LIMIT 150
  `, asParams);

  // ── aktivitas_siswa ────────────────────────────────────────────────────────
  const asiParams = [mp];
  const asiWhere  = ['asi_t.marketing_period = ?', blASI];
  if (isCRO)  { asiWhere.push('sp.cro = ?'); asiParams.push(user.nama); }
  if (search) {
    asiWhere.push('(asi_t.id_siswa_nama LIKE ? OR asi_t.id_sekolah_nama LIKE ?)');
    asiParams.push(search, search);
  }

  const [asiRows] = await pool.query(`
    SELECT
      CONCAT('asi:', asi_t.id) AS taskId,
      'siswa'                  AS jenis,
      asi_t.id_siswa_nama      AS judul,
      asi_t.next_action,
      asi_t.status_terkini     AS status,
      sp.cro                   AS owner,
      asi_t.marketing_period,
      DATE_FORMAT(asi_t.due_date, '%Y-%m-%d') AS date_val
    FROM aktivitas_siswa asi_t
    LEFT JOIN siswa_periode sp 
      ON asi_t.id_siswa_nama LIKE CONCAT(sp.id_siswa, '-%') 
      AND sp.marketing_period = asi_t.marketing_period
    WHERE ${asiWhere.join(' AND ')}
    ORDER BY asi_t.timestamp DESC
    LIMIT 150
  `, asiParams);

  // ── home_visit ─────────────────────────────────────────────────────────────
  const hvParams = [mp];
  const hvWhere  = ['hv_t.marketing_period = ?', blHV];
  if (isCRO)  { hvWhere.push('sp.cro = ?'); hvParams.push(user.nama); }
  if (search) { hvWhere.push('hv_t.id_siswa_nama LIKE ?'); hvParams.push(search); }

  const [hvRows] = await pool.query(`
    SELECT
      CONCAT('hv:', hv_t.id) AS taskId,
      'home_visit'           AS jenis,
      hv_t.id_siswa_nama     AS judul,
      hv_t.next_action,
      hv_t.status_terkini    AS status,
      sp.cro                 AS owner,
      hv_t.marketing_period,
      DATE_FORMAT(hv_t.due_date, '%Y-%m-%d') AS date_val
    FROM home_visit hv_t
    LEFT JOIN siswa_periode sp 
      ON hv_t.id_siswa_nama LIKE CONCAT(sp.id_siswa, '-%') 
      AND sp.marketing_period = hv_t.marketing_period
    WHERE ${hvWhere.join(' AND ')}
    ORDER BY hv_t.timestamp DESC
    LIMIT 100
  `, hvParams);

  // ── aktivitas_ekstra ───────────────────────────────────────────────────────
  const aeParams = [mp];
  const aeWhere  = ['marketing_period = ?', blAE];
  if (isCRO)  { aeWhere.push('pj_aktivitas = ?'); aeParams.push(user.nama); }
  if (search) { aeWhere.push('aktivitas LIKE ?'); aeParams.push(search);    }

  const [aeRows] = await pool.query(`
    SELECT
      CONCAT('ae:', id)   AS taskId,
      'ekstra'            AS jenis,
      aktivitas           AS judul,
      tujuan_catatan      AS next_action,
      status_aktivitas    AS status,
      pj_aktivitas        AS owner,
      marketing_period,
      DATE_FORMAT(tanggal_rencana, '%Y-%m-%d') AS date_val
    FROM aktivitas_ekstra
    WHERE ${aeWhere.join(' AND ')}
    ORDER BY timestamp DESC
    LIMIT 100
  `, aeParams);

  return [...asRows, ...asiRows, ...hvRows, ...aeRows];
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/weekly/board?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// ─────────────────────────────────────────────────────────────────────────────
async function getBoardItems(user, query = {}) {
  const { startDate, endDate } = query;
  if (!startDate || !endDate) throw new Error('startDate dan endDate wajib diisi');

  let mp = query.period || user.selectedPeriod;
  if (!mp || mp === '-') mp = await getActivePeriod();

  const params = [mp, startDate, endDate];
  const where  = ['marketing_period = ?', 'tanggal BETWEEN ? AND ?'];

  // CRO hanya lihat agenda miliknya sendiri
  if (user.role === 'CRO') {
    where.push('cro = ?');
    params.push(user.nama);
  }

  const [rows] = await pool.query(`
    SELECT
      id          AS dbId,
      id_agenda,
      referensi_id,
      jenis_agenda,
      judul,
      DATE_FORMAT(tanggal, '%Y-%m-%d') AS tanggal,
      jam_mulai,
      jam_selesai,
      lokasi,
      cro,
      catatan
    FROM weekly_planning
    WHERE ${where.join(' AND ')}
    ORDER BY tanggal ASC, IFNULL(jam_mulai,'99:99') ASC
  `, params);

  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/weekly/schedule
// Drag backlog → kolom hari
// ─────────────────────────────────────────────────────────────────────────────
async function scheduleTask(user, body = {}) {
  const { taskId, tanggal } = body;
  if (!taskId)  throw new Error('taskId wajib diisi');
  if (!tanggal) throw new Error('tanggal wajib diisi (format YYYY-MM-DD)');

  const { prefix, id, table, dateCol, statusCol, nameCol } = parseTaskId(taskId);

  let mp = user.selectedPeriod;
  if (!mp || mp === '-') mp = await getActivePeriod();

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Ambil judul dari source table + Kunci baris (Row-level lock)
    const [srcRows] = await conn.query(
      `SELECT ${nameCol} AS judul, ${dateCol} AS date_val${statusCol ? `, ${statusCol} AS status_val` : ''} FROM ${table} WHERE id = ? FOR UPDATE`,
      [id]
    );
    if (!srcRows.length) throw new Error(`Task tidak ditemukan di ${table}: id=${id}`);
    
    // Validasi Race Condition: Pastikan task belum dijadwalkan di board
    if (statusCol && srcRows[0].status_val === 'dijadwalkan') {
      throw new Error('Gagal: Task ini sudah ada di papan jadwal (Race Condition dicegah).');
    }

    const judul = srcRows[0].judul || '(tanpa judul)';
    const idAgenda = uuidv4();

    // INSERT ke weekly_planning
    await conn.query(
      `INSERT INTO weekly_planning
         (marketing_period, id_agenda, referensi_id, jenis_agenda, judul, tanggal, cro)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [mp, idAgenda, id, prefix, judul, tanggal, user.nama]
    );

    // UPDATE source table: set due_date + status_jadwal
    if (statusCol) {
      await conn.query(
        `UPDATE ${table} SET ${dateCol} = ?, ${statusCol} = 'dijadwalkan' WHERE id = ?`,
        [tanggal, id]
      );
    } else {
      await conn.query(
        `UPDATE ${table} SET ${dateCol} = ? WHERE id = ?`,
        [tanggal, id]
      );
    }

    // SYNC parent tables for Tasklist
    if (prefix === 'as') {
      const match = judul.match(/^(SKL-\d+)/);
      if (match) await conn.query(`UPDATE sekolah_periode SET due_date = ?, status_jadwal = 'dijadwalkan' WHERE id_sekolah = ? AND marketing_period = ?`, [tanggal, match[1], mp]);
    } else if (prefix === 'asi' || prefix === 'hv') {
      const match = judul.match(/^(STD-\d+)/);
      if (match) await conn.query(`UPDATE siswa_periode SET due_date = ?, status_jadwal = 'dijadwalkan' WHERE id_siswa = ? AND marketing_period = ?`, [tanggal, match[1], mp]);
    }

    await conn.commit();

    // Trigger Google Calendar Sync (Async, doesn't block the response)
    const calendarService = require('../calendar/calendar.service');
    calendarService.syncEventToCalendar(user.id, {
      summary: judul,
      description: `Task ID: ${idAgenda}\nJenis: ${prefix}`,
      date: tanggal // All-day event based on date
    }).catch(err => {
      console.error('[Calendar Sync] Failed in scheduleTask:', err.message);
    });

    return {
      id_agenda: idAgenda,
      judul,
      jenis_agenda: prefix,
      referensi_id: id,
      tanggal,
      cro: user.nama,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/v1/weekly/agenda/:agendaId/reschedule
// Drag hari → hari lain
// ─────────────────────────────────────────────────────────────────────────────
async function rescheduleTask(user, agendaId, body = {}) {
  const { newTanggal } = body;
  if (!newTanggal) throw new Error('newTanggal wajib diisi (format YYYY-MM-DD)');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      'SELECT * FROM weekly_planning WHERE id_agenda = ? FOR UPDATE',
      [agendaId]
    );
    if (!rows.length) throw new Error(`Agenda tidak ditemukan: ${agendaId}`);

    const agenda = rows[0];
    const { table, dateCol } = parseTaskId(`${agenda.jenis_agenda}:${agenda.referensi_id}`);

    // Update weekly_planning
    await conn.query(
      'UPDATE weekly_planning SET tanggal = ? WHERE id_agenda = ?',
      [newTanggal, agendaId]
    );

    // Update source table due_date
    await conn.query(
      `UPDATE ${table} SET ${dateCol} = ? WHERE id = ?`,
      [newTanggal, agenda.referensi_id]
    );

    // SYNC parent tables for Tasklist
    const prefix = agenda.jenis_agenda;
    const judul = agenda.judul;
    const mp = agenda.marketing_period;
    if (prefix === 'as') {
      const match = judul.match(/^(SKL-\d+)/);
      if (match) await conn.query(`UPDATE sekolah_periode SET due_date = ? WHERE id_sekolah = ? AND marketing_period = ?`, [newTanggal, match[1], mp]);
    } else if (prefix === 'asi' || prefix === 'hv') {
      const match = judul.match(/^(STD-\d+)/);
      if (match) await conn.query(`UPDATE siswa_periode SET due_date = ? WHERE id_siswa = ? AND marketing_period = ?`, [newTanggal, match[1], mp]);
    }

    await conn.commit();
    return { success: true, newTanggal };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/v1/weekly/agenda/:agendaId
// Drag hari → backlog (hapus jadwal)
// ─────────────────────────────────────────────────────────────────────────────
async function unscheduleTask(user, agendaId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      'SELECT * FROM weekly_planning WHERE id_agenda = ? FOR UPDATE',
      [agendaId]
    );
    if (!rows.length) throw new Error(`Agenda tidak ditemukan: ${agendaId}`);

    const agenda = rows[0];
    const { table, dateCol, statusCol } = parseTaskId(`${agenda.jenis_agenda}:${agenda.referensi_id}`);

    // Hapus dari weekly_planning
    await conn.query('DELETE FROM weekly_planning WHERE id_agenda = ?', [agendaId]);

    // Reset source table
    if (statusCol) {
      await conn.query(
        `UPDATE ${table} SET ${dateCol} = NULL, ${statusCol} = 'belum dijadwalkan' WHERE id = ?`,
        [agenda.referensi_id]
      );
    } else {
      await conn.query(
        `UPDATE ${table} SET ${dateCol} = NULL WHERE id = ?`,
        [agenda.referensi_id]
      );
    }

    // SYNC parent tables for Tasklist
    const prefix = agenda.jenis_agenda;
    const judul = agenda.judul;
    const mp = agenda.marketing_period;
    if (prefix === 'as') {
      const match = judul.match(/^(SKL-\d+)/);
      if (match) await conn.query(`UPDATE sekolah_periode SET due_date = NULL, status_jadwal = 'Menunggu Penjadwalan' WHERE id_sekolah = ? AND marketing_period = ?`, [match[1], mp]);
    } else if (prefix === 'asi' || prefix === 'hv') {
      const match = judul.match(/^(STD-\d+)/);
      if (match) await conn.query(`UPDATE siswa_periode SET due_date = NULL, status_jadwal = 'Menunggu Penjadwalan' WHERE id_siswa = ? AND marketing_period = ?`, [match[1], mp]);
    }

    await conn.commit();
    return { success: true };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = {
  getBacklog,
  getBoardItems,
  scheduleTask,
  rescheduleTask,
  unscheduleTask,
};

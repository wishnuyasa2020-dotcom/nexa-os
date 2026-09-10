'use strict';

const crypto = require('crypto');
const { pool } = require('../../../config/database');

/**
 * Helper pencatatan event immutable ke events_log (Event-Sourcing CQRS)
 */
async function _recordEvent(eventType, aggregateId, payload, actor = 'System', marketingPeriod = null) {
  try {
    const eventId = `EVT-CHT-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    await pool.query(
      `INSERT INTO events_log (event_id, aggregate_type, aggregate_id, event_type, payload, actor_id, marketing_period, created_at)
       VALUES (?, 'cohort', ?, ?, ?, ?, ?, NOW())`,
      [eventId, String(aggregateId), eventType, JSON.stringify(payload), actor || 'System', marketingPeriod || null]
    );
  } catch (err) {
    console.warn(`[CohortService] Warning: Gagal mencatat event ${eventType}:`, err.message);
  }
}

/**
 * Format ID Cohort standar
 */
function _formatCohortId(idPeriod, namaPeriod) {
  if (idPeriod && idPeriod.trim() !== '') return idPeriod.trim();
  if (namaPeriod) return `CHT-${namaPeriod.replace(/[^a-zA-Z0-9]/g, '-')}`;
  return `CHT-${Date.now()}`;
}

/**
 * Mengambil daftar seluruh Cohort beserta statistik total siswa & sekolah
 */
async function getAllCohorts() {
  const [rows] = await pool.query(
    `SELECT 
      id_period,
      nama_period,
      start_date,
      end_date,
      status,
      created_date,
      created_by
     FROM marketing_period
     ORDER BY 
      CASE WHEN LOWER(status) = 'aktif' THEN 0 WHEN LOWER(status) = 'draft' THEN 1 ELSE 2 END,
      created_date DESC, 
      nama_period DESC`
  );

  // Ambil count agregasi per cohort
  const [siswaCounts] = await pool.query(
    `SELECT marketing_period, COUNT(id_record) as total_siswa 
     FROM siswa_periode 
     GROUP BY marketing_period`
  );
  const [sekolahCounts] = await pool.query(
    `SELECT marketing_period, COUNT(id_record) as total_sekolah 
     FROM sekolah_periode 
     GROUP BY marketing_period`
  );

  const siswaMap = new Map();
  for (const s of siswaCounts) {
    if (s.marketing_period) siswaMap.set(s.marketing_period, Number(s.total_siswa));
  }

  const sekolahMap = new Map();
  for (const sk of sekolahCounts) {
    if (sk.marketing_period) sekolahMap.set(sk.marketing_period, Number(sk.total_sekolah));
  }

  return rows.map((r) => {
    const cleanId = _formatCohortId(r.id_period, r.nama_period);
    const totalSiswa = siswaMap.get(r.nama_period) || siswaMap.get(r.id_period) || 0;
    const totalSekolah = sekolahMap.get(r.nama_period) || sekolahMap.get(r.id_period) || 0;

    return {
      id_period: cleanId,
      raw_id: r.id_period,
      nama_period: r.nama_period,
      start_date: r.start_date,
      end_date: r.end_date,
      status: (r.status || 'draft').toLowerCase(),
      is_active: (r.status || '').toLowerCase() === 'aktif',
      total_siswa: totalSiswa,
      total_sekolah: totalSekolah,
      created_date: r.created_date,
      created_by: r.created_by,
    };
  });
}

/**
 * Mengambil detail cohort berdasarkan ID atau nama
 */
async function getCohortById(id) {
  const all = await getAllCohorts();
  const found = all.find(
    (c) => c.id_period === id || c.raw_id === id || c.nama_period === id
  );
  if (!found) throw new Error(`Cohort "${id}" tidak ditemukan.`);
  return found;
}

/**
 * Membuat cohort baru (Status awal: Draft)
 */
async function createCohort(data, actor = 'System') {
  if (!data.nama_period || !data.nama_period.trim()) {
    throw new Error('Nama Cohort wajib diisi (contoh: 2027/2028).');
  }

  const namaPeriod = data.nama_period.trim();
  const idPeriod = _formatCohortId(data.id_period, namaPeriod);
  const status = (data.status || 'draft').toLowerCase();

  // Validasi duplikasi nama
  const [existing] = await pool.query(
    'SELECT id_period, nama_period FROM marketing_period WHERE nama_period = ?',
    [namaPeriod]
  );
  if (existing.length > 0) {
    throw new Error(`Cohort dengan nama "${namaPeriod}" sudah ada.`);
  }

  const startDate = data.start_date || null;
  const endDate = data.end_date || null;

  await pool.query(
    `INSERT INTO marketing_period (id_period, nama_period, start_date, end_date, status, created_date, created_by)
     VALUES (?, ?, ?, ?, ?, NOW(), ?)`,
    [idPeriod, namaPeriod, startDate, endDate, status, actor || 'System']
  );

  await _recordEvent(
    'CohortCreated',
    idPeriod,
    { id_period: idPeriod, nama_period: namaPeriod, status, start_date: startDate, end_date: endDate },
    actor,
    namaPeriod
  );

  return {
    id_period: idPeriod,
    nama_period: namaPeriod,
    status,
    start_date: startDate,
    end_date: endDate,
  };
}

/**
 * Validasi & Swap status Cohort (Hanya 1 cohort berstatus aktif)
 */
async function setActiveCohort(id, actor = 'System') {
  const target = await getCohortById(id);
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // 1. Ambil cohort aktif saat ini untuk audit trail
    const [currentActive] = await conn.query(
      "SELECT id_period, nama_period FROM marketing_period WHERE LOWER(status) = 'aktif'"
    );

    // 2. Turunkan seluruh cohort aktif saat ini menjadi 'arsip'
    await conn.query("UPDATE marketing_period SET status = 'arsip' WHERE LOWER(status) = 'aktif'");

    // 3. Set cohort target menjadi 'aktif'
    await conn.query(
      "UPDATE marketing_period SET status = 'aktif' WHERE nama_period = ? OR id_period = ?",
      [target.nama_period, target.raw_id || target.id_period]
    );

    await conn.commit();

    // 4. Catat event immutable
    await _recordEvent(
      'CohortActivated',
      target.id_period,
      {
        activated_cohort: target.nama_period,
        previous_active: currentActive.map((c) => c.nama_period),
      },
      actor,
      target.nama_period
    );

    return {
      success: true,
      message: `Cohort ${target.nama_period} berhasil diaktifkan.`,
      active_cohort: target.nama_period,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Mengarsipkan Cohort
 */
async function archiveCohort(id, actor = 'System') {
  const target = await getCohortById(id);

  await pool.query(
    "UPDATE marketing_period SET status = 'arsip' WHERE nama_period = ? OR id_period = ?",
    [target.nama_period, target.raw_id || target.id_period]
  );

  await _recordEvent(
    'CohortArchived',
    target.id_period,
    { archived_cohort: target.nama_period },
    actor,
    target.nama_period
  );

  return {
    success: true,
    message: `Cohort ${target.nama_period} telah diarsipkan.`,
  };
}

/**
 * Logika filter dinamis kelayakan Re-entry (Dry-Run Simulation)
 */
async function simulateReEntry(targetId, options = {}) {
  const target = await getCohortById(targetId);

  // Cari source cohort (default: cohort aktif saat ini atau cohort sebelumnya)
  let sourcePeriod = options.sourceCohort;
  if (!sourcePeriod) {
    const [activeRow] = await pool.query(
      "SELECT nama_period FROM marketing_period WHERE LOWER(status) = 'aktif' AND nama_period != ? LIMIT 1",
      [target.nama_period]
    );
    if (activeRow.length > 0) {
      sourcePeriod = activeRow[0].nama_period;
    } else {
      const [latestRow] = await pool.query(
        "SELECT nama_period FROM marketing_period WHERE nama_period != ? ORDER BY created_date DESC LIMIT 1",
        [target.nama_period]
      );
      if (latestRow.length > 0) sourcePeriod = latestRow[0].nama_period;
    }
  }

  if (!sourcePeriod) {
    return {
      eligible_students: 0,
      eligible_schools: 0,
      total_source_students: 0,
      source_cohort: null,
      target_cohort: target.nama_period,
      message: 'Tidak ada Cohort sumber yang dapat dijadikan referensi Re-entry.',
    };
  }

  // Hitung total siswa di cohort sumber
  const [totalSourceRows] = await pool.query(
    'SELECT COUNT(id_record) as total FROM siswa_periode WHERE marketing_period = ?',
    [sourcePeriod]
  );
  const totalSourceStudents = Number(totalSourceRows[0]?.total || 0);

  // Buat query filter dinamis
  // Rule default ontologi Nexa OS:
  // Siswa yang sudah 'Customer' (closing lunas DP) atau 'Do Not Contact' / 'Disqualified' tidak di-re-entry.
  // Siswa yang sudah terikat di cohort target juga di-exclude.
  const excludeCustomer = options.excludeCustomer !== false;
  const excludeRegistered = options.excludeRegistered !== false;
  const excludeDoNotContact = options.excludeDoNotContact !== false;

  const whereConditions = [
    'sp.marketing_period = ?',
    // Tidak boleh ada di cohort target
    `sp.id_siswa NOT IN (SELECT sp_target.id_siswa FROM siswa_periode sp_target WHERE sp_target.marketing_period = ?)`
  ];
  const params = [sourcePeriod, target.nama_period];

  if (excludeCustomer) {
    whereConditions.push("LOWER(IFNULL(sp.commercial_state, '')) != 'customer'");
    whereConditions.push("LOWER(IFNULL(sp.status_terkini, '')) NOT LIKE '%closing%'");
  }

  if (excludeRegistered) {
    whereConditions.push("LOWER(IFNULL(sp.commercial_state, '')) != 'registered opportunity'");
    whereConditions.push("LOWER(IFNULL(sp.status_terkini, '')) NOT LIKE '%terdaftar%'");
  }

  if (excludeDoNotContact) {
    whereConditions.push("LOWER(IFNULL(sp.status_terkini, '')) NOT LIKE '%tidak berminat%'");
    whereConditions.push("LOWER(IFNULL(sp.status_terkini, '')) NOT LIKE '%do not contact%'");
    whereConditions.push("LOWER(IFNULL(sp.status_terkini, '')) NOT LIKE '%disqualified%'");
  }

  // Custom filter if passed
  if (Array.isArray(options.customFilters)) {
    for (const f of options.customFilters) {
      if (f.field === 'intent' && f.val) {
        if (f.op === '!=') {
          whereConditions.push("IFNULL(sp.intent, '') != ?");
          params.push(f.val);
        } else if (f.op === '=') {
          whereConditions.push("sp.intent = ?");
          params.push(f.val);
        }
      }
    }
  }

  const queryEligible = `
    SELECT 
      COUNT(DISTINCT sp.id_siswa) as eligible_students,
      COUNT(DISTINCT ms.id_sekolah) as eligible_schools
    FROM siswa_periode sp
    LEFT JOIN master_siswa ms ON sp.id_siswa = ms.id_siswa
    WHERE ${whereConditions.join(' AND ')}
  `;

  const [res] = await pool.query(queryEligible, params);

  return {
    eligible_students: Number(res[0]?.eligible_students || 0),
    eligible_schools: Number(res[0]?.eligible_schools || 0),
    total_source_students: totalSourceStudents,
    source_cohort: sourcePeriod,
    target_cohort: target.nama_period,
  };
}

/**
 * Eksekusi manual Re-entry massal ke Cohort target
 */
async function executeReEntry(targetId, options = {}, actor = 'System') {
  const target = await getCohortById(targetId);
  const sim = await simulateReEntry(targetId, options);

  if (sim.eligible_students === 0) {
    throw new Error(
      `Tidak ada siswa dari Cohort ${sim.source_cohort} yang memenuhi syarat untuk di-re-entry ke ${target.nama_period}.`
    );
  }

  const sourcePeriod = sim.source_cohort;
  const excludeCustomer = options.excludeCustomer !== false;
  const excludeRegistered = options.excludeRegistered !== false;
  const excludeDoNotContact = options.excludeDoNotContact !== false;

  const whereConditions = [
    'sp.marketing_period = ?',
    `sp.id_siswa NOT IN (SELECT sp_target.id_siswa FROM siswa_periode sp_target WHERE sp_target.marketing_period = ?)`
  ];
  const params = [sourcePeriod, target.nama_period];

  if (excludeCustomer) {
    whereConditions.push("LOWER(IFNULL(sp.commercial_state, '')) != 'customer'");
    whereConditions.push("LOWER(IFNULL(sp.status_terkini, '')) NOT LIKE '%closing%'");
  }
  if (excludeRegistered) {
    whereConditions.push("LOWER(IFNULL(sp.commercial_state, '')) != 'registered opportunity'");
    whereConditions.push("LOWER(IFNULL(sp.status_terkini, '')) NOT LIKE '%terdaftar%'");
  }
  if (excludeDoNotContact) {
    whereConditions.push("LOWER(IFNULL(sp.status_terkini, '')) NOT LIKE '%tidak berminat%'");
    whereConditions.push("LOWER(IFNULL(sp.status_terkini, '')) NOT LIKE '%do not contact%'");
    whereConditions.push("LOWER(IFNULL(sp.status_terkini, '')) NOT LIKE '%disqualified%'");
  }

  // Tarik data siswa yang eligible
  const [eligibleList] = await pool.query(
    `SELECT 
      sp.id_siswa,
      IFNULL(ms.nama_lengkap, sp.nama_siswa) AS nama_siswa,
      ms.id_sekolah,
      sp.intent
     FROM siswa_periode sp
     LEFT JOIN master_siswa ms ON sp.id_siswa = ms.id_siswa
     WHERE ${whereConditions.join(' AND ')}`,
    params
  );

  const conn = await pool.getConnection();
  let insertedStudents = 0;
  const schoolsToBind = new Set();

  try {
    await conn.beginTransaction();

    const targetCohortClean = target.nama_period.replace(/[^a-zA-Z0-9]/g, '');

    for (const student of eligibleList) {
      const recordId = `REC-SW-${targetCohortClean}-${student.id_siswa}`;
      const appId = `APP-${targetCohortClean}-${student.id_siswa}`;
      const eventId = `EVT-APP-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

      // 1. Sisipkan ke siswa_periode dengan status reset ke 'Lead' dan cro = NULL (Unassigned)
      await conn.query(
        `INSERT INTO siswa_periode (
          id_record, id_siswa, nama_siswa, marketing_period, cro, prioritas,
          status_terkini, commercial_state, next_action, due_date, intent,
          created_date, last_updated
        ) VALUES (
          ?, ?, ?, ?, NULL, 'P1',
          'Lead', 'Lead', 'Follow Up Awal Cohort Baru', DATE_ADD(CURRENT_DATE(), INTERVAL 3 DAY), ?,
          NOW(), NOW()
        ) ON DUPLICATE KEY UPDATE 
          commercial_state = 'Lead', status_terkini = 'Lead', cro = NULL, last_updated = NOW()`,
        [recordId, student.id_siswa, student.nama_siswa, target.nama_period, student.intent || 'Mid']
      );

      // 2. Catat event immutable ApplicationCreated
      const payloadApp = {
        person_id: student.id_siswa,
        cohort_id: target.nama_period,
        source: `Re-entry_Process_${sourcePeriod}`,
        initial_commercial_state: 'Lead',
      };
      await conn.query(
        `INSERT INTO events_log (
          event_id, aggregate_type, aggregate_id, event_type, payload, actor_id, marketing_period, created_at
        ) VALUES (?, 'application', ?, 'ApplicationCreated', ?, ?, ?, NOW())`,
        [eventId, appId, JSON.stringify(payloadApp), actor || 'System', target.nama_period]
      );

      if (student.id_sekolah) {
        schoolsToBind.add(student.id_sekolah);
      }
      insertedStudents++;
    }

    // 3. Pastikan sekolah terkait juga terdaftar di sekolah_periode untuk cohort target
    let insertedSchools = 0;
    for (const idSekolah of schoolsToBind) {
      const schoolRecordId = `REC-SK-${targetCohortClean}-${idSekolah}`;
      const [checkSk] = await conn.query(
        'SELECT id_record FROM sekolah_periode WHERE id_sekolah = ? AND marketing_period = ?',
        [idSekolah, target.nama_period]
      );
      if (checkSk.length === 0) {
        await conn.query(
          `INSERT INTO sekolah_periode (
            id_record, marketing_period, id_sekolah, pj_sekolah, status_terkini, sekolah_aktif, created_date, last_updated
          ) VALUES (?, ?, ?, NULL, 'Target', 'Ya', NOW(), NOW())`,
          [schoolRecordId, target.nama_period, idSekolah]
        );
        insertedSchools++;
      }
    }

    // 4. Catat event rangkuman eksekusi Re-entry
    const execEventId = `EVT-REENTRY-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const payloadExec = {
      source_cohort: sourcePeriod,
      target_cohort: target.nama_period,
      total_students_reentered: insertedStudents,
      total_schools_bound: insertedSchools,
      filters: { excludeCustomer, excludeRegistered, excludeDoNotContact },
    };
    await conn.query(
      `INSERT INTO events_log (
        event_id, aggregate_type, aggregate_id, event_type, payload, actor_id, marketing_period, created_at
      ) VALUES (?, 'cohort', ?, 'CohortReEntryExecuted', ?, ?, ?, NOW())`,
      [execEventId, target.nama_period, JSON.stringify(payloadExec), actor || 'System', target.nama_period]
    );

    await conn.commit();

    return {
      success: true,
      message: `Re-entry massal berhasil: ${insertedStudents} siswa dan ${insertedSchools} sekolah terikat ke Cohort ${target.nama_period}.`,
      target_cohort: target.nama_period,
      source_cohort: sourcePeriod,
      total_reentered_students: insertedStudents,
      total_reentered_schools: insertedSchools,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = {
  getAllCohorts,
  getCohortById,
  createCohort,
  setActiveCohort,
  archiveCohort,
  simulateReEntry,
  executeReEntry,
};

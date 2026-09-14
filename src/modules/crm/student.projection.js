'use strict';

/**
 * student.projection.js
 * Read-Model Projection synchronizer for student_current_state.
 * Memastikan tabel student_current_state selalu sinkron 100% dengan siswa_periode & master_siswa.
 */

async function syncStudentCurrentState(connOrPool, studentIds = null) {
  try {
    const hasFilter = Array.isArray(studentIds) ? studentIds.length > 0 : Boolean(studentIds);
    const filterArray = Array.isArray(studentIds) ? studentIds : (studentIds ? [studentIds] : []);
    const params = hasFilter ? [filterArray] : [];

    await connOrPool.query(`
      INSERT INTO student_current_state
        (id_siswa, nama_siswa, cro_assignee, pipeline_state, status_label, marketing_period, updated_at)
      SELECT
        sp.id_siswa,
        ms.nama_lengkap,
        sp.cro,
        COALESCE(sp.commercial_state, 'Lead'),
        sp.status_terkini,
        sp.marketing_period,
        COALESCE(sp.last_updated, sp.created_date, NOW())
      FROM siswa_periode sp
      JOIN master_siswa ms ON ms.id_siswa = sp.id_siswa
      WHERE sp.id_record = (
        SELECT sp2.id_record FROM siswa_periode sp2
        WHERE sp2.id_siswa = sp.id_siswa
        ORDER BY COALESCE(sp2.last_updated, sp2.created_date) DESC, sp2.id_record DESC
        LIMIT 1
      )
      ${hasFilter ? 'AND sp.id_siswa IN (?)' : ''}
      ON DUPLICATE KEY UPDATE
        nama_siswa       = VALUES(nama_siswa),
        cro_assignee     = VALUES(cro_assignee),
        pipeline_state   = VALUES(pipeline_state),
        status_label     = VALUES(status_label),
        marketing_period = VALUES(marketing_period),
        updated_at       = VALUES(updated_at);
    `, params);
  } catch (err) {
    console.warn('[ProjectionSync] Gagal sinkronisasi student_current_state (non-fatal):', err.message);
  }
}

module.exports = {
  syncStudentCurrentState
};

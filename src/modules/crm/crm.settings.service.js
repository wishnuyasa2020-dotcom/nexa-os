'use strict';

const crypto = require('crypto');
const { pool } = require('../../config/database');

/**
 * Catat event immutable ke events_log untuk CQRS & Audit Trail
 */
async function _recordEvent(eventType, aggregateId, payload, actor = 'System') {
  try {
    const eventId = `EVT-SET-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    await pool.query(
      `INSERT INTO events_log (event_id, aggregate_type, aggregate_id, event_type, payload, actor_id, created_at)
       VALUES (?, 'master_data', ?, ?, ?, ?, NOW())`,
      [eventId, String(aggregateId), eventType, JSON.stringify(payload), actor || 'System']
    );
  } catch (err) {
    console.warn(`[Settings] Warning: Gagal mencatat event ${eventType}:`, err.message);
  }
}

// ── Master Kelas ─────────────────────────────────────────────────────────────

async function getKelasMapping() {
  const [rows] = await pool.query('SELECT id, nama_kelas AS kelas FROM master_kelas ORDER BY nama_kelas ASC');
  return rows;
}

async function addKelasMapping(data, actor = null) {
  if (!data.kelas) throw new Error('Nama Kelas wajib diisi.');
  
  const conn = await pool.getConnection();
  try {
    const [result] = await conn.query(
      'INSERT INTO master_kelas (nama_kelas) VALUES (?)',
      [data.kelas]
    );
    await _recordEvent('MasterKelasCreated', result.insertId, { nama_kelas: data.kelas }, actor);
    return { id: result.insertId, kelas: data.kelas };
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      throw new Error(`Kelas "${data.kelas}" sudah terdaftar.`);
    }
    throw err;
  } finally {
    conn.release();
  }
}

async function updateKelasMapping(id, data, actor = null) {
  if (!data.kelas) throw new Error('Nama Kelas wajib diisi.');

  const conn = await pool.getConnection();
  try {
    await conn.query(
      'UPDATE master_kelas SET nama_kelas = ? WHERE id = ?',
      [data.kelas, id]
    );
    await _recordEvent('MasterKelasUpdated', id, { id, nama_kelas: data.kelas }, actor);
    return { id, kelas: data.kelas };
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      throw new Error(`Kelas "${data.kelas}" sudah terdaftar.`);
    }
    throw err;
  } finally {
    conn.release();
  }
}

async function deleteKelasMapping(id, actor = null) {
  await pool.query('DELETE FROM master_kelas WHERE id = ?', [id]);
  await _recordEvent('MasterKelasDeleted', id, { id }, actor);
  return { success: true };
}

// ── Master Kota ──────────────────────────────────────────────────────────────

async function getKotaList() {
  const [rows] = await pool.query('SELECT id, nama_kota AS kota FROM master_kota ORDER BY nama_kota ASC');
  return rows;
}

async function addKota(data, actor = null) {
  if (!data.kota) throw new Error('Nama Kota wajib diisi.');
  
  const conn = await pool.getConnection();
  try {
    const [result] = await conn.query(
      'INSERT INTO master_kota (nama_kota) VALUES (?)',
      [data.kota]
    );
    await _recordEvent('MasterKotaCreated', result.insertId, { nama_kota: data.kota }, actor);
    return { id: result.insertId, kota: data.kota };
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      throw new Error(`Kota "${data.kota}" sudah terdaftar.`);
    }
    throw err;
  } finally {
    conn.release();
  }
}

async function updateKota(id, data, actor = null) {
  if (!data.kota) throw new Error('Nama Kota wajib diisi.');

  const conn = await pool.getConnection();
  try {
    await conn.query(
      'UPDATE master_kota SET nama_kota = ? WHERE id = ?',
      [data.kota, id]
    );
    await _recordEvent('MasterKotaUpdated', id, { id, nama_kota: data.kota }, actor);
    return { id, kota: data.kota };
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      throw new Error(`Kota "${data.kota}" sudah terdaftar.`);
    }
    throw err;
  } finally {
    conn.release();
  }
}

async function deleteKota(id, actor = null) {
  await pool.query('DELETE FROM master_kota WHERE id = ?', [id]);
  await _recordEvent('MasterKotaDeleted', id, { id }, actor);
  return { success: true };
}

// ── Master Kecamatan ─────────────────────────────────────────────────────────

async function getKecamatanList() {
  const [rows] = await pool.query(`
    SELECT mk.id, mk.nama_kecamatan AS kecamatan, mk.kota_id, mkota.nama_kota AS kota
    FROM master_kecamatan mk
    LEFT JOIN master_kota mkota ON mk.kota_id = mkota.id
    ORDER BY mkota.nama_kota ASC, mk.nama_kecamatan ASC
  `);
  return rows;
}

async function addKecamatan(data, actor = null) {
  if (!data.kecamatan) throw new Error('Nama Kecamatan wajib diisi.');
  if (!data.kota_id) throw new Error('Kota wajib dipilih.');
  
  const conn = await pool.getConnection();
  try {
    const [result] = await conn.query(
      'INSERT INTO master_kecamatan (nama_kecamatan, kota_id) VALUES (?, ?)',
      [data.kecamatan, data.kota_id]
    );
    await _recordEvent('MasterKecamatanCreated', result.insertId, { nama_kecamatan: data.kecamatan, kota_id: data.kota_id }, actor);
    return { id: result.insertId, kecamatan: data.kecamatan, kota_id: data.kota_id };
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      throw new Error(`Kecamatan "${data.kecamatan}" sudah terdaftar.`);
    }
    throw err;
  } finally {
    conn.release();
  }
}

async function updateKecamatan(id, data, actor = null) {
  if (!data.kecamatan) throw new Error('Nama Kecamatan wajib diisi.');
  if (!data.kota_id) throw new Error('Kota wajib dipilih.');

  const conn = await pool.getConnection();
  try {
    await conn.query(
      'UPDATE master_kecamatan SET nama_kecamatan = ?, kota_id = ? WHERE id = ?',
      [data.kecamatan, data.kota_id, id]
    );
    await _recordEvent('MasterKecamatanUpdated', id, { id, nama_kecamatan: data.kecamatan, kota_id: data.kota_id }, actor);
    return { id, kecamatan: data.kecamatan, kota_id: data.kota_id };
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      throw new Error(`Kecamatan "${data.kecamatan}" sudah terdaftar.`);
    }
    throw err;
  } finally {
    conn.release();
  }
}

async function deleteKecamatan(id, actor = null) {
  await pool.query('DELETE FROM master_kecamatan WHERE id = ?', [id]);
  await _recordEvent('MasterKecamatanDeleted', id, { id }, actor);
  return { success: true };
}

module.exports = {
  getKelasMapping,
  addKelasMapping,
  updateKelasMapping,
  deleteKelasMapping,
  getKotaList,
  addKota,
  updateKota,
  deleteKota,
  getKecamatanList,
  addKecamatan,
  updateKecamatan,
  deleteKecamatan
};

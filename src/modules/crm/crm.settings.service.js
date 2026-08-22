'use strict';

const { pool } = require('../../config/database');

async function getKelasMapping() {
  const [rows] = await pool.query('SELECT id, nama_kelas AS kelas FROM master_kelas ORDER BY nama_kelas ASC');
  return rows;
}

async function addKelasMapping(data) {
  if (!data.kelas) throw new Error('Nama Kelas wajib diisi.');
  
  const conn = await pool.getConnection();
  try {
    const [result] = await conn.query(
      'INSERT INTO master_kelas (nama_kelas) VALUES (?)',
      [data.kelas]
    );
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

async function updateKelasMapping(id, data) {
  if (!data.kelas) throw new Error('Nama Kelas wajib diisi.');

  const conn = await pool.getConnection();
  try {
    await conn.query(
      'UPDATE master_kelas SET nama_kelas = ? WHERE id = ?',
      [data.kelas, id]
    );
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

async function deleteKelasMapping(id) {
  await pool.query('DELETE FROM master_kelas WHERE id = ?', [id]);
  return { success: true };
}

async function getKotaList() {
  const [rows] = await pool.query('SELECT id, nama_kota AS kota FROM master_kota ORDER BY nama_kota ASC');
  return rows;
}

async function addKota(data) {
  if (!data.kota) throw new Error('Nama Kota wajib diisi.');
  
  const conn = await pool.getConnection();
  try {
    const [result] = await conn.query(
      'INSERT INTO master_kota (nama_kota) VALUES (?)',
      [data.kota]
    );
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

async function updateKota(id, data) {
  if (!data.kota) throw new Error('Nama Kota wajib diisi.');

  const conn = await pool.getConnection();
  try {
    await conn.query(
      'UPDATE master_kota SET nama_kota = ? WHERE id = ?',
      [data.kota, id]
    );
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

async function deleteKota(id) {
  await pool.query('DELETE FROM master_kota WHERE id = ?', [id]);
  return { success: true };
}

async function getKecamatanList() {
  const [rows] = await pool.query(`
    SELECT mk.id, mk.nama_kecamatan AS kecamatan, mk.kota_id, mkota.nama_kota AS kota
    FROM master_kecamatan mk
    LEFT JOIN master_kota mkota ON mk.kota_id = mkota.id
    ORDER BY mkota.nama_kota ASC, mk.nama_kecamatan ASC
  `);
  return rows;
}

async function addKecamatan(data) {
  if (!data.kecamatan) throw new Error('Nama Kecamatan wajib diisi.');
  if (!data.kota_id) throw new Error('Kota wajib dipilih.');
  
  const conn = await pool.getConnection();
  try {
    const [result] = await conn.query(
      'INSERT INTO master_kecamatan (nama_kecamatan, kota_id) VALUES (?, ?)',
      [data.kecamatan, data.kota_id]
    );
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

async function updateKecamatan(id, data) {
  if (!data.kecamatan) throw new Error('Nama Kecamatan wajib diisi.');
  if (!data.kota_id) throw new Error('Kota wajib dipilih.');

  const conn = await pool.getConnection();
  try {
    await conn.query(
      'UPDATE master_kecamatan SET nama_kecamatan = ?, kota_id = ? WHERE id = ?',
      [data.kecamatan, data.kota_id, id]
    );
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

async function deleteKecamatan(id) {
  await pool.query('DELETE FROM master_kecamatan WHERE id = ?', [id]);
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

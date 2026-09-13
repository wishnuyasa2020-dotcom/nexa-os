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

// ── Payment & Pricing Settings ────────────────────────────────────────────────

async function _ensurePaymentSettingsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payment_settings (
      id INT PRIMARY KEY AUTO_INCREMENT,
      bank_name VARCHAR(50) NOT NULL DEFAULT 'BCA',
      bank_account_number VARCHAR(50) NOT NULL DEFAULT '',
      bank_account_holder VARCHAR(100) NOT NULL DEFAULT '',
      bank_notes TEXT NULL,
      registration_fee DECIMAL(12, 2) NOT NULL DEFAULT 500000.00,
      core_deposit_amount DECIMAL(12, 2) NOT NULL DEFAULT 1500000.00,
      total_program_fee DECIMAL(12, 2) NOT NULL DEFAULT 15000000.00,
      discount_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
      discount_label VARCHAR(100) NULL,
      discount_end_date DATE NULL,
      qris_image_url VARCHAR(255) NULL,
      updated_by VARCHAR(100) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  // Self-healing migration for existing payment_settings table:
  const columnMigrations = [
    { col: 'discount_amount',   sql: `ADD COLUMN discount_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00 AFTER total_program_fee` },
    { col: 'discount_label',    sql: `ADD COLUMN discount_label VARCHAR(100) NULL AFTER discount_amount` },
    { col: 'discount_end_date', sql: `ADD COLUMN discount_end_date DATE NULL AFTER discount_label` },
  ];
  for (const m of columnMigrations) {
    try {
      const [cols] = await pool.query(`SHOW COLUMNS FROM payment_settings LIKE '${m.col}'`);
      if (cols.length === 0) {
        await pool.query(`ALTER TABLE payment_settings ${m.sql}`);
      }
    } catch (err) {
      console.error(`Error ensuring column ${m.col}:`, err.message);
    }
  }

  const [rows] = await pool.query('SELECT id FROM payment_settings LIMIT 1');
  if (rows.length === 0) {
    await pool.query(`
      INSERT INTO payment_settings 
        (bank_name, bank_account_number, bank_account_holder, bank_notes, registration_fee, core_deposit_amount, total_program_fee, discount_amount, discount_label)
      VALUES 
        ('BCA', '', '', 'Mohon sertakan nama lengkap calon siswa pada berita transfer.', 500000.00, 1500000.00, 15000000.00, 0.00, '')
    `);
  }
}

async function getPaymentConfig() {
  await _ensurePaymentSettingsTable();
  const [rows] = await pool.query('SELECT * FROM payment_settings ORDER BY id ASC LIMIT 1');
  if (rows.length === 0) return null;
  const r = rows[0];
  const toDateStr = (val) => val
    ? (val instanceof Date ? val : new Date(val)).toISOString().split('T')[0]
    : null;
  return {
    id: r.id,
    bankName: r.bank_name,
    bankAccountNumber: r.bank_account_number,
    bankAccountHolder: r.bank_account_holder,
    bankNotes: r.bank_notes || '',
    registrationFee: Number(r.registration_fee) || 500000,
    coreDepositAmount: Number(r.core_deposit_amount) || 1500000,
    totalProgramFee: Number(r.total_program_fee) || 15000000,
    discountAmount: Number(r.discount_amount !== undefined ? r.discount_amount : r.discount_wave_1) || 0,
    discountLabel: r.discount_label || '',
    discountEndDate: toDateStr(r.discount_end_date || r.discount_wave_1_end_date),
    qrisImageUrl: r.qris_image_url || null,
    updatedBy: r.updated_by,
    updatedAt: r.updated_at
  };
}

async function updatePaymentConfig(data, actor = null) {
  await _ensurePaymentSettingsTable();
  const bankName = data.bankName || 'BCA';
  const bankAccountNumber = String(data.bankAccountNumber || '').trim();
  const bankAccountHolder = String(data.bankAccountHolder || '').trim();
  const bankNotes = data.bankNotes !== undefined ? String(data.bankNotes).trim() : '';
  const registrationFee = Math.max(0, Number(data.registrationFee) || 500000);
  const coreDepositAmount = Math.max(0, Number(data.coreDepositAmount) || 1500000);
  const totalProgramFee = Math.max(0, Number(data.totalProgramFee) || 15000000);
  const discountAmount = Math.max(0, Number(data.discountAmount !== undefined ? data.discountAmount : data.discountWave1) || 0);
  const discountLabel = data.discountLabel !== undefined ? String(data.discountLabel).trim() : '';
  const discountEndDate = data.discountEndDate || null;
  const qrisImageUrl = data.qrisImageUrl || null;

  const [existing] = await pool.query('SELECT id FROM payment_settings ORDER BY id ASC LIMIT 1');
  if (existing.length === 0) {
    await pool.query(`
      INSERT INTO payment_settings 
        (bank_name, bank_account_number, bank_account_holder, bank_notes, registration_fee, core_deposit_amount, total_program_fee,
         discount_amount, discount_label, discount_end_date, qris_image_url, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [bankName, bankAccountNumber, bankAccountHolder, bankNotes, registrationFee, coreDepositAmount, totalProgramFee,
        discountAmount, discountLabel, discountEndDate, qrisImageUrl, actor]);
  } else {
    await pool.query(`
      UPDATE payment_settings
      SET bank_name = ?, bank_account_number = ?, bank_account_holder = ?, bank_notes = ?,
          registration_fee = ?, core_deposit_amount = ?, total_program_fee = ?,
          discount_amount = ?, discount_label = ?, discount_end_date = ?,
          qris_image_url = ?, updated_by = ?, updated_at = NOW()
      WHERE id = ?
    `, [bankName, bankAccountNumber, bankAccountHolder, bankNotes, registrationFee, coreDepositAmount, totalProgramFee,
        discountAmount, discountLabel, discountEndDate,
        qrisImageUrl, actor, existing[0].id]);
  }

  await _recordEvent('PaymentSettingsUpdated', existing[0]?.id || 1, {
    bankName, bankAccountNumber, bankAccountHolder, registrationFee, coreDepositAmount, totalProgramFee,
    discountAmount, discountLabel, discountEndDate
  }, actor);

  return getPaymentConfig();
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
  deleteKecamatan,
  getPaymentConfig,
  updatePaymentConfig
};

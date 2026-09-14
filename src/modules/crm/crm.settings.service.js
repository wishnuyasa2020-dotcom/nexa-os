'use strict';

const crypto = require('crypto');
const { pool } = require('../../config/database');
const { syncStudentCurrentState } = require('./student.projection');

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
    { col: 'program_names',     sql: `ADD COLUMN program_names TEXT NULL AFTER discount_end_date` },
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
        (bank_name, bank_account_number, bank_account_holder, bank_notes, registration_fee, core_deposit_amount, total_program_fee, discount_amount, discount_label, program_names)
      VALUES 
        ('BCA', '', '', 'Mohon sertakan nama lengkap calon siswa pada berita transfer.', 500000.00, 1500000.00, 15000000.00, 0.00, '', '')
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

  const rawPrograms = r.program_names || '';
  const programs = rawPrograms
    ? rawPrograms.split(/[\n,]/).map(p => p.trim()).filter(Boolean)
    : [];

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
    programNames: rawPrograms,
    programs,
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
  const programNames = data.programNames !== undefined ? String(data.programNames).trim() : '';
  const qrisImageUrl = data.qrisImageUrl || null;

  const [existing] = await pool.query('SELECT id FROM payment_settings ORDER BY id ASC LIMIT 1');
  if (existing.length === 0) {
    await pool.query(`
      INSERT INTO payment_settings 
        (bank_name, bank_account_number, bank_account_holder, bank_notes, registration_fee, core_deposit_amount, total_program_fee,
         discount_amount, discount_label, discount_end_date, program_names, qris_image_url, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [bankName, bankAccountNumber, bankAccountHolder, bankNotes, registrationFee, coreDepositAmount, totalProgramFee,
        discountAmount, discountLabel, discountEndDate, programNames, qrisImageUrl, actor]);
  } else {
    await pool.query(`
      UPDATE payment_settings
      SET bank_name = ?, bank_account_number = ?, bank_account_holder = ?, bank_notes = ?,
          registration_fee = ?, core_deposit_amount = ?, total_program_fee = ?,
          discount_amount = ?, discount_label = ?, discount_end_date = ?, program_names = ?,
          qris_image_url = ?, updated_by = ?, updated_at = NOW()
      WHERE id = ?
    `, [bankName, bankAccountNumber, bankAccountHolder, bankNotes, registrationFee, coreDepositAmount, totalProgramFee,
        discountAmount, discountLabel, discountEndDate, programNames,
        qrisImageUrl, actor, existing[0].id]);
  }

  await _recordEvent('PaymentSettingsUpdated', existing[0]?.id || 1, {
    bankName, bankAccountNumber, bankAccountHolder, registrationFee, coreDepositAmount, totalProgramFee,
    discountAmount, discountLabel, discountEndDate, programNames
  }, actor);

  return getPaymentConfig();
}

// ── Payment Verification (Admin & Manager) ───────────────────────────────────

async function getPaymentVerifications(params = {}) {
  const status = (params.status || 'all').toLowerCase();
  const search = (params.search || '').trim();

  let query = `
    SELECT 
      rt.id,
      rt.token,
      rt.id_siswa,
      rt.nama_lengkap AS nama_siswa,
      rt.no_wa,
      rt.status,
      rt.expires_at,
      rt.created_at,
      ps.nama_program,
      ps.nama_ortu,
      ps.wa_ortu,
      ps.pekerjaan_ortu,
      COALESCE(sek.nama_sekolah, ms.sekolah_asal) AS nama_sekolah,
      sp.cro,
      sp.commercial_state,
      sp.status_terkini,
      COALESCE(pay.registration_fee, 500000) AS registration_fee
    FROM registration_tokens rt
    LEFT JOIN master_siswa ms ON ms.id_siswa = rt.id_siswa
    LEFT JOIN master_sekolah sek ON sek.id_sekolah = ms.id_sekolah
    LEFT JOIN pendaftaran_siswa ps ON ps.id_siswa = rt.id_siswa
    LEFT JOIN (
      SELECT sp1.id_siswa, sp1.cro, sp1.commercial_state, sp1.status_terkini
      FROM siswa_periode sp1
      INNER JOIN (
        SELECT id_siswa, MAX(COALESCE(last_updated, created_date)) AS max_date
        FROM siswa_periode GROUP BY id_siswa
      ) sp_max ON sp1.id_siswa = sp_max.id_siswa AND COALESCE(sp1.last_updated, sp1.created_date) = sp_max.max_date
    ) sp ON sp.id_siswa = rt.id_siswa
    LEFT JOIN (
      SELECT registration_fee FROM payment_settings LIMIT 1
    ) pay ON 1=1
    WHERE 1=1
  `;
  const queryParams = [];

  if (status && status !== 'all') {
    query += ' AND rt.status = ?';
    queryParams.push(status);
  }

  if (search) {
    query += ' AND (rt.nama_lengkap LIKE ? OR rt.no_wa LIKE ? OR rt.id_siswa LIKE ? OR ps.nama_ortu LIKE ?)';
    const s = `%${search}%`;
    queryParams.push(s, s, s, s);
  }

  query += ' ORDER BY rt.created_at DESC LIMIT 100';

  const [rows] = await pool.query(query, queryParams);

  // Ambil summary statistik
  const [summaryRows] = await pool.query(`
    SELECT 
      COUNT(*) AS total_all,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS total_pending,
      SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS total_paid,
      SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) AS total_expired
    FROM registration_tokens
  `);

  return {
    items: rows,
    summary: summaryRows[0] || { total_all: 0, total_pending: 0, total_paid: 0, total_expired: 0 }
  };
}

async function verifyPaymentRegistration(token, data = {}, actor = 'Admin') {
  if (!token) throw new Error('Token registrasi tidak valid.');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [tokens] = await conn.query('SELECT * FROM registration_tokens WHERE token = ? FOR UPDATE', [token]);
    if (tokens.length === 0) {
      throw new Error('Token pendaftaran tidak ditemukan.');
    }
    const tokenRecord = tokens[0];
    if (tokenRecord.status === 'paid') {
      throw new Error('Pembayaran untuk token ini sudah terverifikasi sebelumnya.');
    }

    const idSiswa = tokenRecord.id_siswa;
    const nominal = Number(data.nominal) || 500000;
    const paymentMethod = data.paymentMethod || 'Transfer Bank';
    const notes = data.notes || '';

    // 1. Update status token ke 'paid'
    await conn.query(
      "UPDATE registration_tokens SET status = 'paid' WHERE token = ?",
      [token]
    );

    // 2. Ambil state siswa terkini di siswa_periode
    const [spRows] = await conn.query(
      'SELECT id_record, commercial_state, status_terkini, marketing_period, cro FROM siswa_periode WHERE id_siswa = ? ORDER BY COALESCE(last_updated, created_date) DESC, id_record DESC LIMIT 1',
      [idSiswa]
    );

    const prevCommercialState = spRows[0]?.commercial_state || 'Opportunity';
    const marketingPeriod = spRows[0]?.marketing_period || null;
    const cro = spRows[0]?.cro || null;

    // 3. Update siswa_periode ke Registered Opportunity & Terdaftar Formulir
    if (spRows.length > 0) {
      await conn.query(
        `UPDATE siswa_periode 
         SET commercial_state = 'Registered Opportunity',
             status_terkini = 'Terdaftar Formulir',
             last_updated = NOW()
         WHERE id_record = ?`,
        [spRows[0].id_record]
      );
    }

    // 4. Catat event immutable ke events_log
    const eventId = `EVT-PAY-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const eventPayload = {
      id_siswa: idSiswa,
      nama_siswa: tokenRecord.nama_lengkap,
      no_wa: tokenRecord.no_wa,
      token,
      nominal,
      payment_method: paymentMethod,
      payment_type: 'Registration Fee',
      notes,
      verified_by: actor,
      previous_state: prevCommercialState,
      new_state: 'Registered Opportunity'
    };

    await conn.query(
      `INSERT INTO events_log (event_id, aggregate_type, aggregate_id, event_type, payload, actor_id, marketing_period, created_at)
       VALUES (?, 'student', ?, 'RegistrationFeePaid', ?, ?, ?, NOW())`,
      [eventId, idSiswa, JSON.stringify(eventPayload), actor, marketingPeriod]
    );

    // 5. Catat ke aktivitas_siswa (Audit Trail)
    const [sekRows] = await conn.query(
      'SELECT ms.sekolah_asal, sek.nama_sekolah FROM master_siswa ms LEFT JOIN master_sekolah sek ON sek.id_sekolah = ms.id_sekolah WHERE ms.id_siswa = ?',
      [idSiswa]
    );
    const idSekolahNama = sekRows[0]?.nama_sekolah || sekRows[0]?.sekolah_asal || null;

    await conn.query(
      `INSERT INTO aktivitas_siswa 
         (tanggal, id_siswa, id_sekolah_nama, jenis_aktivitas, hasil_aktivitas, status_sebelum, status_sesudah, catatan, pj_cro, event_type, channel, marketing_period)
       VALUES (CURDATE(), ?, ?, 'Pembayaran Formulir', 'Verifikasi Berhasil', ?, 'Registered Opportunity', ?, ?, 'RegistrationFeePaid', ?, ?)`,
      [
        idSiswa,
        idSekolahNama,
        prevCommercialState,
        `Biaya pendaftaran Rp ${nominal.toLocaleString('id-ID')} diverifikasi oleh ${actor}. Catatan: ${notes || '-'}. Metode: ${paymentMethod}`,
        cro,
        paymentMethod,
        marketingPeriod
      ]
    );

    await conn.commit();

    // 6. Sinkronisasi Read-Model Projection (student_current_state)
    await syncStudentCurrentState(conn, [idSiswa]);

    return {
      token,
      id_siswa: idSiswa,
      nama_siswa: tokenRecord.nama_lengkap,
      commercial_state: 'Registered Opportunity',
      status_terkini: 'Terdaftar Formulir',
      nominal,
      verified_by: actor
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function rejectPaymentRegistration(token, reason = '', actor = 'Admin') {
  if (!token) throw new Error('Token registrasi tidak valid.');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [tokens] = await conn.query('SELECT * FROM registration_tokens WHERE token = ? FOR UPDATE', [token]);
    if (tokens.length === 0) {
      throw new Error('Token pendaftaran tidak ditemukan.');
    }
    const tokenRecord = tokens[0];
    if (tokenRecord.status === 'paid') {
      throw new Error('Tidak dapat membatalkan token yang sudah lunas terverifikasi.');
    }

    await conn.query("UPDATE registration_tokens SET status = 'expired' WHERE token = ?", [token]);

    const eventId = `EVT-REJ-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    await conn.query(
      `INSERT INTO events_log (event_id, aggregate_type, aggregate_id, event_type, payload, actor_id, created_at)
       VALUES (?, 'student', ?, 'RegistrationCancelled', ?, ?, NOW())`,
      [eventId, tokenRecord.id_siswa, JSON.stringify({ token, reason, actor }), actor]
    );

    await conn.commit();
    return { token, status: 'expired', reason };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function searchSiswaForPayment(keyword = '') {
  const q = String(keyword || '').trim();
  if (!q || q.length < 2) return [];

  const [rows] = await pool.query(`
    SELECT 
      ms.id_siswa,
      ms.nama_lengkap,
      ms.no_wa,
      ms.kelas,
      COALESCE(sek.nama_sekolah, ms.sekolah_asal) AS nama_sekolah,
      sp.cro,
      sp.commercial_state,
      sp.status_terkini,
      rt.token AS pending_token,
      rt.status AS token_status
    FROM master_siswa ms
    LEFT JOIN master_sekolah sek ON sek.id_sekolah = ms.id_sekolah
    LEFT JOIN (
      SELECT sp1.id_siswa, sp1.cro, sp1.commercial_state, sp1.status_terkini
      FROM siswa_periode sp1
      INNER JOIN (
        SELECT id_siswa, MAX(COALESCE(last_updated, created_date)) AS max_date
        FROM siswa_periode GROUP BY id_siswa
      ) sp_max ON sp1.id_siswa = sp_max.id_siswa AND COALESCE(sp1.last_updated, sp1.created_date) = sp_max.max_date
    ) sp ON sp.id_siswa = ms.id_siswa
    LEFT JOIN (
      SELECT id_siswa, token, status FROM registration_tokens WHERE status = 'pending' ORDER BY created_at DESC LIMIT 1
    ) rt ON rt.id_siswa = ms.id_siswa
    WHERE ms.nama_lengkap LIKE ? OR ms.no_wa LIKE ? OR ms.id_siswa LIKE ?
    ORDER BY ms.nama_lengkap ASC
    LIMIT 20
  `, [`%${q}%`, `%${q}%`, `%${q}%`]);

  return rows;
}

async function manualVerifySiswaPayment(idSiswa, data = {}, actor = 'Admin') {
  if (!idSiswa) throw new Error('ID Siswa wajib disertakan.');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Periksa apakah siswa memiliki pending token
    const [existingTokens] = await conn.query(
      "SELECT token, status FROM registration_tokens WHERE id_siswa = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1",
      [idSiswa]
    );

    let token = existingTokens[0]?.token;

    if (!token) {
      // Ambil biodata siswa untuk generate token paid
      const [studentRows] = await conn.query(
        'SELECT nama_lengkap, no_wa FROM master_siswa WHERE id_siswa = ?',
        [idSiswa]
      );
      if (studentRows.length === 0) {
        throw new Error('Data siswa tidak ditemukan.');
      }
      token = crypto.randomBytes(20).toString('hex');
      const nama = studentRows[0].nama_lengkap || 'Siswa';
      const noWa = studentRows[0].no_wa || '';
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await conn.query(
        `INSERT INTO registration_tokens (token, id_siswa, nama_lengkap, no_wa, status, expires_at, created_at)
         VALUES (?, ?, ?, ?, 'paid', ?, NOW())`,
        [token, idSiswa, nama, noWa, expiresAt]
      );
    } else {
      await conn.query("UPDATE registration_tokens SET status = 'paid' WHERE token = ?", [token]);
    }

    // Ambil state periode
    const [spRows] = await conn.query(
      'SELECT id_record, commercial_state, status_terkini, marketing_period, cro FROM siswa_periode WHERE id_siswa = ? ORDER BY COALESCE(last_updated, created_date) DESC, id_record DESC LIMIT 1',
      [idSiswa]
    );

    const prevCommercialState = spRows[0]?.commercial_state || 'Opportunity';
    const marketingPeriod = spRows[0]?.marketing_period || null;
    const cro = spRows[0]?.cro || null;
    const nominal = Number(data.nominal) || 500000;
    const paymentMethod = data.paymentMethod || 'Transfer Bank Manual';
    const notes = data.notes || '';

    if (spRows.length > 0) {
      await conn.query(
        `UPDATE siswa_periode 
         SET commercial_state = 'Registered Opportunity',
             status_terkini = 'Terdaftar Formulir',
             last_updated = NOW()
         WHERE id_record = ?`,
        [spRows[0].id_record]
      );
    }

    // Insert event immutable
    const eventId = `EVT-PAY-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    await conn.query(
      `INSERT INTO events_log (event_id, aggregate_type, aggregate_id, event_type, payload, actor_id, marketing_period, created_at)
       VALUES (?, 'student', ?, 'RegistrationFeePaid', ?, ?, ?, NOW())`,
      [
        eventId,
        idSiswa,
        JSON.stringify({
          id_siswa: idSiswa,
          token,
          nominal,
          payment_method: paymentMethod,
          payment_type: 'Registration Fee',
          notes,
          verified_by: actor,
          previous_state: prevCommercialState,
          new_state: 'Registered Opportunity'
        }),
        actor,
        marketingPeriod
      ]
    );

    // Insert aktivitas_siswa
    const [sekRows] = await conn.query(
      'SELECT ms.sekolah_asal, sek.nama_sekolah FROM master_siswa ms LEFT JOIN master_sekolah sek ON sek.id_sekolah = ms.id_sekolah WHERE ms.id_siswa = ?',
      [idSiswa]
    );
    const idSekolahNama = sekRows[0]?.nama_sekolah || sekRows[0]?.sekolah_asal || null;

    await conn.query(
      `INSERT INTO aktivitas_siswa 
         (tanggal, id_siswa, id_sekolah_nama, jenis_aktivitas, hasil_aktivitas, status_sebelum, status_sesudah, catatan, pj_cro, event_type, channel, marketing_period)
       VALUES (CURDATE(), ?, ?, 'Pembayaran Formulir', 'Verifikasi Berhasil', ?, 'Registered Opportunity', ?, ?, 'RegistrationFeePaid', ?, ?)`,
      [
        idSiswa,
        idSekolahNama,
        prevCommercialState,
        `Pembayaran formulir Rp ${nominal.toLocaleString('id-ID')} dicatat manual oleh ${actor}. Catatan: ${notes || '-'}. Metode: ${paymentMethod}`,
        cro,
        paymentMethod,
        marketingPeriod
      ]
    );

    await conn.commit();

    await syncStudentCurrentState(conn, [idSiswa]);

    return {
      token,
      id_siswa: idSiswa,
      commercial_state: 'Registered Opportunity',
      status_terkini: 'Terdaftar Formulir',
      nominal,
      verified_by: actor
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
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
  updatePaymentConfig,
  getPaymentVerifications,
  verifyPaymentRegistration,
  rejectPaymentRegistration,
  searchSiswaForPayment,
  manualVerifySiswaPayment
};

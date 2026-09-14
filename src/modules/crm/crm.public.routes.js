'use strict';

/**
 * crm.public.routes.js
 * Routes untuk akses publik (tanpa JWT), misalnya Form Pendaftaran Mandiri (Self-Registration)
 * dan Form Sosialisasi Siswa dengan arsitektur Event-Sourcing CQRS.
 */

const { Router } = require('express');
const crypto = require('crypto');
const { pool, mainPool, tenantStorage } = require('../../config/database');
const siswaSvc = require('./crm.siswa.service');
const settingsSvc = require('./crm.settings.service');
const subscriptionCtrl = require('./subscription/subscription.controller');

const router = Router();

// ── In-Memory Rate Limiting (Anti-Spam) ──────────────────────────────────────
const _rateLimits = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 menit
const MAX_REQUESTS_PER_WINDOW = 15;     // maks 15 request per menit per IP

function rateLimiter(req, res, next) {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const clientData = _rateLimits.get(ip) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS };

  if (now > clientData.resetTime) {
    clientData.count = 1;
    clientData.resetTime = now + RATE_LIMIT_WINDOW_MS;
  } else {
    clientData.count += 1;
  }

  _rateLimits.set(ip, clientData);

  if (clientData.count > MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({
      status: 'error',
      message: 'Terlalu banyak permintaan. Silakan tunggu 1 menit sebelum mencoba lagi.'
    });
  }

  next();
}

// ── Helper: Normalisasi Nomor WA ─────────────────────────────────────────────
function normalizeWa(wa) {
  if (!wa) return '';
  let clean = String(wa).replace(/\D/g, '');
  if (clean.startsWith('08')) {
    clean = '62' + clean.slice(1);
  } else if (clean.startsWith('8')) {
    clean = '62' + clean;
  }
  return clean;
}

// ── Helper: Lookup Tenant dari nexamain ──────────────────────────────────────
async function _lookupTenant(slugOrId) {
  if (!slugOrId || !mainPool) return null;
  const [rows] = await mainPool.query(
    `SELECT t.tenant_id, t.brand_name, t.whatsapp_number, t.whatsapp_phone_id, td.db_host, td.db_port, td.db_name, td.db_user, td.db_password
     FROM tenants t
     JOIN tenant_databases td ON t.tenant_id = td.tenant_id
     WHERE (t.tenant_id = ? OR LOWER(t.tenant_id) = LOWER(?) OR LOWER(t.brand_name) = LOWER(?))
       AND t.status = 'ACTIVE'
     LIMIT 1`,
    [slugOrId, slugOrId, slugOrId]
  );
  return rows[0] || null;
}

// ── GET /:tenantSlug/info — Info Brand & Kontak Tenant ────────────────────────
router.get('/:tenantSlug/info', async (req, res) => {
  try {
    const tenant = await _lookupTenant(req.params.tenantSlug);
    if (!tenant) {
      return res.status(404).json({ status: 'error', message: 'Tenant tidak ditemukan' });
    }
    const realWa = tenant.whatsapp_number || (tenant.tenant_id === 'derma-indonesia' ? '6285770400134' : '');
    res.json({
      status: 'ok',
      data: {
        tenantId: tenant.tenant_id,
        brandName: tenant.brand_name,
        whatsappNumber: realWa
      }
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ── Helper: Self-Healing Table pendaftaran_siswa ─────────────────────────────
async function _ensurePendaftaranSiswaTable(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS pendaftaran_siswa (
      id INT AUTO_INCREMENT PRIMARY KEY,
      id_siswa VARCHAR(50) NOT NULL UNIQUE,
      nik VARCHAR(20) NULL,
      gender ENUM('Laki-laki', 'Perempuan') NULL,
      tanggal_lahir DATE NULL,
      alamat_lengkap TEXT NULL,
      nama_program VARCHAR(150) NULL,
      nama_ortu VARCHAR(150) NULL,
      wa_ortu VARCHAR(25) NULL,
      tgl_lahir_ortu DATE NULL,
      pekerjaan_ortu VARCHAR(50) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_siswa (id_siswa)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
}

// ── GET /:tenantSlug/sekolah — List Sekolah Aktif untuk Dropdown Form ─────────
router.get('/:tenantSlug/sekolah', async (req, res) => {
  try {
    const tenant = await _lookupTenant(req.params.tenantSlug);
    if (!tenant) {
      return res.status(404).json({ status: 'error', message: 'Tenant tidak ditemukan' });
    }

    await tenantStorage.run(tenant.tenant_id, async () => {
      const [rows] = await pool.query(
        `SELECT id_sekolah, nama_sekolah, IFNULL(jenjang, 'SMA/SMK') as jenjang 
         FROM master_sekolah 
         WHERE status_sekolah = 'aktif' OR status_sekolah IS NULL 
         ORDER BY nama_sekolah ASC`
      );
      res.json({ status: 'ok', data: rows });
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ── POST /:tenantSlug/register — Form Publik Self-Registration (Jalur 1) ─────
router.post('/:tenantSlug/register', rateLimiter, async (req, res) => {
  try {
    const tenantSlug = req.params.tenantSlug;
    const tenant = await _lookupTenant(tenantSlug);
    if (!tenant) {
      return res.status(404).json({ status: 'error', message: 'Tenant tidak ditemukan' });
    }

    const {
      nama_lengkap,
      no_wa,
      id_sekolah,
      asal_sekolah,
      kelas,
      minat_awal,
      rencana_lulus,
      consent_wa,
      opt_in_wa,
      nik,
      gender,
      tanggal_lahir,
      alamat_lengkap,
      nama_program,
      nama_ortu,
      wa_ortu,
      tgl_lahir_ortu,
      pekerjaan_ortu
    } = req.body;

    // 1. Validasi Wajib Nama & WhatsApp
    if (!nama_lengkap || !nama_lengkap.trim()) {
      return res.status(400).json({ status: 'error', message: 'Nama lengkap wajib diisi.' });
    }

    const waClean = normalizeWa(no_wa);
    if (!waClean || waClean.length < 10 || waClean.length > 16) {
      return res.status(400).json({ status: 'error', message: 'Nomor WhatsApp tidak valid (minimal 10 digit).' });
    }

    // 2. Kepatuhan Consent Engine (Pilar Etika & Privasi)
    const isConsentGranted = consent_wa === true || consent_wa === 'true' || opt_in_wa === 'Ya';
    if (!isConsentGranted) {
      return res.status(400).json({
        status: 'error',
        message: 'Persetujuan komunikasi WhatsApp (Consent Opt-In) wajib dicentang.'
      });
    }

    await tenantStorage.run(tenant.tenant_id, async () => {
      // Ambil Periode Marketing Aktif
      const [pRows] = await pool.query(
        "SELECT nama_period FROM marketing_period WHERE status = 'aktif' ORDER BY created_date DESC LIMIT 1"
      );
      const mp = pRows.length > 0 ? pRows[0].nama_period : '-';

      // Cek Duplikasi Nomor WhatsApp
      const [existing] = await pool.query(
        "SELECT id_siswa FROM master_siswa WHERE wa = ? LIMIT 1",
        [waClean]
      );
      if (existing.length > 0) {
        return res.status(409).json({
          status: 'error',
          message: 'Nomor WhatsApp ini sudah terdaftar di sistem. Tim konselor kami akan segera menghubungi Anda.'
        });
      }

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        // Resolve Sekolah
        let targetSekolahId = id_sekolah;
        if (!targetSekolahId && asal_sekolah && asal_sekolah.trim()) {
          const [sekRows] = await conn.query(
            "SELECT id_sekolah FROM master_sekolah WHERE nama_sekolah = ? LIMIT 1",
            [asal_sekolah.trim()]
          );
          if (sekRows.length > 0) {
            targetSekolahId = sekRows[0].id_sekolah;
          } else {
            targetSekolahId = `SEK-${Date.now().toString().slice(-6)}`;
            await conn.query(
              "INSERT INTO master_sekolah (id_sekolah, nama_sekolah, jenjang, status_sekolah) VALUES (?, ?, 'SMA/SMK', 'aktif')",
              [targetSekolahId, asal_sekolah.trim()]
            );
          }
        }

        // Resolve Kelas
        let kelasId = null;
        if (kelas && kelas.trim()) {
          const [kRows] = await conn.query('SELECT id FROM master_kelas WHERE nama_kelas = ? LIMIT 1', [kelas.trim()]);
          if (kRows.length > 0) {
            kelasId = kRows[0].id;
          } else {
            const [insK] = await conn.query('INSERT INTO master_kelas (nama_kelas) VALUES (?)', [kelas.trim()]);
            kelasId = insK.insertId;
          }
        }

        const idSiswa = `STD-${Date.now().toString().slice(-6)}-${Math.floor(Math.random()*1000)}`;
        const minat = minat_awal || 'Ya';
        const rencana = rencana_lulus || 'Kerja';
        const prioritas = (minat === 'Ya' && rencana === 'Kerja') ? 'Tinggi' : 'Sedang';

        // 1. Insert master_siswa (dengan opt_in_wa = 'Ya' dan alamat jika ada)
        await conn.query(`
          INSERT INTO master_siswa 
            (id_siswa, id_sekolah, nama_lengkap, wa, kelas_id, minat_awal, rencana_lulus, alamat, opt_in_wa, created_date)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Ya', NOW())
        `, [
          idSiswa,
          targetSekolahId || null,
          nama_lengkap.trim(),
          waClean,
          kelasId,
          minat,
          rencana,
          alamat_lengkap ? alamat_lengkap.trim() : null
        ]);

        // 1b. Insert data spesifik ke pendaftaran_siswa
        if (nik || gender || tanggal_lahir || alamat_lengkap || nama_program || nama_ortu || wa_ortu || tgl_lahir_ortu || pekerjaan_ortu) {
          await _ensurePendaftaranSiswaTable(conn);
          const waOrtuClean = wa_ortu ? normalizeWa(wa_ortu) : null;
          await conn.query(`
            INSERT INTO pendaftaran_siswa 
              (id_siswa, nik, gender, tanggal_lahir, alamat_lengkap, nama_program, nama_ortu, wa_ortu, tgl_lahir_ortu, pekerjaan_ortu)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            idSiswa,
            nik ? nik.trim() : null,
            gender || null,
            tanggal_lahir || null,
            alamat_lengkap ? alamat_lengkap.trim() : null,
            nama_program ? nama_program.trim() : null,
            nama_ortu ? nama_ortu.trim() : null,
            waOrtuClean,
            tgl_lahir_ortu || null,
            pekerjaan_ortu || null
          ]);
        }

        // 2. Insert siswa_periode (Commercial State: 'Known', Status: 'Data Masuk', cro = NULL/Unassigned)
        const idRecord = `SWP-${Date.now().toString().slice(-6)}-${Math.floor(Math.random()*1000)}`;
        await conn.query(`
          INSERT INTO siswa_periode 
            (id_record, id_siswa, nama_siswa, marketing_period, status_terkini, commercial_state, next_action, due_date, cro, prioritas, created_date)
          VALUES (?, ?, ?, ?, 'Data Masuk', 'Known', 'Screening', DATE_ADD(CURDATE(), INTERVAL 1 DAY), NULL, ?, NOW())
        `, [idRecord, idSiswa, nama_lengkap.trim(), mp, prioritas]);

        // 3. Event-Sourcing: LeadCapturedViaForm
        const evtLeadId = `EVT-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        await conn.query(`
          INSERT INTO events_log 
            (event_id, aggregate_type, aggregate_id, event_type, payload, actor_id, marketing_period)
          VALUES (?, 'Siswa', ?, 'LeadCapturedViaForm', ?, 'PublicForm', ?)
        `, [
          evtLeadId,
          idSiswa,
          JSON.stringify({
            id_siswa: idSiswa,
            nama_lengkap: nama_lengkap.trim(),
            wa: waClean,
            id_sekolah: targetSekolahId || null,
            kelas: kelas || null,
            minat_awal: minat,
            rencana_lulus: rencana,
            tenantSlug,
            channel: 'Public Self-Registration'
          }),
          mp
        ]);

        // 4. Event-Sourcing: ConsentOptInRecorded
        const evtConsentId = `EVT-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        await conn.query(`
          INSERT INTO events_log 
            (event_id, aggregate_type, aggregate_id, event_type, payload, actor_id, marketing_period)
          VALUES (?, 'Siswa', ?, 'ConsentOptInRecorded', ?, 'PublicForm', ?)
        `, [
          evtConsentId,
          idSiswa,
          JSON.stringify({
            id_siswa: idSiswa,
            wa: waClean,
            consent: 'Granted',
            statement: 'Saya bersedia dihubungi via WhatsApp oleh tim konselor',
            channel: 'Web Form Checkbox',
            timestamp: new Date().toISOString()
          }),
          mp
        ]);

        await conn.commit();

        res.status(201).json({
          status: 'ok',
          data: {
            id: idSiswa,
            nama: nama_lengkap.trim(),
            wa: waClean,
            brandName: tenant.brand_name,
            whatsappPhone: tenant.whatsapp_phone_id
          },
          message: 'Pendaftaran berhasil diterima.'
        });
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    });
  } catch (err) {
    console.error('[public/register] Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ── BACKWARD COMPATIBILITY ───────────────────────────────────────────────────

// GET /api/public/sekolah/:id — Ambil info sekolah untuk header form lama
router.get('/sekolah/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id_sekolah, nama_sekolah, jenjang FROM master_sekolah WHERE id_sekolah = ?", 
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Sekolah tidak ditemukan' });
    }
    res.json({ status: 'ok', data: rows[0] });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// POST /api/public/form-siswa/:sekolahId — Submit form CRM sosialisasi lama
router.post('/form-siswa/:sekolahId', async (req, res) => {
  try {
    const sekolahId = req.params.sekolahId;
    const { nama_lengkap, no_wa, kelas, minat_awal, rencana_lulus, pj_cro, consent_wa, opt_in_wa } = req.body;

    if (!nama_lengkap || !no_wa || !pj_cro) {
      return res.status(400).json({ status: 'error', message: 'Data tidak lengkap (* wajib)' });
    }

    const isConsent = consent_wa === true || consent_wa === 'true' || opt_in_wa === 'Ya';
    if (!isConsent) {
      return res.status(400).json({ status: 'error', message: 'Persetujuan WhatsApp wajib dicentang.' });
    }

    const dummyUser = { nama: pj_cro, role: 'CRO' };
    const data = {
      id_sekolah: sekolahId,
      nama_lengkap,
      no_wa,
      kelas,
      minat_awal: minat_awal || 'Ragu',
      rencana_lulus: rencana_lulus || 'Belum Tahu',
      pj_cro,
      opt_in_wa: 'Ya'
    };

    const result = await siswaSvc.tambahSiswa(data, dummyUser);
    res.status(201).json({ status: 'ok', data: result });
  } catch (err) {
    console.error('[public] form-siswa error:', err);
    res.status(400).json({ status: 'error', message: err.message });
  }
});

// ── PUBLIC PAYMENT & PRICING CONFIG ──────────────────────────────────────────
// GET /api/public/payment-config — Ambil konfigurasi rekening & biaya untuk formulir publik (global fallback)
router.get('/payment-config', async (req, res) => {
  try {
    const config = await settingsSvc.getPaymentConfig();
    res.json({ status: 'ok', data: config });
  } catch (err) {
    console.error('[public/payment-config] Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// GET /:tenantSlug/payment-config — Ambil konfigurasi rekening & biaya per-tenant
router.get('/:tenantSlug/payment-config', async (req, res) => {
  try {
    const tenant = await _lookupTenant(req.params.tenantSlug);
    if (!tenant) {
      return res.status(404).json({ status: 'error', message: 'Tenant tidak ditemukan' });
    }
    await tenantStorage.run(tenant.tenant_id, async () => {
      const config = await settingsSvc.getPaymentConfig();
      res.json({ status: 'ok', data: config });
    });
  } catch (err) {
    console.error('[public/:tenantSlug/payment-config] Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ── REGISTRATION TOKEN (2-Step Form Resume) ───────────────────────────────────
// POST /:tenantSlug/reg-token — Simpan Step-1 biodata & buat token untuk resume Step-2
router.post('/:tenantSlug/reg-token', rateLimiter, async (req, res) => {
  try {
    const tenant = await _lookupTenant(req.params.tenantSlug);
    if (!tenant) {
      return res.status(404).json({ status: 'error', message: 'Tenant tidak ditemukan' });
    }

    const { id_siswa, nama_lengkap, no_wa } = req.body;
    if (!id_siswa || !nama_lengkap) {
      return res.status(400).json({ status: 'error', message: 'id_siswa & nama_lengkap wajib diisi.' });
    }

    await tenantStorage.run(tenant.tenant_id, async () => {
      // Cek apakah siswa ini sudah punya token aktif
      const [existing] = await pool.query(
        `SELECT token, status FROM registration_tokens WHERE id_siswa = ? ORDER BY created_at DESC LIMIT 1`,
        [id_siswa]
      );

      if (existing.length > 0 && existing[0].status === 'pending') {
        // Kembalikan token lama yang masih aktif (resume)
        return res.json({ status: 'ok', data: { token: existing[0].token }, message: 'Token existing ditemukan.' });
      }

      // Buat token baru
      const token = crypto.randomBytes(20).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 hari

      // Self-healing: pastikan tabel ada
      await pool.query(`
        CREATE TABLE IF NOT EXISTS registration_tokens (
          id INT AUTO_INCREMENT PRIMARY KEY,
          token VARCHAR(64) NOT NULL UNIQUE,
          id_siswa VARCHAR(50) NOT NULL,
          nama_lengkap VARCHAR(200) NOT NULL,
          no_wa VARCHAR(20) NOT NULL,
          status ENUM('pending','paid','expired') DEFAULT 'pending',
          expires_at TIMESTAMP NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_token (token),
          INDEX idx_siswa (id_siswa)
        )
      `);

      await pool.query(
        `INSERT INTO registration_tokens (token, id_siswa, nama_lengkap, no_wa, expires_at) VALUES (?, ?, ?, ?, ?)`,
        [token, id_siswa, nama_lengkap, no_wa || '', expiresAt]
      );

      res.status(201).json({ status: 'ok', data: { token }, message: 'Token registrasi dibuat.' });
    });
  } catch (err) {
    console.error('[public/:tenantSlug/reg-token] Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// GET /:tenantSlug/reg-token/:token — Ambil data siswa berdasarkan token (untuk resume Step-2)
router.get('/:tenantSlug/reg-token/:token', async (req, res) => {
  try {
    const tenant = await _lookupTenant(req.params.tenantSlug);
    if (!tenant) {
      return res.status(404).json({ status: 'error', message: 'Tenant tidak ditemukan' });
    }

    await tenantStorage.run(tenant.tenant_id, async () => {
      // Pastikan tabel pendaftaran_siswa ada
      await _ensurePendaftaranSiswaTable(pool);

      const [rows] = await pool.query(
        `SELECT 
          rt.token, rt.id_siswa, rt.nama_lengkap, rt.no_wa, rt.status, rt.expires_at,
          ms.id_sekolah, ms.kelas, ms.minat_awal, ms.rencana_lulus, ms.alamat,
          sek.nama_sekolah,
          ps.nik, ps.gender, DATE_FORMAT(ps.tanggal_lahir, '%Y-%m-%d') as tanggal_lahir,
          ps.alamat_lengkap, ps.nama_program, ps.nama_ortu, ps.wa_ortu,
          DATE_FORMAT(ps.tgl_lahir_ortu, '%Y-%m-%d') as tgl_lahir_ortu, ps.pekerjaan_ortu
         FROM registration_tokens rt
         LEFT JOIN master_siswa ms ON ms.id_siswa = rt.id_siswa
         LEFT JOIN master_sekolah sek ON sek.id_sekolah = ms.id_sekolah
         LEFT JOIN pendaftaran_siswa ps ON ps.id_siswa = rt.id_siswa
         WHERE rt.token = ? LIMIT 1`,
        [req.params.token]
      );

      if (rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Token tidak valid atau sudah kedaluwarsa.' });
      }

      const tokenRow = rows[0];
      if (tokenRow.status === 'paid') {
        return res.status(410).json({ status: 'paid', message: 'Pendaftaran ini sudah dikonfirmasi.' });
      }
      if (new Date(tokenRow.expires_at) < new Date()) {
        return res.status(410).json({ status: 'expired', message: 'Link pendaftaran ini sudah kedaluwarsa (7 hari). Silakan mendaftar ulang.' });
      }

      // Ambil payment config sekaligus (termasuk list program)
      const paymentConfig = await settingsSvc.getPaymentConfig();

      res.json({
        status: 'ok',
        data: {
          token: tokenRow.token,
          idSiswa: tokenRow.id_siswa,
          namaLengkap: tokenRow.nama_lengkap,
          noWa: tokenRow.no_wa,
          idSekolah: tokenRow.id_sekolah || null,
          namaSekolah: tokenRow.nama_sekolah || null,
          kelas: tokenRow.kelas || null,
          minatAwal: tokenRow.minat_awal || 'Ya',
          rencanaLulus: tokenRow.rencana_lulus || 'Kerja',
          tokenStatus: tokenRow.status,
          expiresAt: tokenRow.expires_at,
          brandName: tenant.brand_name,
          whatsappNumber: tenant.whatsapp_number || (tenant.tenant_id === 'derma-indonesia' ? '6285770400134' : ''),
          paymentConfig,
          nik: tokenRow.nik || '',
          gender: tokenRow.gender || '',
          tanggalLahir: tokenRow.tanggal_lahir || '',
          alamatLengkap: tokenRow.alamat_lengkap || tokenRow.alamat || '',
          namaProgram: tokenRow.nama_program || '',
          namaOrtu: tokenRow.nama_ortu || '',
          waOrtu: tokenRow.wa_ortu || '',
          tglLahirOrtu: tokenRow.tgl_lahir_ortu || '',
          pekerjaanOrtu: tokenRow.pekerjaan_ortu || '',
          programs: paymentConfig?.programs || []
        }
      });
    });
  } catch (err) {
    console.error('[public/:tenantSlug/reg-token/:token] Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// PUT /:tenantSlug/reg-token/:token — Update biodata siswa & orang tua dari form pendaftaran (Mode Edit)
router.put('/:tenantSlug/reg-token/:token', rateLimiter, async (req, res) => {
  try {
    const tenant = await _lookupTenant(req.params.tenantSlug);
    if (!tenant) {
      return res.status(404).json({ status: 'error', message: 'Tenant tidak ditemukan' });
    }

    const {
      nama_lengkap,
      no_wa,
      id_sekolah,
      asal_sekolah,
      nik,
      gender,
      tanggal_lahir,
      alamat_lengkap,
      nama_program,
      nama_ortu,
      wa_ortu,
      tgl_lahir_ortu,
      pekerjaan_ortu
    } = req.body;

    await tenantStorage.run(tenant.tenant_id, async () => {
      await _ensurePendaftaranSiswaTable(pool);

      const [tokens] = await pool.query(
        `SELECT id_siswa, status, expires_at FROM registration_tokens WHERE token = ? LIMIT 1`,
        [req.params.token]
      );

      if (tokens.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Token tidak valid.' });
      }

      const tokenRecord = tokens[0];
      if (tokenRecord.status === 'paid') {
        return res.status(400).json({ status: 'error', message: 'Pendaftaran sudah dikonfirmasi dan tidak dapat diubah.' });
      }

      const idSiswa = tokenRecord.id_siswa;

      // 1. Resolve id_sekolah jika ada perubahan atau sekolah baru
      let targetSekolahId = id_sekolah;
      if (!targetSekolahId && asal_sekolah && asal_sekolah.trim()) {
        const [sekRows] = await pool.query(
          "SELECT id_sekolah FROM master_sekolah WHERE nama_sekolah = ? LIMIT 1",
          [asal_sekolah.trim()]
        );
        if (sekRows.length > 0) {
          targetSekolahId = sekRows[0].id_sekolah;
        } else {
          targetSekolahId = `SEK-${Date.now().toString().slice(-6)}`;
          await pool.query(
            "INSERT INTO master_sekolah (id_sekolah, nama_sekolah, jenjang, status_sekolah) VALUES (?, ?, 'SMA/SMK', 'aktif')",
            [targetSekolahId, asal_sekolah.trim()]
          );
        }
      }

      // 2. Update master_siswa (sinkronisasi nama, kontak, sekolah, alamat)
      const waClean = no_wa ? normalizeWa(no_wa) : null;
      await pool.query(`
        UPDATE master_siswa 
        SET 
          nama_lengkap = COALESCE(?, nama_lengkap),
          wa = COALESCE(?, wa),
          id_sekolah = COALESCE(?, id_sekolah),
          alamat = COALESCE(?, alamat),
          last_updated = NOW()
        WHERE id_siswa = ?
      `, [
        nama_lengkap ? nama_lengkap.trim() : null,
        waClean,
        targetSekolahId || null,
        alamat_lengkap ? alamat_lengkap.trim() : null,
        idSiswa
      ]);

      // Update juga di registration_tokens jika ada
      if (nama_lengkap || waClean) {
        await pool.query(`
          UPDATE registration_tokens
          SET 
            nama_lengkap = COALESCE(?, nama_lengkap),
            no_wa = COALESCE(?, no_wa)
          WHERE token = ?
        `, [nama_lengkap ? nama_lengkap.trim() : null, waClean, req.params.token]);
      }

      // 3. Upsert data ke pendaftaran_siswa
      const tglLahirVal = (tanggal_lahir && tanggal_lahir.trim()) ? tanggal_lahir.trim() : null;
      const tglLahirOrtuVal = (tgl_lahir_ortu && tgl_lahir_ortu.trim()) ? tgl_lahir_ortu.trim() : null;
      const waOrtuClean = wa_ortu ? normalizeWa(wa_ortu) : null;

      await pool.query(`
        INSERT INTO pendaftaran_siswa 
          (id_siswa, nik, gender, tanggal_lahir, alamat_lengkap, nama_program, nama_ortu, wa_ortu, tgl_lahir_ortu, pekerjaan_ortu)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          nik = VALUES(nik),
          gender = VALUES(gender),
          tanggal_lahir = VALUES(tanggal_lahir),
          alamat_lengkap = VALUES(alamat_lengkap),
          nama_program = VALUES(nama_program),
          nama_ortu = VALUES(nama_ortu),
          wa_ortu = VALUES(wa_ortu),
          tgl_lahir_ortu = VALUES(tgl_lahir_ortu),
          pekerjaan_ortu = VALUES(pekerjaan_ortu),
          updated_at = NOW()
      `, [
        idSiswa,
        nik ? nik.trim() : null,
        gender || null,
        tglLahirVal,
        alamat_lengkap ? alamat_lengkap.trim() : null,
        nama_program ? nama_program.trim() : null,
        nama_ortu ? nama_ortu.trim() : null,
        waOrtuClean,
        tglLahirOrtuVal,
        pekerjaan_ortu || null
      ]);

      res.json({
        status: 'ok',
        message: 'Data pendaftaran siswa dan orang tua berhasil diperbarui.'
      });
    });
  } catch (err) {
    console.error('[public/:tenantSlug/reg-token/:token PUT] Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ── MIDTRANS WEBHOOK NOTIFICATION (Payment Gateway Callback) ─────────────────
router.post('/midtrans/notification', subscriptionCtrl.handleMidtransWebhook);

module.exports = router;

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
    `SELECT t.tenant_id, t.brand_name, t.whatsapp_phone_id, td.db_host, td.db_port, td.db_name, td.db_user, td.db_password
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
    res.json({
      status: 'ok',
      data: {
        tenantId: tenant.tenant_id,
        brandName: tenant.brand_name,
        whatsappNumber: tenant.whatsapp_phone_id || ''
      }
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

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
         WHERE status = 'aktif' OR status IS NULL 
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
      opt_in_wa
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
              "INSERT INTO master_sekolah (id_sekolah, nama_sekolah, jenjang, status) VALUES (?, ?, 'SMA/SMK', 'aktif')",
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

        // 1. Insert master_siswa (dengan opt_in_wa = 'Ya')
        await conn.query(`
          INSERT INTO master_siswa 
            (id_siswa, id_sekolah, nama_lengkap, wa, kelas_id, minat_awal, rencana_lulus, opt_in_wa, created_date)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'Ya', NOW())
        `, [idSiswa, targetSekolahId || null, nama_lengkap.trim(), waClean, kelasId, minat, rencana]);

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

// ── MIDTRANS WEBHOOK NOTIFICATION (Payment Gateway Callback) ─────────────────
router.post('/midtrans/notification', subscriptionCtrl.handleMidtransWebhook);

module.exports = router;

'use strict';

/**
 * crm.public.routes.js
 * Routes untuk akses publik (tanpa JWT), misalnya Form Sosialisasi Siswa
 */

const { Router } = require('express');
const { pool } = require('../../config/database');
const siswaSvc = require('./crm.siswa.service');

const router = Router();

// GET /api/public/sekolah/:id — Ambil info sekolah untuk header form
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

// POST /api/public/form-siswa/:sekolahId — Submit form CRM sosialisasi
router.post('/form-siswa/:sekolahId', async (req, res) => {
  try {
    const sekolahId = req.params.sekolahId;
    const { nama_lengkap, no_wa, kelas, minat_awal, rencana_lulus, pj_cro } = req.body;

    if (!nama_lengkap || !no_wa || !pj_cro) {
      return res.status(400).json({ status: 'error', message: 'Data tidak lengkap' });
    }

    // Panggil service yang sama dengan penambahan manual, tapi pass dummy user
    const dummyUser = { nama: pj_cro, role: 'CRO' };
    const data = {
      id_sekolah: sekolahId,
      nama_lengkap,
      no_wa,
      kelas,
      minat_awal: minat_awal || 'Ragu',
      rencana_lulus: rencana_lulus || 'Belum Tahu',
      pj_cro
    };

    const result = await siswaSvc.tambahSiswa(data, dummyUser);
    res.status(201).json({ status: 'ok', data: result });
  } catch (err) {
    console.error('[public] form-siswa error:', err);
    res.status(400).json({ status: 'error', message: err.message });
  }
});

module.exports = router;

'use strict';

const settingsService = require('./crm.settings.service');

function _checkAdminOrManager(user) {
  const role = String(user?.role || '').toLowerCase();
  return role === 'admin' || role === 'manager';
}

// ── Master Kelas ─────────────────────────────────────────────────────────────

async function getKelasMapping(req, res) {
  try {
    const data = await settingsService.getKelasMapping();
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('getKelasMapping Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function addKelasMapping(req, res) {
  try {
    if (!_checkAdminOrManager(req.user)) {
      return res.status(403).json({ status: 'error', message: 'Hanya Admin atau Manager yang memiliki hak akses mengelola data referensi (Settings).' });
    }
    const actor = req.user?.nama || req.user?.username;
    const data = await settingsService.addKelasMapping(req.body, actor);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('addKelasMapping Error:', err);
    res.status(400).json({ status: 'error', message: err.message });
  }
}

async function updateKelasMapping(req, res) {
  try {
    if (!_checkAdminOrManager(req.user)) {
      return res.status(403).json({ status: 'error', message: 'Hanya Admin atau Manager yang memiliki hak akses mengelola data referensi (Settings).' });
    }
    const actor = req.user?.nama || req.user?.username;
    const data = await settingsService.updateKelasMapping(req.params.id, req.body, actor);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('updateKelasMapping Error:', err);
    res.status(400).json({ status: 'error', message: err.message });
  }
}

async function deleteKelasMapping(req, res) {
  try {
    if (!_checkAdminOrManager(req.user)) {
      return res.status(403).json({ status: 'error', message: 'Hanya Admin atau Manager yang memiliki hak akses mengelola data referensi (Settings).' });
    }
    const actor = req.user?.nama || req.user?.username;
    const data = await settingsService.deleteKelasMapping(req.params.id, actor);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('deleteKelasMapping Error:', err);
    res.status(400).json({ status: 'error', message: err.message });
  }
}

// ── Master Kota ──────────────────────────────────────────────────────────────

async function getKotaList(req, res) {
  try {
    const data = await settingsService.getKotaList();
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('getKotaList Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function addKota(req, res) {
  try {
    if (!_checkAdminOrManager(req.user)) {
      return res.status(403).json({ status: 'error', message: 'Hanya Admin atau Manager yang memiliki hak akses mengelola data referensi (Settings).' });
    }
    const actor = req.user?.nama || req.user?.username;
    const data = await settingsService.addKota(req.body, actor);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('addKota Error:', err);
    res.status(400).json({ status: 'error', message: err.message });
  }
}

async function updateKota(req, res) {
  try {
    if (!_checkAdminOrManager(req.user)) {
      return res.status(403).json({ status: 'error', message: 'Hanya Admin atau Manager yang memiliki hak akses mengelola data referensi (Settings).' });
    }
    const actor = req.user?.nama || req.user?.username;
    const data = await settingsService.updateKota(req.params.id, req.body, actor);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('updateKota Error:', err);
    res.status(400).json({ status: 'error', message: err.message });
  }
}

async function deleteKota(req, res) {
  try {
    if (!_checkAdminOrManager(req.user)) {
      return res.status(403).json({ status: 'error', message: 'Hanya Admin atau Manager yang memiliki hak akses mengelola data referensi (Settings).' });
    }
    const actor = req.user?.nama || req.user?.username;
    const data = await settingsService.deleteKota(req.params.id, actor);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('deleteKota Error:', err);
    res.status(400).json({ status: 'error', message: err.message });
  }
}

// ── Master Kecamatan ─────────────────────────────────────────────────────────

async function getKecamatanList(req, res) {
  try {
    const data = await settingsService.getKecamatanList();
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('getKecamatanList Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function addKecamatan(req, res) {
  try {
    if (!_checkAdminOrManager(req.user)) {
      return res.status(403).json({ status: 'error', message: 'Hanya Admin atau Manager yang memiliki hak akses mengelola data referensi (Settings).' });
    }
    const actor = req.user?.nama || req.user?.username;
    const data = await settingsService.addKecamatan(req.body, actor);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('addKecamatan Error:', err);
    res.status(400).json({ status: 'error', message: err.message });
  }
}

async function updateKecamatan(req, res) {
  try {
    if (!_checkAdminOrManager(req.user)) {
      return res.status(403).json({ status: 'error', message: 'Hanya Admin atau Manager yang memiliki hak akses mengelola data referensi (Settings).' });
    }
    const actor = req.user?.nama || req.user?.username;
    const data = await settingsService.updateKecamatan(req.params.id, req.body, actor);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('updateKecamatan Error:', err);
    res.status(400).json({ status: 'error', message: err.message });
  }
}

async function deleteKecamatan(req, res) {
  try {
    if (!_checkAdminOrManager(req.user)) {
      return res.status(403).json({ status: 'error', message: 'Hanya Admin atau Manager yang memiliki hak akses mengelola data referensi (Settings).' });
    }
    const actor = req.user?.nama || req.user?.username;
    const data = await settingsService.deleteKecamatan(req.params.id, actor);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('deleteKecamatan Error:', err);
    res.status(400).json({ status: 'error', message: err.message });
  }
}

// ── Payment & Pricing Settings ────────────────────────────────────────────────

async function getPaymentConfig(req, res) {
  try {
    const data = await settingsService.getPaymentConfig();
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('getPaymentConfig Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function updatePaymentConfig(req, res) {
  try {
    if (!_checkAdminOrManager(req.user)) {
      return res.status(403).json({ status: 'error', message: 'Hanya Admin atau Manager yang berwenang mengubah rekening dan biaya pendaftaran.' });
    }
    const actor = req.user?.nama || req.user?.username;
    const data = await settingsService.updatePaymentConfig(req.body, actor);
    res.json({ status: 'ok', message: 'Konfigurasi rekening bank & biaya program berhasil disimpan.', data });
  } catch (err) {
    console.error('updatePaymentConfig Error:', err);
    res.status(400).json({ status: 'error', message: err.message });
  }
}

// ── Payment Verification (Admin & Manager) ───────────────────────────────────

async function getPaymentVerifications(req, res) {
  try {
    if (!_checkAdminOrManager(req.user)) {
      return res.status(403).json({ status: 'error', message: 'Hanya Admin atau Manager yang memiliki hak akses modul Verifikasi Pembayaran.' });
    }
    const data = await settingsService.getPaymentVerifications(req.query);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('getPaymentVerifications Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function verifyPaymentRegistration(req, res) {
  try {
    if (!_checkAdminOrManager(req.user)) {
      return res.status(403).json({ status: 'error', message: 'Hanya Admin atau Manager yang berwenang memverifikasi pembayaran.' });
    }
    const actor = req.user?.nama || req.user?.username || 'Admin';
    const data = await settingsService.verifyPaymentRegistration(req.params.token, req.body, actor);
    res.json({ status: 'ok', message: 'Pembayaran formulir pendaftaran berhasil diverifikasi. Status siswa telah beralih ke Siswa Terdaftar (REGISTERED).', data });
  } catch (err) {
    console.error('verifyPaymentRegistration Error:', err);
    res.status(400).json({ status: 'error', message: err.message });
  }
}

async function rejectPaymentRegistration(req, res) {
  try {
    if (!_checkAdminOrManager(req.user)) {
      return res.status(403).json({ status: 'error', message: 'Hanya Admin atau Manager yang berwenang membatalkan pendaftaran.' });
    }
    const actor = req.user?.nama || req.user?.username || 'Admin';
    const data = await settingsService.rejectPaymentRegistration(req.params.token, req.body?.reason, actor);
    res.json({ status: 'ok', message: 'Pendaftaran / invoice pembayaran berhasil dibatalkan / di-expire.', data });
  } catch (err) {
    console.error('rejectPaymentRegistration Error:', err);
    res.status(400).json({ status: 'error', message: err.message });
  }
}

async function searchSiswaForPayment(req, res) {
  try {
    if (!_checkAdminOrManager(req.user)) {
      return res.status(403).json({ status: 'error', message: 'Hanya Admin atau Manager yang memiliki hak akses pencarian siswa.' });
    }
    const data = await settingsService.searchSiswaForPayment(req.query.q);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('searchSiswaForPayment Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function manualVerifySiswaPayment(req, res) {
  try {
    if (!_checkAdminOrManager(req.user)) {
      return res.status(403).json({ status: 'error', message: 'Hanya Admin atau Manager yang berwenang memverifikasi pembayaran.' });
    }
    const actor = req.user?.nama || req.user?.username || 'Admin';
    const data = await settingsService.manualVerifySiswaPayment(req.body.id_siswa, req.body, actor);
    res.json({ status: 'ok', message: 'Pembayaran formulir pendaftaran berhasil dicatat & diverifikasi manual (REGISTERED).', data });
  } catch (err) {
    console.error('manualVerifySiswaPayment Error:', err);
    res.status(400).json({ status: 'error', message: err.message });
  }
}

async function verifyCoreDepositPayment(req, res) {
  try {
    if (!_checkAdminOrManager(req.user)) {
      return res.status(403).json({ status: 'error', message: 'Hanya Admin atau Manager yang berwenang memverifikasi DP / Core Deposit.' });
    }
    const actor = req.user?.nama || req.user?.username || 'Admin';
    const data = await settingsService.verifyCoreDepositPayment(req.body.id_siswa, req.body, actor);
    res.json({ status: 'ok', message: 'Pembayaran DP (Core Deposit) berhasil diverifikasi. Siswa kini resmi berstatus Siswa / Peserta (CUSTOMER).', data });
  } catch (err) {
    console.error('verifyCoreDepositPayment Error:', err);
    res.status(400).json({ status: 'error', message: err.message });
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
  manualVerifySiswaPayment,
  verifyCoreDepositPayment
};

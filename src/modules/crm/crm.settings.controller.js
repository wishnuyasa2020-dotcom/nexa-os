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

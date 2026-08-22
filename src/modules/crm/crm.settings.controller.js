'use strict';

const settingsService = require('./crm.settings.service');

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
    // Only Admin/Manager can configure settings
    if (req.user.role === 'CRO') {
      return res.status(403).json({ status: 'error', message: 'Hanya Admin/Manager yang bisa mengakses fitur ini.' });
    }
    const data = await settingsService.addKelasMapping(req.body);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('addKelasMapping Error:', err);
    res.status(400).json({ status: 'error', message: err.message });
  }
}

async function updateKelasMapping(req, res) {
  try {
    if (req.user.role === 'CRO') {
      return res.status(403).json({ status: 'error', message: 'Hanya Admin/Manager yang bisa mengakses fitur ini.' });
    }
    const data = await settingsService.updateKelasMapping(req.params.id, req.body);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('updateKelasMapping Error:', err);
    res.status(400).json({ status: 'error', message: err.message });
  }
}

async function deleteKelasMapping(req, res) {
  try {
    if (req.user.role === 'CRO') {
      return res.status(403).json({ status: 'error', message: 'Hanya Admin/Manager yang bisa mengakses fitur ini.' });
    }
    const data = await settingsService.deleteKelasMapping(req.params.id);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('deleteKelasMapping Error:', err);
    res.status(400).json({ status: 'error', message: err.message });
  }
}

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
    if (req.user.role === 'CRO') {
      return res.status(403).json({ status: 'error', message: 'Hanya Admin/Manager yang bisa mengakses fitur ini.' });
    }
    const data = await settingsService.addKecamatan(req.body);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('addKecamatan Error:', err);
    res.status(400).json({ status: 'error', message: err.message });
  }
}

async function updateKecamatan(req, res) {
  try {
    if (req.user.role === 'CRO') {
      return res.status(403).json({ status: 'error', message: 'Hanya Admin/Manager yang bisa mengakses fitur ini.' });
    }
    const data = await settingsService.updateKecamatan(req.params.id, req.body);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('updateKecamatan Error:', err);
    res.status(400).json({ status: 'error', message: err.message });
  }
}

async function deleteKecamatan(req, res) {
  try {
    if (req.user.role === 'CRO') {
      return res.status(403).json({ status: 'error', message: 'Hanya Admin/Manager yang bisa mengakses fitur ini.' });
    }
    const data = await settingsService.deleteKecamatan(req.params.id);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('deleteKecamatan Error:', err);
    res.status(400).json({ status: 'error', message: err.message });
  }
}

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
    if (req.user.role === 'CRO') {
      return res.status(403).json({ status: 'error', message: 'Hanya Admin/Manager yang bisa mengakses fitur ini.' });
    }
    const data = await settingsService.addKota(req.body);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('addKota Error:', err);
    res.status(400).json({ status: 'error', message: err.message });
  }
}

async function updateKota(req, res) {
  try {
    if (req.user.role === 'CRO') {
      return res.status(403).json({ status: 'error', message: 'Hanya Admin/Manager yang bisa mengakses fitur ini.' });
    }
    const data = await settingsService.updateKota(req.params.id, req.body);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('updateKota Error:', err);
    res.status(400).json({ status: 'error', message: err.message });
  }
}

async function deleteKota(req, res) {
  try {
    if (req.user.role === 'CRO') {
      return res.status(403).json({ status: 'error', message: 'Hanya Admin/Manager yang bisa mengakses fitur ini.' });
    }
    const data = await settingsService.deleteKota(req.params.id);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('deleteKota Error:', err);
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

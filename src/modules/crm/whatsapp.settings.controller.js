'use strict';

const whatsappService = require('./whatsapp.settings.service');
const { tenantStorage } = require('../../config/database');

function _checkAdminOrManager(user) {
  const role = String(user?.role || '').toLowerCase();
  return role === 'admin' || role === 'manager';
}

function _resolveTenantId(req) {
  return req.user?.tenantId || tenantStorage.getStore() || 'derma-indonesia';
}

async function getStatus(req, res) {
  try {
    const tenantId = _resolveTenantId(req);
    const data = await whatsappService.getWhatsappStatus(tenantId);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('getWhatsappStatus Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function register(req, res) {
  try {
    if (!_checkAdminOrManager(req.user)) {
      return res.status(403).json({
        status: 'error',
        message: 'Hanya Admin atau Manager yang memiliki izin mendaftarkan nomor WhatsApp bisnis.'
      });
    }

    const tenantId = _resolveTenantId(req);
    const actor = req.user?.nama || req.user?.username || 'User';
    const data = await whatsappService.registerWhatsapp(tenantId, req.body, actor);

    res.json({
      status: 'ok',
      data,
      message: 'Pengajuan pendaftaran nomor WhatsApp berhasil dikirim ke tim teknis Superadmin.'
    });
  } catch (err) {
    console.error('registerWhatsapp Error:', err);
    res.status(400).json({ status: 'error', message: err.message });
  }
}

async function disconnect(req, res) {
  try {
    if (!_checkAdminOrManager(req.user)) {
      return res.status(403).json({
        status: 'error',
        message: 'Hanya Admin atau Manager yang memiliki izin memutuskan koneksi WhatsApp.'
      });
    }

    const tenantId = _resolveTenantId(req);
    const actor = req.user?.nama || req.user?.username || 'User';
    const data = await whatsappService.disconnectWhatsapp(tenantId, actor);

    res.json({
      status: 'ok',
      data,
      message: 'Koneksi WhatsApp berhasil diputuskan.'
    });
  } catch (err) {
    console.error('disconnectWhatsapp Error:', err);
    res.status(400).json({ status: 'error', message: err.message });
  }
}

module.exports = {
  getStatus,
  register,
  disconnect
};

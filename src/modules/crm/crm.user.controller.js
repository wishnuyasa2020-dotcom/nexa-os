'use strict';

const svc = require('./crm.user.service');

async function getList(req, res) {
  try {
    const data = await svc.listUsers(req.query);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('[users] getList Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function getDetail(req, res) {
  try {
    const data = await svc.getUserById(req.params.id);
    if (!data) return res.status(404).json({ status: 'error', message: 'User tidak ditemukan.' });
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('[users] getDetail Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function getQuota(req, res) {
  try {
    const data = await svc.getRoleQuota();
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('[users] getQuota Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function create(req, res) {
  try {
    const actor = req.user?.nama || req.user?.username || 'Admin';
    const data = await svc.addUser(req.body, actor);
    res.status(201).json({ status: 'ok', data });
  } catch (err) {
    console.error('[users] create Error:', err);
    const code = err.isQuotaError ? 403 : (err.message.includes('terdaftar') ? 409 : 400);
    res.status(code).json({ status: 'error', message: err.message, isQuotaError: err.isQuotaError || false });
  }
}

async function update(req, res) {
  try {
    const actor = req.user?.nama || req.user?.username || 'Admin';
    const reqMeta = {
      ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip,
      userAgent: req.headers['user-agent']
    };
    const data = await svc.updateUser(req.params.id, req.body, actor, reqMeta);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('[users] update Error:', err);
    const code = err.isQuotaError ? 403 : 400;
    res.status(code).json({ status: 'error', message: err.message, isQuotaError: err.isQuotaError || false });
  }
}

async function resetPassword(req, res) {
  try {
    const actor = req.user?.nama || req.user?.username || 'Admin';
    const { new_password } = req.body;
    const reqMeta = {
      ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip,
      userAgent: req.headers['user-agent']
    };
    const data = await svc.resetPassword(req.params.id, new_password, actor, reqMeta);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('[users] resetPassword Error:', err);
    res.status(400).json({ status: 'error', message: err.message });
  }
}

async function remove(req, res) {
  try {
    const actor = req.user?.nama || req.user?.username || 'Admin';
    await svc.softDeleteUser(req.params.id, actor);
    res.json({ status: 'ok', message: 'User dinonaktifkan.' });
  } catch (err) {
    console.error('[users] remove Error:', err);
    res.status(400).json({ status: 'error', message: err.message });
  }
}

module.exports = {
  getList,
  getDetail,
  getQuota,
  create,
  update,
  resetPassword,
  remove,
};

'use strict';

const crmService = require('./crm.service');

/**
 * GET /api/crm/initial-data
 * Header: Authorization: Bearer <token>
 */
async function getInitialData(req, res) {
  try {
    const data = await crmService.getInitialData(req.user);
    res.json({ status: 'ok', data });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function getAllSekolah(req, res) {
  try {
    const data = await crmService.getAllSekolah(req.user, req.body);
    console.log("[DEBUG getAllSekolah] user:", req.user, "filter:", req.body);
    console.log("[DEBUG getAllSekolah] return data size:", data.data ? data.data.length : 'unknown');
    res.json({ status: 'ok', data }); 
  } catch (err) {
    console.error('getAllSekolah Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function getAllSiswa(req, res) {
  try {
    const data = await crmService.getAllSiswa(req.user, req.body);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('getAllSiswa Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function getDashboardSummary(req, res) {
  try {
    const period = req.body.args ? req.body.args[0] : req.body.marketingPeriod;
    const mf = req.body.args ? req.body.args[1] : req.body.monthFilter;
    const data = await crmService.getDashboardSummary(req.user, period, mf);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('getDashboardSummary Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function getDashboardTasks(req, res) {
  try {
    const period = req.body.args ? req.body.args[0] : req.body.marketingPeriod;
    const data = await crmService.getDashboardTasks(req.user, period);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('getDashboardTasks Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function getDashboardFunnels(req, res) {
  try {
    const period = req.body.args ? req.body.args[0] : req.body.marketingPeriod;
    const mf = req.body.args ? req.body.args[1] : req.body.monthFilter;
    const data = await crmService.getDashboardFunnels(req.user, period, mf);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('getDashboardFunnels Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function getDashboardAktivitas(req, res) {
  try {
    const period = req.body.args ? req.body.args[0] : req.body.marketingPeriod;
    const mf = req.body.args ? req.body.args[1] : req.body.monthFilter;
    const data = await crmService.getDashboardAktivitas(req.user, period, mf);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('getDashboardAktivitas Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function getDashboardKecamatan(req, res) {
  try {
    const period = req.body.args ? req.body.args[0] : req.body.marketingPeriod;
    const mf = req.body.args ? req.body.args[1] : req.body.monthFilter;
    const data = await crmService.getDashboardKecamatan(req.user, period, mf);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('getDashboardKecamatan Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function getSekolahDropdown(req, res) {
  try {
    const data = await crmService.getSekolahDropdown();
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('getSekolahDropdown Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function getAllMarketingPeriods(req, res) {
  try {
    const data = await crmService.getAllMarketingPeriods();
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('getAllMarketingPeriods Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function getActiveMarketingPeriod(req, res) {
  try {
    const data = await crmService.getActiveMarketingPeriod();
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('getActiveMarketingPeriod Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function getCarryForwardStatus(req, res) {
  try {
    const data = await crmService.getCarryForwardStatus(req.user);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('getCarryForwardStatus Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function getSiswaById(req, res) {
  try {
    const [id, period] = req.body.args || [];
    const data = await crmService.getSiswaById(id, period, req.user);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('getSiswaById Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function getSekolahById(req, res) {
  try {
    const [id, period] = req.body.args || [];
    const data = await crmService.getSekolahById(id, period, req.user);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('getSekolahById Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function getTaskList(req, res) {
  try {
    const [category, period] = req.body.args || [];
    const data = await crmService.getTaskList(category, period, req.user);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('getTaskList Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function getWeeklyPlanningData(req, res) {
  try {
    const [startDate, endDate, period] = req.body.args || [];
    const data = await crmService.getWeeklyPlanningData(startDate, endDate, period, req.user);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('getWeeklyPlanningData Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function createAgenda(req, res) {
  try {
    const [dataPayload] = req.body.args || [];
    const data = await crmService.createAgenda(dataPayload, req.user);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('createAgenda Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function updateAgenda(req, res) {
  try {
    const [id, dataPayload] = req.body.args || [];
    const data = await crmService.updateAgenda(id, dataPayload, req.user);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('updateAgenda Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function deleteAgenda(req, res) {
  try {
    const [id] = req.body.args || [];
    const data = await crmService.deleteAgenda(id, req.user);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('deleteAgenda Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function getAllHomeVisit(req, res) {
  try {
    const [filter] = req.body.args || [];
    const data = await crmService.getAllHomeVisit(filter, req.user);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('getAllHomeVisit Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function getHomeVisitById(req, res) {
  try {
    const [idSiswa, period] = req.body.args || [];
    const data = await crmService.getHomeVisitById(idSiswa, period, req.user);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('getHomeVisitById Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function createHomeVisit(req, res) {
  try {
    const [idSiswa, dataPayload] = req.body.args || [];
    const data = await crmService.createHomeVisit(idSiswa, dataPayload, req.user);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('createHomeVisit Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function addAktivitasHomeVisit(req, res) {
  try {
    const [dataPayload] = req.body.args || [];
    const data = await crmService.addAktivitasHomeVisit(dataPayload, req.user);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('addAktivitasHomeVisit Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function getBroadcastSekolahList(req, res) {
  try {
    const data = await crmService.getBroadcastSekolahList(req.user);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('getBroadcastSekolahList Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function getBroadcastHistory(req, res) {
  try {
    const data = await crmService.getBroadcastHistory(req.user);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('getBroadcastHistory Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function getBroadcastTargetPreview(req, res) {
  try {
    const [filter] = req.body.args || [];
    const data = await crmService.getBroadcastTargetPreview(filter, req.user);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('getBroadcastTargetPreview Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function createBroadcast(req, res) {
  try {
    const [params] = req.body.args || [];
    const data = await crmService.createBroadcast(params, req.user);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('createBroadcast Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function getBroadcastProgress(req, res) {
  try {
    const [broadcastId] = req.body.args || [];
    const data = await crmService.getBroadcastProgress(broadcastId, req.user);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('getBroadcastProgress Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function checkTemplateHistory(req, res) {
  try {
    const [templateNameApi, listIdSiswa] = req.body.args || [];
    const data = await crmService.checkTemplateHistory(templateNameApi, listIdSiswa, req.user);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('checkTemplateHistory Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function getNurturingDashboardData(req, res) {
  try {
    const [period] = req.body.args || [];
    const data = await crmService.getNurturingDashboardData(period, req.user);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('getNurturingDashboardData Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function getSnoozeDashboardData(req, res) {
  try {
    const [period] = req.body.args || [];
    const data = await crmService.getSnoozeDashboardData(period, req.user);
    res.json({ status: 'ok', data });
  } catch (err) {
    console.error('getSnoozeDashboardData Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

// Master Data CRUD

async function addSiswa(req, res) {
  try {
    // Support both: { args: [data] } (legacy GAS format) and direct body
    const data = req.body.args ? req.body.args[0] : req.body;
    const result = await crmService.addSiswa(data, req.user);
    res.json({ status: 'ok', data: result });
  } catch (err) {
    console.error('addSiswa Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function updateSiswa(req, res) {
  try {
    const { id, ...data } = req.body;
    const result = await crmService.updateSiswa(id, data, req.user);
    res.json(result);
  } catch (err) {
    console.error('updateSiswa Error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
}

async function addSiswaBatch(req, res) {
  try {
    const [batchData] = req.body.args || [];
    const result = await crmService.addSiswaBatch(batchData, req.user);
    res.json({ status: 'ok', data: result });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function updateLastAktivitasSiswa(req, res) {
  try {
    const [data] = req.body.args || [];
    const result = await crmService.updateLastAktivitasSiswa(data, req.user);
    res.json({ status: 'ok', data: result });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function addAktivitasSiswa(req, res) {
  try {
    const data = req.body.args ? req.body.args[0] : req.body;
    const result = await crmService.addAktivitasSiswa(data, req.user);
    res.json({ status: 'ok', data: result });
  } catch (err) {
    console.error('addAktivitasSiswa Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function getSiswaByPhone(req, res) {
  try {
    const [phone] = req.body.args || [];
    const result = await crmService.getSiswaByPhone(phone, req.user);
    res.json({ status: 'ok', data: result });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function addSekolah(req, res) {
  try {
    const data = req.body.args ? req.body.args[0] : req.body;
    const result = await crmService.addSekolah(data, req.user);
    res.json({ status: 'ok', data: result });
  } catch (err) {
    console.error('addSekolah Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function updateSekolah(req, res) {
  try {
    const { id, ...data } = req.body;
    const result = await crmService.updateSekolah(id, data, req.user);
    res.json(result);
  } catch (err) {
    console.error('updateSekolah Error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
}

async function updateLastAktivitasSekolah(req, res) {
  try {
    const [data] = req.body.args || [];
    const result = await crmService.updateLastAktivitasSekolah(data, req.user);
    res.json({ status: 'ok', data: result });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function addAktivitasSekolah(req, res) {
  try {
    const data = req.body.args ? req.body.args[0] : req.body;
    const result = await crmService.addAktivitasSekolah(data, req.user);
    res.json({ status: 'ok', data: result });
  } catch (err) {
    console.error('addAktivitasSekolah Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

module.exports = { 
  getInitialData, 
  getAllSekolah, 
  getAllSiswa,
  getDashboardSummary,
  getDashboardTasks,
  getDashboardFunnels,
  getDashboardAktivitas,
  getDashboardKecamatan,
  getSekolahDropdown,
  getAllMarketingPeriods,
  getActiveMarketingPeriod,
  getCarryForwardStatus,
  getSiswaById,
  getSekolahById,
  getTaskList,
  getWeeklyPlanningData,
  createAgenda,
  updateAgenda,
  deleteAgenda,
  getAllHomeVisit,
  getHomeVisitById,
  createHomeVisit,
  addAktivitasHomeVisit,
  getBroadcastSekolahList,
  getBroadcastHistory,
  getBroadcastTargetPreview,
  createBroadcast,
  getBroadcastProgress,
  checkTemplateHistory,
  getNurturingDashboardData,
  getSnoozeDashboardData,
  addSiswa,
  updateSiswa,
  addSiswaBatch,
  updateLastAktivitasSiswa,
  addAktivitasSiswa,
  getSiswaByPhone,
  addSekolah,
  updateSekolah,
  updateLastAktivitasSekolah,
  addAktivitasSekolah
};

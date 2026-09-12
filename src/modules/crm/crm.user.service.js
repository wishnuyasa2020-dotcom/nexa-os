'use strict';

const crypto = require('crypto');
const { pool, mainPool } = require('../../config/database');

function _generateSalt() {
  // varchar(20) di DB
  return crypto.randomBytes(8).toString('hex');
}

function _hashSHA256(password, salt) {
  return crypto
    .createHash('sha256')
    .update(String(password) + String(salt))
    .digest('hex');
}

async function _checkRoleLimits(role, requiredCount = 1) {
  const normalizedRole = role.toLowerCase();
  // Validasi hanya berlaku untuk Admin, Manager, Chief CRO, dan CRO.
  // Visitor mungkin tidak ada limit (atau tidak didefinisikan di tier-feature).
  if (!['admin', 'manager', 'chief cro', 'cro'].includes(normalizedRole)) return;

  const { tenantStorage } = require('../../config/database');
  const tenantId = tenantStorage.getStore();
  
  if (!tenantId) {
    throw new Error("Gagal: Konteks Tenant tidak ditemukan. Akses diblokir demi keamanan data (Data Spillage Protection).");
  }

  const [tenantRows] = await mainPool.query("SELECT max_admin, max_manager, max_chief_cro, max_cro, addon_cro FROM tenants WHERE tenant_id = ?", [tenantId]);
  if (tenantRows.length === 0) return;

  const { max_admin, max_manager, max_chief_cro, max_cro, addon_cro } = tenantRows[0];
  
  let maxSeat = 0;
  let roleDisplayName = role;

  if (normalizedRole === 'admin') {
    maxSeat = max_admin || 1;
  } else if (normalizedRole === 'manager') {
    maxSeat = max_manager || 1;
  } else if (normalizedRole === 'chief cro') {
    maxSeat = max_chief_cro || 1;
  } else if (normalizedRole === 'cro') {
    maxSeat = (max_cro || 0) + (addon_cro || 0);
  }

  // Hitung jumlah user aktif untuk role tersebut di tenant ini
  const [roleRows] = await pool.query("SELECT COUNT(*) AS total FROM users WHERE LOWER(role) = ? AND LOWER(status) = 'aktif'", [normalizedRole]);
  const currentTotal = roleRows[0].total;

  if (currentTotal + requiredCount > maxSeat) {
    const err = new Error(`Kuota user ${roleDisplayName} tidak mencukupi (Max Seat: ${maxSeat}, Terpakai: ${currentTotal}). Silakan Upgrade Tier atau hubungi sistem admin.`);
    err.isQuotaError = true;
    throw err;
  }
}

// ── Event-Sourcing CQRS Helper ───────────────────────────────────────────────
async function _logStaffEvent(eventType, staffId, payload = {}, actor = 'System') {
  try {
    const eventId = `EVT-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    await pool.query(
      `INSERT INTO events_log 
        (event_id, aggregate_type, aggregate_id, event_type, payload, actor_id, marketing_period)
       VALUES (?, 'Staff', ?, ?, ?, ?, NULL)`,
      [
        eventId,
        String(staffId),
        eventType,
        JSON.stringify(payload),
        actor || 'System'
      ]
    );
  } catch (err) {
    console.error('[users] _logStaffEvent error (non-fatal):', err.message);
  }
}

async function getRoleQuota() {
  const { tenantStorage } = require('../../config/database');
  const tenantId = tenantStorage.getStore();
  
  if (!tenantId) {
    throw new Error("Gagal: Konteks Tenant tidak ditemukan. Akses diblokir demi keamanan data (Data Spillage Protection).");
  }

  const [tenantRows] = await mainPool.query(
    "SELECT tier, max_admin, max_manager, max_chief_cro, max_cro, addon_cro FROM tenants WHERE tenant_id = ?",
    [tenantId]
  );
  
  const tenant = tenantRows[0] || {};
  const maxAdmin = tenant.max_admin || 1;
  const maxManager = tenant.max_manager || 1;
  const maxChiefCro = tenant.max_chief_cro || 1;
  const maxCro = (tenant.max_cro || 0) + (tenant.addon_cro || 0);

  const [activeRows] = await pool.query(
    "SELECT LOWER(role) AS role, COUNT(*) AS total FROM users WHERE LOWER(status) = 'aktif' GROUP BY LOWER(role)"
  );

  const usageMap = {};
  for (const r of activeRows) {
    usageMap[r.role] = r.total;
  }

  return {
    tier: tenant.tier || 'FREE',
    roles: {
      Admin: {
        role: 'Admin',
        max: maxAdmin,
        used: usageMap['admin'] || 0,
        available: Math.max(0, maxAdmin - (usageMap['admin'] || 0))
      },
      Manager: {
        role: 'Manager',
        max: maxManager,
        used: usageMap['manager'] || 0,
        available: Math.max(0, maxManager - (usageMap['manager'] || 0))
      },
      'Chief CRO': {
        role: 'Chief CRO',
        max: maxChiefCro,
        used: usageMap['chief cro'] || 0,
        available: Math.max(0, maxChiefCro - (usageMap['chief cro'] || 0))
      },
      CRO: {
        role: 'CRO',
        max: maxCro,
        used: usageMap['cro'] || 0,
        available: Math.max(0, maxCro - (usageMap['cro'] || 0))
      }
    }
  };
}

async function listUsers(query = {}) {
  const whereParts = [];
  const params = [];

  if (query.role) {
    whereParts.push("LOWER(u.role) = ?");
    params.push(query.role.toLowerCase());
  }
  if (query.status) {
    whereParts.push("LOWER(u.status) = ?");
    params.push(query.status.toLowerCase());
  }
  if (query.search) {
    whereParts.push("(u.nama LIKE ? OR u.username LIKE ?)");
    params.push(`%${query.search}%`, `%${query.search}%`);
  }

  let where = "";
  if (whereParts.length > 0) {
    where = "WHERE " + whereParts.join(" AND ");
  }

  const [rows] = await pool.query(
    `SELECT 
       u.id, u.username, u.email, u.nama, u.role, u.status, u.supervisor_id,
       s.nama AS supervisor_nama
     FROM users u
     LEFT JOIN users s ON u.supervisor_id = s.id
     ${where} 
     ORDER BY FIELD(u.role,'Admin','Manager','Chief CRO','CRO','Visitor'), u.nama ASC`,
    params
  );
  return rows;
}

async function getUserById(id) {
  const [rows] = await pool.query(
    `SELECT 
       u.id, u.username, u.email, u.nama, u.role, u.status, u.supervisor_id,
       s.nama AS supervisor_nama
     FROM users u
     LEFT JOIN users s ON u.supervisor_id = s.id
     WHERE u.id = ? LIMIT 1`,
    [id]
  );
  return rows.length > 0 ? rows[0] : null;
}

async function addUser(data, actor = 'System') {
  if (!data.username || !data.email || !data.password || !data.nama || !data.role) {
    throw new Error("Username, email, password, nama, dan role wajib diisi.");
  }

  const [existing] = await pool.query("SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1", [data.username, data.email]);
  if (existing.length > 0) {
    throw new Error("Username atau email sudah terdaftar.");
  }

  // Cek limit sesuai role yang di-input
  await _checkRoleLimits(data.role, 1);

  const salt = _generateSalt();
  const hash = _hashSHA256(data.password, salt);
  const status = data.status || 'Aktif';

  const [result] = await pool.query(
    "INSERT INTO users (username, email, password, nama, role, status, salt, supervisor_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [data.username, data.email, hash, data.nama, data.role, status, salt, data.supervisor_id || null]
  );

  // ── Event-Sourcing: StaffCreated ──
  await _logStaffEvent('StaffCreated', result.insertId, {
    username: data.username,
    email: data.email,
    nama: data.nama,
    role: data.role,
    status,
    supervisor_id: data.supervisor_id || null,
    created_by: actor
  }, actor);

  return { id: result.insertId, username: data.username, email: data.email, nama: data.nama, role: data.role, status };
}

async function updateUser(id, data, actor = 'System', reqMeta = {}) {
  const [existing] = await pool.query("SELECT id, username, nama, email, role, status FROM users WHERE id = ? LIMIT 1", [id]);
  if (existing.length === 0) throw new Error("User tidak ditemukan.");

  // Jika mengubah role, atau mengaktifkan user yang sebelumnya nonaktif -> cek limit
  const isCurrentlyActive = (existing[0].status.toLowerCase() === 'aktif');
  const willBeActive = (data.status_aktif ? data.status_aktif.toLowerCase() === 'aktif' : isCurrentlyActive);
  
  const currentRole = existing[0].role;
  const willBeRole = data.role ? data.role : currentRole;

  // Kasus butuh validasi limit: 
  // 1. Role berubah ke role baru (status aktif).
  // 2. Role sama, tapi dari nonaktif menjadi aktif.
  const roleChanged = (currentRole.toLowerCase() !== willBeRole.toLowerCase());
  const statusTurnedOn = (!isCurrentlyActive && willBeActive);

  if ((roleChanged && willBeActive) || statusTurnedOn) {
    await _checkRoleLimits(willBeRole, 1);
  }

  const clauses = [];
  const params = [];
  let usernameChanged = false;
  let oldUsername = existing[0].username;
  let newUsername = existing[0].username;
  let passwordChanged = false;

  // Deteksi & update username
  if (data.username && String(data.username).trim() !== '') {
    const cleanUsername = String(data.username).trim().toLowerCase();
    if (cleanUsername !== String(oldUsername).toLowerCase()) {
      const [dupUser] = await pool.query("SELECT id FROM users WHERE username = ? AND id != ? LIMIT 1", [cleanUsername, id]);
      if (dupUser.length > 0) {
        throw new Error("Username sudah digunakan oleh akun lain.");
      }
      clauses.push("username = ?");
      params.push(cleanUsername);
      usernameChanged = true;
      newUsername = cleanUsername;
    }
  }

  // Deteksi & update password jika disertakan
  if (data.password && String(data.password).trim() !== '') {
    const salt = _generateSalt();
    const hash = _hashSHA256(data.password, salt);
    clauses.push("password = ?", "salt = ?");
    params.push(hash, salt);
    passwordChanged = true;
  }

  if (data.nama) { clauses.push("nama = ?"); params.push(data.nama); }
  if (data.email) { clauses.push("email = ?"); params.push(data.email); }
  if (data.role) { clauses.push("role = ?"); params.push(data.role); }
  if (data.status_aktif) { clauses.push("status = ?"); params.push(data.status_aktif); }
  if (data.supervisor_id !== undefined) { clauses.push("supervisor_id = ?"); params.push(data.supervisor_id || null); }

  if (clauses.length === 0) return { success: true };

  params.push(id);
  await pool.query(`UPDATE users SET ${clauses.join(", ")} WHERE id = ?`, params);

  // ── Event-Sourcing: StaffProfileUpdated ──
  await _logStaffEvent('StaffProfileUpdated', id, {
    updated_fields: data,
    previous_role: currentRole,
    previous_status: existing[0].status,
    username_changed: usernameChanged,
    password_changed: passwordChanged,
    updated_by: actor
  }, actor);

  if (statusTurnedOn) {
    await _logStaffEvent('StaffActivated', id, { role: willBeRole, activated_by: actor }, actor);
  } else if (data.status_aktif && data.status_aktif.toLowerCase() === 'nonaktif' && isCurrentlyActive) {
    await _logStaffEvent('StaffDeactivated', id, { role: willBeRole, deactivated_by: actor }, actor);
  }

  // Trigger Notifikasi Security Alert ke Admin CRM jika username atau password diubah
  if (usernameChanged || passwordChanged) {
    try {
      const securityAlert = require('./auth/security-alert.service');
      securityAlert.notifyCredentialChange({
        userId: id,
        oldUsername,
        newUsername,
        isPasswordChanged: passwordChanged,
        actor,
        reqMeta
      }).catch(alertErr => console.warn('[Users] Gagal mengirim alert update kredensial:', alertErr.message));
    } catch (alertErr) {
      console.warn('[Users] Security alert invoke error:', alertErr.message);
    }
  }

  return { success: true, usernameChanged, passwordChanged };
}

async function resetPassword(id, newPassword, actor = 'System', reqMeta = {}) {
  if (!newPassword) throw new Error("Password baru wajib diisi.");

  const [existing] = await pool.query("SELECT id, username, nama, email, role FROM users WHERE id = ? LIMIT 1", [id]);
  if (existing.length === 0) throw new Error("User tidak ditemukan.");

  const salt = _generateSalt();
  const hash = _hashSHA256(newPassword, salt);

  const [result] = await pool.query("UPDATE users SET password = ?, salt = ?, reset_password_token = NULL, reset_password_expires = NULL WHERE id = ?", [hash, salt, id]);
  if (result.affectedRows === 0) throw new Error("User tidak ditemukan.");
  
  // ── Event-Sourcing: StaffPasswordForceReset ──
  await _logStaffEvent('StaffPasswordForceReset', id, { reset_by: actor }, actor);

  // Trigger Notifikasi Security Alert ke Admin CRM
  try {
    const securityAlert = require('./auth/security-alert.service');
    securityAlert.notifyCredentialChange({
      userId: id,
      oldUsername: existing[0].username,
      newUsername: existing[0].username,
      isPasswordChanged: true,
      actor,
      reqMeta
    }).catch(alertErr => console.warn('[Users] Gagal mengirim alert force reset password:', alertErr.message));
  } catch (alertErr) {
    console.warn('[Users] Security alert invoke error:', alertErr.message);
  }

  return { success: true };
}

async function softDeleteUser(id, actor = 'System') {
  const [result] = await pool.query("UPDATE users SET status = 'Nonaktif' WHERE id = ?", [id]);
  if (result.affectedRows === 0) throw new Error("User tidak ditemukan.");

  // ── Event-Sourcing: StaffDeactivated ──
  await _logStaffEvent('StaffDeactivated', id, { deactivated_by: actor }, actor);

  return { success: true };
}

module.exports = {
  listUsers,
  getUserById,
  getRoleQuota,
  addUser,
  updateUser,
  resetPassword,
  softDeleteUser
};

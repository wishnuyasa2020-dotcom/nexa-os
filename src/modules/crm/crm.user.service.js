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

  const dbName = process.env.DB_NAME;
  const [dbRows] = await mainPool.query("SELECT tenant_id FROM tenant_databases WHERE db_name = ?", [dbName]);
  if (dbRows.length === 0) return;
  const tenantId = dbRows[0].tenant_id;

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

async function listUsers(query = {}) {
  const whereParts = [];
  const params = [];

  if (query.role) {
    whereParts.push("LOWER(role) = ?");
    params.push(query.role.toLowerCase());
  }
  if (query.status) {
    whereParts.push("LOWER(status) = ?");
    params.push(query.status.toLowerCase());
  }
  if (query.search) {
    whereParts.push("(nama LIKE ? OR username LIKE ?)");
    params.push(`%${query.search}%`, `%${query.search}%`);
  }

  let where = "";
  if (whereParts.length > 0) {
    where = "WHERE " + whereParts.join(" AND ");
  }

  const [rows] = await pool.query(
    `SELECT id, username, nama, role, status FROM users ${where} ORDER BY FIELD(role,'Admin','Manager','CRO','Visitor'), nama ASC`,
    params
  );
  return rows;
}

async function getUserById(id) {
  const [rows] = await pool.query("SELECT id, username, nama, role, status FROM users WHERE id = ? LIMIT 1", [id]);
  return rows.length > 0 ? rows[0] : null;
}

async function addUser(data) {
  if (!data.username || !data.password || !data.nama || !data.role) {
    throw new Error("Username, password, nama, dan role wajib diisi.");
  }

  const [existing] = await pool.query("SELECT id FROM users WHERE username = ? LIMIT 1", [data.username]);
  if (existing.length > 0) {
    throw new Error("Username sudah terdaftar.");
  }

  // Cek limit sesuai role yang di-input
  await _checkRoleLimits(data.role, 1);

  const salt = _generateSalt();
  const hash = _hashSHA256(data.password, salt);
  const status = data.status || 'aktif';

  const [result] = await pool.query(
    "INSERT INTO users (username, password, nama, role, status, salt) VALUES (?, ?, ?, ?, ?, ?)",
    [data.username, hash, data.nama, data.role, status, salt]
  );

  return { id: result.insertId, username: data.username, nama: data.nama, role: data.role, status };
}

async function updateUser(id, data) {
  const [existing] = await pool.query("SELECT role, status FROM users WHERE id = ? LIMIT 1", [id]);
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
  if (data.nama) { clauses.push("nama = ?"); params.push(data.nama); }
  if (data.role) { clauses.push("role = ?"); params.push(data.role); }
  if (data.status_aktif) { clauses.push("status = ?"); params.push(data.status_aktif); }

  if (clauses.length === 0) return { success: true };

  params.push(id);
  await pool.query(`UPDATE users SET ${clauses.join(", ")} WHERE id = ?`, params);

  return { success: true };
}

async function resetPassword(id, newPassword) {
  if (!newPassword) throw new Error("Password baru wajib diisi.");

  const salt = _generateSalt();
  const hash = _hashSHA256(newPassword, salt);

  const [result] = await pool.query("UPDATE users SET password = ?, salt = ? WHERE id = ?", [hash, salt, id]);
  if (result.affectedRows === 0) throw new Error("User tidak ditemukan.");
  
  return { success: true };
}

async function softDeleteUser(id) {
  const [result] = await pool.query("UPDATE users SET status = 'Nonaktif' WHERE id = ?", [id]);
  if (result.affectedRows === 0) throw new Error("User tidak ditemukan.");
  return { success: true };
}

module.exports = {
  listUsers,
  getUserById,
  addUser,
  updateUser,
  resetPassword,
  softDeleteUser
};

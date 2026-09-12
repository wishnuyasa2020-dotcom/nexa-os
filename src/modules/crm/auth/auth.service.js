'use strict';

const crypto = require('crypto');
const jwt    = require('jsonwebtoken');
const { pool } = require('../../../config/database');

/**
 * Nexa OS — Auth Service
 *
 * Port dari Auth.gs ke Express.
 * Mendukung password lama (SHA256+salt) dan migrasi otomatis ke bcrypt.
 *
 * GAS memakai HMAC-SHA256 custom token. Express menggunakan JWT standar.
 */

// ── Password helpers (kompatibel dengan GAS Auth.gs) ────────────

function _generateSalt() {
  return crypto.randomBytes(10).toString('hex');
}

/**
 * SHA256(password + salt) — sama persis dengan GAS _hashPassword()
 */
function _hashSHA256(password, salt) {
  return crypto
    .createHash('sha256')
    .update(String(password) + String(salt))
    .digest('hex');
}

// ── Token (Kompatibel dengan GAS) ──────────────────────────────────
// Format: base64WebSafe(jsonPayload) + "." + base64WebSafe(hmacSha256(jsonPayload, secret))

function toBase64WebSafe(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64WebSafe(str) {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return Buffer.from(b64, 'base64').toString();
}

function _signJWT(payload) {
  const secret = process.env.JWT_SECRET_KEY;
  if (!secret) throw new Error('JWT_SECRET_KEY belum diset di .env!');
  
  // payload.expires dalam ms (sama dengan GAS)
  if (!payload.expires) {
    payload.expires = Date.now() + 24 * 60 * 60 * 1000;
  }
  
  const payloadStr = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', secret).update(payloadStr).digest();
  
  const payloadB64 = toBase64WebSafe(payloadStr);
  const signatureB64 = toBase64WebSafe(signature);
  
  return payloadB64 + '.' + signatureB64;
}

function verifyJWT(token) {
  const secret = process.env.JWT_SECRET_KEY;
  if (!secret) throw new Error('JWT_SECRET_KEY belum diset di .env!');
  
  const parts = token.split('.');
  if (parts.length !== 2) throw new Error('Invalid token format');
  
  const payloadStr = fromBase64WebSafe(parts[0]);
  const signatureB64 = parts[1];
  
  const expectedSignature = crypto.createHmac('sha256', secret).update(payloadStr).digest();
  const expectedSignatureB64 = toBase64WebSafe(expectedSignature);
  
  if (signatureB64 !== expectedSignatureB64) {
    throw new Error('Invalid signature');
  }
  
  const payload = JSON.parse(payloadStr);
  if (payload.expires < Date.now()) {
    throw new Error('Token expired');
  }
  
  return payload;
}

// ── Auth functions ───────────────────────────────────────────────

/**
 * Login user — kompatibel dengan password lama GAS (SHA256+salt) maupun plaintext.
 */
async function login(username, password) {
  let rows = null;
  let isTenant = false;
  let tenantId = null;
  let activeConn = null;

  // 1. Coba cari di default pool (crmdemo)
  const [[defaultUser]] = await pool.query(
    'SELECT * FROM users WHERE username = ? LIMIT 1',
    [String(username).trim()]
  );
  
  if (defaultUser) {
    rows = defaultUser;
    isTenant = true;
    const { mainPool } = require('../../../config/database');
    try {
      const [[tdb]] = await mainPool.query(
        'SELECT tenant_id FROM tenant_databases WHERE db_name = ? LIMIT 1',
        [process.env.DB_NAME || 'u294320793_crmdemo']
      );
      tenantId = tdb ? tdb.tenant_id : 'crm-demo';
    } catch (_) {
      tenantId = 'crm-demo';
    }
  } else {
    // 2. Jika tidak ketemu, cari di seluruh tenant DB (Multi-tenant login)
    const { mainPool } = require('../../../config/database');
    const mysql = require('mysql2/promise');
    
    const [tenants] = await mainPool.query('SELECT * FROM tenant_databases');
    for (const t of tenants) {
      try {
        const conn = await mysql.createConnection({
          host: t.db_host, port: 3306, user: t.db_user, password: t.db_password, database: t.db_name
        });
        const [[tUser]] = await conn.query('SELECT * FROM users WHERE username = ? LIMIT 1', [String(username).trim()]);
        
        if (tUser) {
          rows = tUser;
          isTenant = true;
          tenantId = t.tenant_id;
          activeConn = conn; // keep connection open for activePeriod query
          break;
        } else {
          await conn.end();
        }
      } catch (err) {
        console.warn('Gagal cek login ke tenant:', t.tenant_id, err.message);
      }
    }
  }

  if (!rows) {
    return { success: false, message: 'Username atau password salah.' };
  }

  const storedPassword = String(rows.password || '').trim();
  const storedSalt     = String(rows.salt     || '').trim();
  const isHashed       = storedPassword.length === 64;

  let isPasswordCorrect = false;

  if (isHashed) {
    // SHA256+salt check (password lama dari GAS)
    isPasswordCorrect = _hashSHA256(password, storedSalt) === storedPassword;
  } else {
    // Plaintext check (user lama yang belum pernah login via GAS baru)
    isPasswordCorrect = String(password).trim() === storedPassword;

    // Auto-migrate ke SHA256+salt
    if (isPasswordCorrect) {
      try {
        const newSalt = _generateSalt();
        const newHash = _hashSHA256(password, newSalt);
        if (isTenant && activeConn) {
          await activeConn.query(
            'UPDATE users SET password = ?, salt = ? WHERE username = ?',
            [newHash, newSalt, String(username).trim()]
          );
        } else {
          await pool.query(
            'UPDATE users SET password = ?, salt = ? WHERE username = ?',
            [newHash, newSalt, String(username).trim()]
          );
        }
        console.log('[Auth] Password migrated for user:', username);
      } catch (migErr) {
        console.warn('[Auth] Gagal migrasi password:', migErr.message);
      }
    }
  }

  if (!isPasswordCorrect) {
    return { success: false, message: 'Username atau password salah.' };
  }

  // Cek status
  if (String(rows.status).trim().toLowerCase() !== 'aktif') {
    return { success: false, message: 'Akun Anda tidak aktif. Hubungi Admin.' };
  }

  // Ambil periode aktif
  let activePeriod = '-';
  try {
    const q = 'SELECT nama_period FROM marketing_period WHERE status = ? ORDER BY created_date DESC LIMIT 1';
    let periodRow;
    if (isTenant && activeConn) {
      const [res] = await activeConn.query(q, ['aktif']);
      periodRow = res[0];
    } else {
      const [res] = await pool.query(q, ['aktif']);
      periodRow = res[0];
    }
    if (periodRow) activePeriod = periodRow.nama_period;
  } catch (_) {}
  
  if (activeConn) {
    await activeConn.end();
  }

  const user = {
    id:       rows.id,
    username: String(rows.username).trim(),
    nama:     String(rows.nama    || '').trim(),
    role:     String(rows.role    || '').trim(),
    tenant_id: isTenant ? tenantId : 'crm-demo',
  };

  const payload = { ...user, selectedPeriod: activePeriod };
  if (isTenant) {
    payload.tenantId = tenantId;
  }
  
  const token = _signJWT(payload);

  return {
    success: true,
    message: 'Login berhasil.',
    user,
    token,
    activePeriod,
  };
}

// ── Lupa Password & Reset Password ──────────────────────────────────────
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER, 
    pass: process.env.SMTP_PASS,
  },
});

async function forgotPassword(email) {
  if (!email) return { success: false, message: 'Email tidak boleh kosong.' };

  const cleanEmail = String(email).trim();
  let targetUser = null;
  let targetPool = pool;

  // 1. Cek di default pool
  const [[user]] = await pool.query('SELECT * FROM users WHERE email = ? LIMIT 1', [cleanEmail]);
  if (user) {
    targetUser = user;
    targetPool = pool;
  } else {
    // 2. Cek lintas tenant
    const { mainPool, getDynamicPool } = require('../../../config/database');
    try {
      const [tenants] = await mainPool.query('SELECT * FROM tenant_databases');
      for (const t of tenants) {
        try {
          const tPool = getDynamicPool({
            host: t.db_host, port: 3306, user: t.db_user, password: t.db_password, database: t.db_name
          });
          const [[found]] = await tPool.query('SELECT * FROM users WHERE email = ? LIMIT 1', [cleanEmail]);
          if (found) {
            targetUser = found;
            targetPool = tPool;
            break;
          }
        } catch (_) {}
      }
    } catch (_) {}
  }

  if (!targetUser) {
    // Return success to prevent email enumeration attack
    return { success: true, message: 'Jika email terdaftar, instruksi reset password telah dikirimkan.' };
  }

  // Buat token 64 hex characters
  const token = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + 3600000; // 1 jam dari sekarang

  // Simpan token ke db
  await targetPool.query(
    'UPDATE users SET reset_password_token = ?, reset_password_expires = ? WHERE id = ?',
    [token, expires, targetUser.id]
  );

  // Rekam CQRS Immutable Event
  try {
    const eventId = `EVT-USR-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    await targetPool.query(
      `INSERT INTO events_log (event_id, aggregate_type, aggregate_id, event_type, payload, actor_id, created_at)
       VALUES (?, 'user', ?, 'PasswordResetRequested', ?, ?, NOW())`,
      [
        eventId,
        String(targetUser.id),
        JSON.stringify({ email: cleanEmail, expires_at: new Date(expires).toISOString() }),
        targetUser.username
      ]
    );
  } catch (evtErr) {
    console.warn('[Auth] Gagal mencatat event PasswordResetRequested:', evtErr.message);
  }

  // Buat link reset password
  const frontendUrl = process.env.FRONTEND_URL || 'https://crm.nexamos.cloud';
  const resetLink = `${frontendUrl}/reset-password?token=${token}`;

  // Kirim email
  try {
    await transporter.sendMail({
      from: `"Nexa CRM" <${process.env.SMTP_USER || 'no-reply@nexa.id'}>`,
      to: cleanEmail,
      subject: 'Reset Password - Nexa CRM',
      html: `
        <h3>Halo ${targetUser.nama || targetUser.username},</h3>
        <p>Kami menerima permintaan untuk mereset password akun Anda di Nexa CRM.</p>
        <p>Silakan klik tautan di bawah ini untuk mengatur password baru:</p>
        <a href="${resetLink}" style="display:inline-block;padding:10px 15px;background:#007BFF;color:#fff;text-decoration:none;border-radius:5px;">Reset Password</a>
        <br><br>
        <p>Tautan ini akan kedaluwarsa dalam 1 jam.</p>
        <p>Jika Anda tidak pernah meminta reset password, abaikan email ini.</p>
      `,
    });
    console.log('[Auth] Forgot password email sent to:', cleanEmail);
  } catch (err) {
    console.error('[Auth] Failed to send email:', err.message);
  }

  return { success: true, message: 'Jika email terdaftar, instruksi reset password telah dikirimkan.' };
}

async function resetPassword(token, newPassword) {
  if (!token || !newPassword) {
    return { success: false, message: 'Token dan password baru wajib diisi.' };
  }

  let targetUser = null;
  let targetPool = pool;

  // 1. Cek di default pool
  const [[user]] = await pool.query(
    'SELECT * FROM users WHERE reset_password_token = ? LIMIT 1',
    [token]
  );

  if (user) {
    targetUser = user;
    targetPool = pool;
  } else {
    // 2. Cek lintas tenant
    const { mainPool, getDynamicPool } = require('../../../config/database');
    try {
      const [tenants] = await mainPool.query('SELECT * FROM tenant_databases');
      for (const t of tenants) {
        try {
          const tPool = getDynamicPool({
            host: t.db_host, port: 3306, user: t.db_user, password: t.db_password, database: t.db_name
          });
          const [[found]] = await tPool.query('SELECT * FROM users WHERE reset_password_token = ? LIMIT 1', [token]);
          if (found) {
            targetUser = found;
            targetPool = tPool;
            break;
          }
        } catch (_) {}
      }
    } catch (_) {}
  }

  if (!targetUser) {
    return { success: false, message: 'Token tidak valid atau sudah tidak berlaku.' };
  }

  if (Date.now() > Number(targetUser.reset_password_expires)) {
    return { success: false, message: 'Token sudah kedaluwarsa.' };
  }

  // Generate salt dan hash password baru dengan metode default Nexa
  const newSalt = _generateSalt();
  const newHash = _hashSHA256(newPassword, newSalt);

  await targetPool.query(
    'UPDATE users SET password = ?, salt = ?, reset_password_token = NULL, reset_password_expires = NULL WHERE id = ?',
    [newHash, newSalt, targetUser.id]
  );

  // Rekam CQRS Immutable Event
  try {
    const eventId = `EVT-USR-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    await targetPool.query(
      `INSERT INTO events_log (event_id, aggregate_type, aggregate_id, event_type, payload, actor_id, created_at)
       VALUES (?, 'user', ?, 'PasswordResetCompleted', ?, ?, NOW())`,
      [
        eventId,
        String(targetUser.id),
        JSON.stringify({ username: targetUser.username }),
        targetUser.username
      ]
    );
  } catch (evtErr) {
    console.warn('[Auth] Gagal mencatat event PasswordResetCompleted:', evtErr.message);
  }

  // Kirim Notifikasi Keamanan ke Admin CRM (Asynchronous)
  try {
    const securityAlert = require('./security-alert.service');
    securityAlert.notifyCredentialChange({
      dbPool: targetPool,
      userId: targetUser.id,
      oldUsername: targetUser.username,
      newUsername: targetUser.username,
      isPasswordChanged: true,
      actor: `Self-Service (via Reset Token)`,
      reqMeta
    }).catch(alertErr => console.warn('[Auth] Gagal mengirim alert reset password:', alertErr.message));
  } catch (alertErr) {
    console.warn('[Auth] Security alert invoke error:', alertErr.message);
  }

  return { success: true, message: 'Password berhasil diubah. Silakan login kembali.' };
}

async function getProfile(username) {
  const q = `
    SELECT 
      u.id, 
      u.username, 
      u.nama, 
      u.role, 
      u.status, 
      u.email, 
      u.supervisor_id,
      s.nama AS supervisor_nama
    FROM users u
    LEFT JOIN users s ON u.supervisor_id = s.id
    WHERE u.username = ?
    LIMIT 1
  `;
  const [[user]] = await pool.query(q, [username]);
  return user || null;
}

async function updateProfile(currentUsername, data = {}, actor = null, reqMeta = {}) {
  const [[user]] = await pool.query(
    'SELECT id, username, nama, email, role, status FROM users WHERE username = ? LIMIT 1',
    [currentUsername]
  );
  if (!user) return { success: false, message: 'Pengguna tidak ditemukan.' };

  const clauses = [];
  const params = [];
  let isUsernameChanged = false;
  let oldUsername = user.username;
  let newUsername = user.username;

  // 1. Cek perubahan nama
  if (data.nama && String(data.nama).trim() !== '') {
    clauses.push('nama = ?');
    params.push(String(data.nama).trim());
  }

  // 2. Cek perubahan email
  if (data.email && String(data.email).trim() !== '') {
    const cleanEmail = String(data.email).trim();
    // Cek duplikasi email jika email berubah
    if (cleanEmail.toLowerCase() !== String(user.email || '').toLowerCase()) {
      const [[dupEmail]] = await pool.query(
        'SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1',
        [cleanEmail, user.id]
      );
      if (dupEmail) {
        return { success: false, message: 'Alamat email sudah digunakan oleh akun lain.' };
      }
      clauses.push('email = ?');
      params.push(cleanEmail);
    }
  }

  // 3. Cek perubahan username (Deteksi mutasi kredensial)
  if (data.username && String(data.username).trim() !== '') {
    const cleanUsername = String(data.username).trim().toLowerCase();
    if (cleanUsername !== user.username.toLowerCase()) {
      const [[dupUser]] = await pool.query(
        'SELECT id FROM users WHERE username = ? AND id != ? LIMIT 1',
        [cleanUsername, user.id]
      );
      if (dupUser) {
        return { success: false, message: 'Username sudah digunakan oleh akun lain.' };
      }
      clauses.push('username = ?');
      params.push(cleanUsername);
      isUsernameChanged = true;
      newUsername = cleanUsername;
    }
  }

  if (clauses.length === 0) {
    return { success: true, message: 'Tidak ada perubahan data.', user };
  }

  params.push(user.id);
  await pool.query(`UPDATE users SET ${clauses.join(', ')} WHERE id = ?`, params);

  // Ambil profil yang telah diperbarui
  const [[updatedUser]] = await pool.query(
    'SELECT id, username, nama, role, status, email FROM users WHERE id = ? LIMIT 1',
    [user.id]
  );

  // Rekam CQRS Immutable Event ke events_log
  try {
    const eventId = `EVT-USR-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    await pool.query(
      `INSERT INTO events_log (event_id, aggregate_type, aggregate_id, event_type, payload, actor_id, created_at)
       VALUES (?, 'user', ?, 'UserProfileUpdated', ?, ?, NOW())`,
      [
        eventId,
        String(user.id),
        JSON.stringify({ 
          oldUsername, 
          newUsername, 
          isUsernameChanged, 
          updatedFields: data 
        }),
        actor || currentUsername
      ]
    );
  } catch (evtErr) {
    console.warn('[Auth] Gagal mencatat event UserProfileUpdated:', evtErr.message);
  }

  // Trigger Security Alert jika username berubah
  if (isUsernameChanged) {
    try {
      const securityAlert = require('./security-alert.service');
      securityAlert.notifyCredentialChange({
        userId: user.id,
        oldUsername,
        newUsername,
        isPasswordChanged: false,
        actor: actor || currentUsername,
        reqMeta
      }).catch(alertErr => console.warn('[Auth] Gagal mengirim alert username changed:', alertErr.message));
    } catch (alertErr) {
      console.warn('[Auth] Security alert invoke error:', alertErr.message);
    }
  }

  return { success: true, message: 'Profil berhasil diperbarui.', user: updatedUser, usernameChanged: isUsernameChanged };
}

async function changePassword(username, oldPassword, newPassword, actor = null, reqMeta = {}) {
  const [[user]] = await pool.query(
    'SELECT id, username, nama, password, salt, role FROM users WHERE username = ? LIMIT 1',
    [username]
  );
  if (!user) return { success: false, message: 'User tidak ditemukan.' };

  const isOldValid = _hashSHA256(oldPassword, user.salt || '') === user.password;
  if (!isOldValid) return { success: false, message: 'Password lama tidak sesuai.' };

  const newSalt = _generateSalt();
  const newHash = _hashSHA256(newPassword, newSalt);

  await pool.query(
    'UPDATE users SET password = ?, salt = ?, reset_password_token = NULL, reset_password_expires = NULL WHERE id = ?',
    [newHash, newSalt, user.id]
  );

  // Rekam CQRS Immutable Event ke events_log
  try {
    const eventId = `EVT-USR-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    await pool.query(
      `INSERT INTO events_log (event_id, aggregate_type, aggregate_id, event_type, payload, actor_id, created_at)
       VALUES (?, 'user', ?, 'UserPasswordChangedSelf', ?, ?, NOW())`,
      [
        eventId,
        String(user.id),
        JSON.stringify({ username: user.username, role: user.role }),
        actor || username
      ]
    );
  } catch (evtErr) {
    console.warn('[Auth] Gagal mencatat event UserPasswordChangedSelf:', evtErr.message);
  }

  // Trigger Security Alert ke Email Admin CRM
  try {
    const securityAlert = require('./security-alert.service');
    securityAlert.notifyCredentialChange({
      userId: user.id,
      oldUsername: user.username,
      newUsername: user.username,
      isPasswordChanged: true,
      actor: actor || user.nama || user.username || 'Self-Service',
      reqMeta
    }).catch(alertErr => console.warn('[Auth] Gagal mengirim alert ganti password:', alertErr.message));
  } catch (alertErr) {
    console.warn('[Auth] Security alert invoke error:', alertErr.message);
  }

  return { success: true, message: 'Password berhasil diubah.' };
}

module.exports = { login, verifyJWT, forgotPassword, resetPassword, getProfile, updateProfile, changePassword };


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
  return crypto.randomBytes(16).toString('hex');
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
  const [[rows]] = await pool.query(
    'SELECT * FROM users WHERE username = ? LIMIT 1',
    [String(username).trim()]
  );

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
        await pool.query(
          'UPDATE users SET password = ?, salt = ? WHERE username = ?',
          [newHash, newSalt, String(username).trim()]
        );
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
    const [[periodRow]] = await pool.query(
      'SELECT nama_period FROM marketing_period WHERE status = ? ORDER BY created_date DESC LIMIT 1',
      ['aktif']
    );
    if (periodRow) activePeriod = periodRow.nama_period;
  } catch (_) {}

  const user = {
    username: String(rows.username).trim(),
    nama:     String(rows.nama    || '').trim(),
    role:     String(rows.role    || '').trim(),
  };

  const token = _signJWT({ ...user, selectedPeriod: activePeriod });

  return {
    success: true,
    message: 'Login berhasil.',
    user,
    token,
    activePeriod,
  };
}

module.exports = { login, verifyJWT };

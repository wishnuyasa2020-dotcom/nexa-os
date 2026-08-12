'use strict';

const { verifyJWT } = require('../modules/crm/auth/auth.service');

/**
 * Middleware — verifikasi JWT token dari header Authorization.
 * Attach payload ke req.user agar controller bisa baca data user.
 *
 * Usage:
 *   router.get('/protected', requireAuth, ctrl.handler);
 */
function requireAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ status: 'error', message: 'Token tidak ditemukan. Silakan login.' });
  }

  try {
    req.user = verifyJWT(token);
    next();
  } catch (err) {
    console.error('JWT Verification failed:', err.message);
    return res.status(401).json({ status: 'error', message: 'Token tidak valid atau sudah kedaluwarsa.' });
  }
}

module.exports = { requireAuth };

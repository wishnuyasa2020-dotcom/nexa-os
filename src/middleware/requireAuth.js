'use strict';

const { verifyJWT } = require('../modules/crm/auth/auth.service');

/**
 * Middleware — verifikasi JWT token dari header Authorization.
 * Attach payload ke req.user agar controller bisa baca data user.
 *
 * Usage:
 *   router.get('/protected', requireAuth, ctrl.handler);
 */
const { tenantStorage } = require('../config/database');

function requireAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ status: 'error', message: 'Token tidak ditemukan. Silakan login.' });
  }

  try {
    req.user = verifyJWT(token);
    
    // Inject tenantStorage jika tenantId ada di payload
    const tenantId = req.user.tenantId || null;
    tenantStorage.run(tenantId, () => {
      next();
    });
  } catch (err) {
    console.error('JWT Verification failed:', err.message);
    const partsCount = (token || '').split('.').length;
    return res.status(401).json({ status: 'error', message: 'Token tidak valid. Detail: ' + err.message + ' | Parts: ' + partsCount });
  }
}

module.exports = { requireAuth };
